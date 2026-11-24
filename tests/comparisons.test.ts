import { test } from 'node:test';
import assert from 'node:assert/strict';
import { opportunities, priceDifference, selectHighlights, isMatchToday } from '../shared/comparisons';
import { demoAnalysis, demoFixtures } from '../server/demo';
import type { Analysis, Market } from '../shared/types';

function analysis(markets: Array<Market & { offered: number }>, id = 'test'): Analysis {
  const base = demoAnalysis(demoFixtures()[0]);
  return { ...base, fixture: { ...base.fixture, id, startsAt: new Date(Date.now() + 86400000).toISOString() }, prediction: { ...base.prediction!, markets }, quotes: markets.map(m => ({ marketKey: m.key, odds: m.offered, changedAt: null, retrievedAt: new Date().toISOString(), bookmaker: 'Prueba', demo: true })) };
}
const market = (key: string, probability: number, offered: number, pushProbability = 0): Market & { offered: number } => ({ key, probability, offered, pushProbability, fairOdds: (1 - pushProbability) / probability, label: key });
test('Las recomendaciones requieren probabilidad de ganar alta y valor positivo suficiente', () => {
  const a = analysis([market('home', .4, 3), market('12', .8, 1.3), market('under:4.5', .9, 1.05), market('btts:yes', .8, 1.255)]);
  const { recommended, featured } = selectHighlights([a], { distinctFixtures: false });
  assert.deepEqual(recommended.map(o => o.market.key), ['12']);
  assert.equal(featured[0].market.key, 'home');
  assert.ok(!featured.some(o => o.market.key === '12'));
});
test('Una devolución no eleva artificialmente la probabilidad recomendada', () => {
  const a = analysis([market('dnb:home', .55, 1.35, .3)]);
  assert.ok(opportunities([a]).length > 0);
  assert.equal(selectHighlights([a]).recommended.length, 0);
});
test('El radar no recomienda modelos no aptos, cuotas caducadas ni partidos iniciados', () => {
  const a = analysis([market('12', .8, 1.3)]);
  assert.equal(opportunities([{ ...a, comparisonEligible: false }]).length, 0);
  assert.equal(opportunities([{ ...a, quotes: a.quotes.map(q => ({ ...q, retrievedAt: new Date(Date.now() - 600001).toISOString() })) }]).length, 0);
  assert.equal(opportunities([{ ...a, fixture: { ...a.fixture, startsAt: new Date(Date.now() - 1).toISOString() } }]).length, 0);
});
test('Inicio diversifica por partido y el detalle por familia de mercado', () => {
  const a = analysis([market('over:1.5', .9, 1.2), market('under:4.5', .85, 1.25), market('12', .8, 1.4)]);
  assert.equal(selectHighlights([a]).recommended.length, 1);
  assert.equal(selectHighlights([a], { distinctFixtures: false }).recommended.length, 2);
});
test('Comparar el precio respeta los mercados con devolución y las cuotas ausentes', () => {
  const m = market('dnb:home', .55, 1.35, .3);
  assert.ok(priceDifference(m.fairOdds, m.offered)! > 0);
  assert.ok(priceDifference(2, 1.8)! < 0);
  assert.equal(priceDifference(null, 2), null);
  assert.equal(priceDifference(2, undefined), null);
});
test('Hoy usa el día de Madrid, incluidos cambios de fecha y horario de verano', () => {
  const now = new Date('2026-11-24T23:30:00Z');
  assert.equal(isMatchToday('2026-11-25T18:00:00Z', now), true);
  assert.equal(isMatchToday('2026-11-24T21:00:00Z', now), false);
  assert.equal(isMatchToday('2026-07-02T12:00:00Z', new Date('2026-07-01T22:30:00Z')), true);
});
