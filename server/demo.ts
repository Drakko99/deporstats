import type { Analysis, Fixture, GoalModel, HistoricalMatch } from '../shared/types';
import { competitions } from '../shared/competitions';
import { fitModel, predict } from './model';

const teams = [
  ['Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Athletic Club', 'Real Sociedad', 'Villarreal', 'Real Betis', 'Valencia'],
  ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Newcastle', 'Tottenham', 'Aston Villa', 'Brighton'],
  ['Bayern Munich', 'Dortmund', 'Leverkusen', 'Leipzig', 'Frankfurt', 'Stuttgart', 'Freiburg', 'Wolfsburg'],
  ['Inter', 'Napoli', 'Milan', 'Juventus', 'Roma', 'Atalanta', 'Lazio', 'Fiorentina'],
  ['PSG', 'Marseille', 'Monaco', 'Lille', 'Lyon', 'Nice', 'Rennes', 'Lens'],
];
function random(seed: number) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }
export function demoHistory(league = 0): HistoricalMatch[] {
  const rng = random(723 + league), names = teams[league];
  const count = (lambda: number) => { let p = 1, k = 0; do { p *= rng(); k++; } while (p > Math.exp(-lambda)); return k - 1; };
  const rows: HistoricalMatch[] = [];
  for (let round = 0; round < 6; round++) for (let h = 0; h < 8; h++) for (let a = 0; a < 8; a++) if (h !== a) {
    const day = rows.length; const date = new Date(Date.UTC(2024, 0, 1) + day * 86400000).toISOString();
    const lh = Math.exp(0.1 + 0.25 + (7 - h) * 0.09 - (7 - a) * 0.04), la = Math.exp(0.1 + (7 - a) * 0.09 - (7 - h) * 0.04);
    rows.push({ id: `synthetic-${league}-${day}`, date, availableAt: new Date(Date.parse(date) + 3 * 3600000).toISOString(), home: names[h], away: names[a], homeGoals: count(lh), awayGoals: count(la), homeXg: lh * (0.6 + rng() * 0.8), awayXg: la * (0.6 + rng() * 0.8) });
  }
  return rows;
}
const models = new Map<number, GoalModel>();
export function demoFixtures(): Fixture[] {
  const start = new Date(); start.setUTCHours(18, 0, 0, 0);
  return teams.flatMap((names, league) => [0, 1].map(i => ({ id: `demo-${league}-${i}`, home: names[i * 2], away: names[i * 2 + 1], startsAt: new Date(start.getTime() + (league % 3) * 86400000 + i * 7200000 + (start.getTime() + (league % 3) * 86400000 + i * 7200000 <= Date.now() ? 86400000 : 0)).toISOString(), competition: competitions[league].id, competitionName: competitions[league].name, demo: true, status: 0 })));
}
export function demoAnalysis(fixture: Fixture): Analysis {
  const league = +fixture.id.split('-')[1];
  if (!models.has(league)) models.set(league, fitModel(demoHistory(league), '2025-01-01T00:00:00.000Z', undefined, 'Datos sintéticos de demostración'));
  const model = models.get(league)!; const prediction = predict(model, fixture.home, fixture.away);
  // Precios exclusivamente sintéticos para explorar diferencias positivas y negativas.
  const quotes = prediction.markets.filter(m => m.fairOdds != null && m.fairOdds >= 1.02 && m.fairOdds <= 10000).map((m, i) => ({ marketKey: m.key, odds: Math.max(1.01, Math.round(m.fairOdds! * (i === league % 3 ? 1.09 : m.probability >= 0.75 && m.probability <= 0.95 ? 1.035 : 0.92) * 100) / 100), changedAt: null, retrievedAt: new Date().toISOString(), bookmaker: 'Cuota de ejemplo', demo: true }));
  return { fixture, prediction, quotes, comparisonEligible: true, modelInfo: { sampleSize: model.sampleSize, effectiveSampleSize: model.effectiveSampleSize, lastResultAt: model.lastResultAt, options: model.options, evaluated: 0 }, messages: ['Partido, histórico y cuotas simulados. No corresponden a una oferta de Winamax.'] };
}
