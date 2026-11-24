import { teamKey } from '../shared/competitions';
import type { FitOptions, GoalModel, HistoricalMatch, Parameters, Prediction } from '../shared/types';
import { rhoBounds, scoreDistribution, tau } from './markets';

const DAY = 86_400_000;
export const defaultOptions: FitOptions = { halfLifeDays: 180, ridge: 0.015, xgWeight: 0 };
export function validateHistory(rows: HistoricalMatch[]): void {
  if (!Array.isArray(rows) || rows.length > 8000) throw new Error('Máximo 8.000 partidos por competición.');
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r.id !== 'string' || !r.id || typeof r.home !== 'string' || typeof r.away !== 'string' || !r.home.trim() || !r.away.trim() || r.home.length > 100 || r.away.length > 100 || teamKey(r.home) === teamKey(r.away)) throw new Error('Identidad de partido inválida.');
    if (!Number.isFinite(Date.parse(r.date)) || !Number.isFinite(Date.parse(r.availableAt)) || Date.parse(r.availableAt) < Date.parse(r.date)) throw new Error('Fecha de disponibilidad del resultado inválida.');
    if (![r.homeGoals, r.awayGoals].every(x => Number.isInteger(x) && x >= 0 && x <= 30)) throw new Error('Marcador inválido.');
    for (const x of [r.homeXg, r.awayXg]) if (x !== undefined && (!Number.isFinite(x) || x < 0 || x > 30)) throw new Error('xG inválido.');
    if (r.closingOdds && (!Array.isArray(r.closingOdds) || r.closingOdds.length !== 3 || r.closingOdds.some(x => !Number.isFinite(x) || x <= 1))) throw new Error('Cuotas de cierre inválidas.');
    const key = `${r.date}|${teamKey(r.home)}|${teamKey(r.away)}`;
    if (seen.has(r.id) || seen.has(key)) throw new Error('Hay partidos duplicados.');
    seen.add(r.id); seen.add(key);
  }
}
function rates(parameters: Parameters, home: string, away: string): [number, number] {
  if (!Object.hasOwn(parameters.attack, home) || !Object.hasOwn(parameters.attack, away)) throw new Error('Equipo sin histórico: revisa su nombre o configura un alias.');
  return [Math.exp(parameters.intercept + parameters.homeAdvantage + parameters.attack[home] + parameters.defence[away]), Math.exp(parameters.intercept + parameters.attack[away] + parameters.defence[home])];
}

