import { buildMarkets } from './expanded-markets';
import type { Prediction, Triple } from '../shared/types';

/** El margen se elimina de un mercado completo y mutuamente excluyente. */
export function removeMargin(odds: Triple): Triple {
  if (odds.some(o => !Number.isFinite(o) || o <= 1)) throw new Error('Cuotas decimales inválidas.');
  const sum = odds.reduce((s, o) => s + 1 / o, 0);
  return odds.map(o => (1 / o) / sum) as Triple;
}
export function fairOdds(win: number, push = 0): number | null {
  if (![win, push].every(Number.isFinite) || win < 0 || push < 0 || win + push > 1 + 1e-9) throw new Error('Probabilidades inválidas.');
  return win > 0 ? (1 - push) / win : null;
}
/** Retorno neto por unidad, incluyendo devolución de la apuesta. */
export function expectedValue(win: number, odds: number, push = 0): number {
  fairOdds(win, push);
  if (!Number.isFinite(odds) || odds <= 1) throw new Error('Cuota inválida.');
  return win * odds + push - 1;
}
export function rhoBounds(home: number, away: number): [number, number] {
  return [Math.max(-1 / home, -1 / away) + 1e-7, Math.min(1, 1 / (home * away)) - 1e-7];
}
export function tau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}
/** Amplía la cola hasta que la masa omitida es < 1e-12 por equipo. */
function poisson(rate: number): number[] {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 20) throw new Error('Tasa de goles fuera del dominio del modelo.');
  const mass = [Math.exp(-rate)]; let sum = mass[0];
  for (let k = 1; (k < 2 || 1 - sum > 1e-12) && k < 200; k++) { mass.push(mass[k - 1] * rate / k); sum += mass[k]; }
  return mass;
}
export function scoreDistribution(homeRate: number, awayRate: number, rho: number, expanded = true): Prediction {
  if (!Number.isFinite(rho)) throw new Error('Dependencia inválida.');
  const h = poisson(homeRate), a = poisson(awayRate);
  const bounds = rhoBounds(homeRate, awayRate);
  const usedRho = Math.max(bounds[0], Math.min(bounds[1], rho));
  const matrix = h.map((p, i) => a.map((q, j) => p * q * tau(i, j, homeRate, awayRate, usedRho)));
  const total = matrix.flat().reduce((s, v) => s + v, 0);
  for (const row of matrix) for (let j = 0; j < row.length; j++) row[j] /= total;
  const markets = buildMarkets(matrix, expanded);
  return { homeRate, awayRate, rho: usedRho, rhoAdjusted: usedRho !== rho, matrix, markets, warnings: usedRho !== rho ? ['Dependencia ajustada al dominio de este partido.'] : [] };
}
