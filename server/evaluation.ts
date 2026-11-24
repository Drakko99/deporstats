import type { Evaluation, FitOptions, HistoricalMatch, ModelArtifact, Triple } from '../shared/types';
import { fitModel, predict, validateHistory } from './model';
import { removeMargin, scoreDistribution } from './markets';

export function scoring(p: Triple, result: number): { logLoss: number; brier: number } {
  if (![0, 1, 2].includes(result) || p.some(x => !Number.isFinite(x) || x < 0 || x > 1) || Math.abs(p.reduce((s, x) => s + x, 0) - 1) > 1e-6) throw new Error('Predicción de evaluación inválida.');
  return { logLoss: -Math.log(Math.max(1e-15, p[result])), brier: p.reduce((s, x, i) => s + (x - Number(i === result)) ** 2, 0) };
}
const probabilities = (p: ReturnType<typeof predict>) => p.markets.slice(0, 3).map(m => m.probability) as Triple;
const outcome = (r: HistoricalMatch) => r.homeGoals > r.awayGoals ? 0 : r.homeGoals === r.awayGoals ? 1 : 2;

/** Ajusta hiperparámetros en validación, congela la elección y mide bloques de prueba futuros. */
export function trainAndEvaluate(input: HistoricalMatch[], competition: string, asOf: string, source: string): ModelArtifact {
  validateHistory(input);
  const rows = input.filter(r => Date.parse(r.availableAt) < Date.parse(asOf)).sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(rows.map(r => r.date.slice(0, 10)))];
  if (rows.length < 180 || days.length < 30) throw new Error('Importa al menos 180 partidos terminados repartidos en 30 fechas para separar entrenamiento, validación y prueba.');
  const validationStart = days[Math.floor(days.length * 0.6)] + 'T00:00:00.000Z';
  const testStart = days[Math.floor(days.length * 0.8)] + 'T00:00:00.000Z';
  const validation = rows.filter(r => r.date >= validationStart && r.availableAt < testStart);
  const test = rows.filter(r => r.date >= testStart);
  if (validation.length < 20 || test.length < 20) throw new Error('No hay suficientes partidos en los bloques de validación y prueba.');
  const candidates: Evaluation['candidates'] = [];
  for (const halfLifeDays of [90, 180, 365]) for (const xgWeight of [0, 0.25, 0.5]) {
    const options: FitOptions = { halfLifeDays, ridge: 0.015, xgWeight };
    try {
      const model = fitModel(rows, validationStart, options, source); let loss = 0, count = 0;
      for (const r of validation) { try { loss += scoring(probabilities(predict(model, r.home, r.away, false)), outcome(r)).logLoss; count++; } catch { /* Equipos sin muestra, sin inventar fuerzas. */ } }
      if (count >= 20) candidates.push({ options, logLoss: loss / count, count });
    } catch { /* Un candidato xG sin cobertura no participa en la selección. */ }
  }
  // Compara sobre la cobertura común máxima; no premia omitir partidos difíciles.
  const maxCount = Math.max(0, ...candidates.map(c => c.count));
  const eligible = candidates.filter(c => c.count === maxCount).sort((a, b) => a.logLoss - b.logLoss);
  if (!eligible.length) throw new Error('No se pudo validar un modelo con muestra suficiente.');
  const selected = eligible[0].options;
  let loss = 0, brier = 0, baseLoss = 0, baseBrier = 0, marketLoss = 0, marketMatches = 0, count = 0, skipped = 0;
  const bins = Array.from({ length: 5 }, (_, i) => ({ low: i / 5, high: (i + 1) / 5, count: 0, forecast: 0, observed: 0 }));
  const folds: Evaluation['folds'] = [];
  const testDays = [...new Set(test.map(r => r.date.slice(0, 10)))];
  const blockSize = Math.ceil(testDays.length / 4);
  for (let i = 0; i < testDays.length; i += blockSize) {
    const cutoff = testDays[i] + 'T00:00:00.000Z'; const end = testDays[i + blockSize] ?? '9999';
    const training = rows.filter(r => r.availableAt < cutoff);
    const model = fitModel(training, cutoff, selected, source);
    const baseline = probabilities(scoreDistribution(Math.max(0.05, training.reduce((s, r) => s + r.homeGoals, 0) / training.length), Math.max(0.05, training.reduce((s, r) => s + r.awayGoals, 0) / training.length), 0, false));
    const fold = { asOf: cutoff, trainedThrough: model.lastResultAt, count: 0 };
    for (const r of test.filter(r => r.date >= cutoff && r.date.slice(0, 10) < end)) {
      let p: Triple;
      try { p = probabilities(predict(model, r.home, r.away, false)); } catch { skipped++; continue; }
      const result = outcome(r), s = scoring(p, result), b = scoring(baseline, result);
      loss += s.logLoss; brier += s.brier; baseLoss += b.logLoss; baseBrier += b.brier; count++; fold.count++;
      p.forEach((x, k) => { const bin = bins[Math.min(4, Math.floor(x * 5))]; bin.count++; bin.forecast += x; bin.observed += Number(k === result); });
      if (r.closingOdds) { marketLoss += scoring(removeMargin(r.closingOdds), result).logLoss; marketMatches++; }
    }
    folds.push(fold);
  }
  if (!count) throw new Error('La prueba no contiene equipos con suficiente histórico.');
  const evaluation: Evaluation = { selected, candidates, validationMatches: maxCount, testMatches: count, skipped, logLoss: loss / count, brier: brier / count, baselineLogLoss: baseLoss / count, baselineBrier: baseBrier / count, marketLogLoss: marketMatches ? marketLoss / marketMatches : null, marketMatches, bins: bins.map(b => ({ ...b, forecast: b.count ? b.forecast / b.count : 0, observed: b.count ? b.observed / b.count : 0 })), testFrom: test[0].date, testTo: test.at(-1)!.date, folds };
  return { competition, model: fitModel(rows, asOf, selected, source), evaluation, savedAt: asOf, source, aliases: {} };
}