/** Máxima verosimilitud regularizada y ponderada: ataque, defensa, localía y rho conjuntos. */
function estimate(rows: HistoricalMatch[], asOf: number, options: FitOptions, useXg: boolean): { parameters: Parameters; rho: number } {
  const data = useXg ? rows.filter(r => r.homeXg !== undefined && r.awayXg !== undefined) : rows;
  const teams = [...new Set(rows.flatMap(r => [teamKey(r.home), teamKey(r.away)]))].sort();
  const ids = new Map(teams.map((t, i) => [t, i])); const n = teams.length;
  const obs = data.map(r => ({ h: ids.get(teamKey(r.home))!, a: ids.get(teamKey(r.away))!, x: useXg ? r.homeXg! : r.homeGoals, y: useXg ? r.awayXg! : r.awayGoals, w: 2 ** (-(asOf - Date.parse(r.date)) / DAY / options.halfLifeDays) }));
  const weight = obs.reduce((s, o) => s + o.w, 0);
  const avgH = obs.reduce((s, o) => s + o.w * o.x, 0) / weight;
  const avgA = obs.reduce((s, o) => s + o.w * o.y, 0) / weight;
  const rhoIndex = 2 * n + 2; const p = new Float64Array(rhoIndex + 1);
  p[0] = Math.log(Math.max(0.2, avgA)); p[1] = Math.log(Math.max(0.2, avgH) / Math.max(0.2, avgA));
  const m = new Float64Array(p.length), v = new Float64Array(p.length);
  for (let step = 1; step <= 180; step++) {
    const grad = new Float64Array(p.length);
    // La proyección garantiza tau > 0 para todos los emparejamientos de equipos conocidos.
    let lo = -0.3, hi = 0.3;
    for (let h = 0; h < n; h++) for (let a = 0; a < n; a++) if (h !== a) {
      const lh = Math.exp(p[0] + p[1] + p[2 + h] + p[2 + n + a]);
      const la = Math.exp(p[0] + p[2 + a] + p[2 + n + h]);
      const b = rhoBounds(lh, la); lo = Math.max(lo, b[0] + 1e-4); hi = Math.min(hi, b[1] - 1e-4);
    }
    p[rhoIndex] = useXg ? 0 : Math.max(lo, Math.min(hi, p[rhoIndex]));
    for (const o of obs) {
      const lh = Math.exp(p[0] + p[1] + p[2 + o.h] + p[2 + n + o.a]);
      const la = Math.exp(p[0] + p[2 + o.a] + p[2 + n + o.h]);
      let dh = lh - o.x, da = la - o.y, dr = 0; const rho = p[rhoIndex];
      if (!useXg) {
        const t = tau(o.x, o.y, lh, la, rho);
        if (o.x === 0 && o.y === 0) { dh += lh * la * rho / t; da += lh * la * rho / t; dr = lh * la / t; }
        else if (o.x === 0 && o.y === 1) { dh -= lh * rho / t; dr = -lh / t; }
        else if (o.x === 1 && o.y === 0) { da -= la * rho / t; dr = -la / t; }
        else if (o.x === 1 && o.y === 1) dr = 1 / t;
      }
      const w = o.w / weight;
      grad[0] += w * (dh + da); grad[1] += w * dh;
      grad[2 + o.h] += w * dh; grad[2 + n + o.a] += w * dh;
      grad[2 + o.a] += w * da; grad[2 + n + o.h] += w * da; grad[rhoIndex] += w * dr;
    }
    for (let k = 0; k < p.length; k++) {
      const g = grad[k] + (k >= 2 ? options.ridge * p[k] : 0);
      m[k] = 0.9 * m[k] + 0.1 * g; v[k] = 0.999 * v[k] + 0.001 * g * g;
      p[k] -= 0.025 * (m[k] / (1 - 0.9 ** step)) / (Math.sqrt(v[k] / (1 - 0.999 ** step)) + 1e-8);
      p[k] = Math.max(k < 2 ? -1.5 : -2, Math.min(k < 2 ? 1.5 : 2, p[k]));
    }
    const meanA = teams.reduce((s, _, i) => s + p[2 + i], 0) / n;
    const meanD = teams.reduce((s, _, i) => s + p[2 + n + i], 0) / n;
    teams.forEach((_, i) => { p[2 + i] -= meanA; p[2 + n + i] -= meanD; }); p[0] += meanA + meanD;
  }
  const parameters: Parameters = { intercept: p[0], homeAdvantage: p[1], attack: Object.create(null), defence: Object.create(null) };
  teams.forEach((t, i) => { parameters.attack[t] = p[2 + i]; parameters.defence[t] = p[2 + n + i]; });
  return { parameters, rho: p[rhoIndex] };
}
/** Reajusta rho unidimensionalmente para las intensidades finales, incluido un posible conjunto con xG. */
function fitRho(rows: HistoricalMatch[], model: GoalModel, asOf: number): number {
  let low = -0.3, high = 0.3;
  const teams = Object.keys(model.teamCounts);
  for (const home of teams) for (const away of teams) if (home !== away) { const [h, a] = modelRates(model, home, away); const b = rhoBounds(h, a); low = Math.max(low, b[0]); high = Math.min(high, b[1]); }
  const pairs = rows.map(r => { const [h, a] = modelRates(model, teamKey(r.home), teamKey(r.away)); return { r, h, a, w: 2 ** (-(asOf - Date.parse(r.date)) / DAY / model.options.halfLifeDays) }; });
  const loss = (rho: number) => pairs.reduce((s, { r, h, a, w }) => s - w * Math.log(tau(r.homeGoals, r.awayGoals, h, a, rho)), 0) + model.options.ridge * pairs.reduce((s, x) => s + x.w, 0) * rho * rho / 2;
  for (let i = 0; i < 45; i++) { const a = low + (high - low) / 3, b = high - (high - low) / 3; if (loss(a) < loss(b)) high = b; else low = a; }
  return (low + high) / 2;
}
export function fitModel(input: HistoricalMatch[], asOf: string, options: FitOptions = defaultOptions, source = 'Importación'): GoalModel {
  validateHistory(input);
  const now = Date.parse(asOf);
  if (!Number.isFinite(now) || !Number.isFinite(options.halfLifeDays) || options.halfLifeDays < 30 || options.halfLifeDays > 1000 || !Number.isFinite(options.ridge) || options.ridge <= 0 || options.ridge > 1 || ![0, 0.25, 0.5].includes(options.xgWeight)) throw new Error('Configuración del modelo inválida.');
  const rows = input.filter(r => Date.parse(r.availableAt) < now && Date.parse(r.date) < now);
  if (rows.length < 60) throw new Error('Se necesitan al menos 60 resultados disponibles antes del corte.');
  const teamCounts: Record<string, number> = Object.create(null);
  for (const r of rows) for (const t of [teamKey(r.home), teamKey(r.away)]) teamCounts[t] = (teamCounts[t] ?? 0) + 1;
  if (Object.keys(teamCounts).length > 60) throw new Error('Demasiados equipos: importa una sola competición.');
  const goal = estimate(rows, now, options, false);
  const w = rows.map(r => 2 ** (-(now - Date.parse(r.date)) / DAY / options.halfLifeDays));
  const model: GoalModel = { version: 'dc-2', options, parameters: goal.parameters, rho: goal.rho, asOf, lastResultAt: rows.map(r => r.availableAt).sort().at(-1)!, sampleSize: rows.length, effectiveSampleSize: w.reduce((s, x) => s + x, 0) ** 2 / w.reduce((s, x) => s + x * x, 0), teamCounts, trainingSource: source };
  if (options.xgWeight > 0) {
    const xgRows = rows.filter(r => r.homeXg !== undefined && r.awayXg !== undefined);
    if (xgRows.length < rows.length * 0.8 || Object.keys(teamCounts).some(t => xgRows.filter(r => teamKey(r.home) === t || teamKey(r.away) === t).length < 5)) throw new Error('Cobertura xG insuficiente para este candidato.');
    model.xgParameters = estimate(rows, now, options, true).parameters;
  }
  model.rho = fitRho(rows, model, now);
  return model;
}
export function modelRates(model: GoalModel, home: string, away: string): [number, number] {
  const g = rates(model.parameters, teamKey(home), teamKey(away));
  if (!model.xgParameters || model.options.xgWeight === 0) return g;
  const xg = rates(model.xgParameters, teamKey(home), teamKey(away)), w = model.options.xgWeight;
  return [Math.exp((1 - w) * Math.log(g[0]) + w * Math.log(xg[0])), Math.exp((1 - w) * Math.log(g[1]) + w * Math.log(xg[1]))];
}
export function predict(model: GoalModel, home: string, away: string, expanded = true): Prediction {
  if (teamKey(home) === teamKey(away)) throw new Error('Los equipos deben ser distintos.');
  if ([home, away].some(t => !Object.hasOwn(model.teamCounts, teamKey(t)) || model.teamCounts[teamKey(t)] < 5)) throw new Error('Muestra insuficiente: cada equipo necesita 5 partidos como mínimo.');
  const [h, a] = modelRates(model, home, away); const result = scoreDistribution(h, a, model.rho, expanded);
  if ([home, away].some(t => model.teamCounts[teamKey(t)] < 20)) result.warnings.push('Muestra corta para uno de los equipos.');
  return result;
}
