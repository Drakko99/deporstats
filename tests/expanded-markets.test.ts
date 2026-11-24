import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDistribution } from '../server/markets';
import { asianSettlement } from '../server/expanded-markets';
import { groupMarkets } from '../shared/market-catalog';
import { marketExpectedValue } from '../shared/market-math';

const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const prediction = scoreDistribution(1.5, 1.1, -0.08);
const market = (key: string) => { const m = prediction.markets.find(m => m.key === key); assert.ok(m, key); return m; };
test('Liquidaciones asiáticas: cuarto positivo/negativo, enteros y medios', () => {
  assert.equal(asianSettlement(0, .25), 'halfLoss'); // Local -0.25, empate.
  assert.equal(asianSettlement(0, -.25), 'halfWin'); // Local +0.25, empate.
  assert.equal(asianSettlement(1, .75), 'halfWin');
  assert.equal(asianSettlement(1, 1.25), 'halfLoss');
  assert.equal(asianSettlement(2, 2.25), 'halfLoss');
  assert.equal(asianSettlement(2, 2.25, -1), 'halfWin');
  assert.equal(asianSettlement(2, 2), 'push');
  assert.equal(asianSettlement(3, 2.5), 'win');
  assert.equal(asianSettlement(2, 2.5), 'loss');
});
test('Cada cuota justa tiene VE cero, también con liquidaciones parciales', () => {
  for (const m of prediction.markets) {
    assert.ok(m.group);
    assert.ok(m.probability > 0 && m.probability <= 1);
    assert.ok(m.fairOdds && m.fairOdds >= 1 - 1e-12);
    near(marketExpectedValue(m, m.fairOdds!), 0);
    if (m.settlement) near(Object.values(m.settlement).reduce((a, b) => a + b, 0), 1);
  }
  assert.equal(new Set(prediction.markets.map(m => m.key)).size, prediction.markets.length);
});
test('Cuarto de hándicap: la media devolución se valora por separado', () => {
  const home = market('home').probability, draw = market('draw').probability;
  near(marketExpectedValue(market('ah:home:-0.25'), 2), home * 2 + draw * .5 - 1);
  near(marketExpectedValue(market('ah:home:0.25'), 2), home * 2 + draw * 1.5 - 1);
  near(market('ah:home:0').fairOdds!, market('dnb:home').fairOdds!);
});
test('Mercados derivados conservan las identidades de la matriz', () => {
  near(market('score:home:no').probability, market('team:home:under:0.5').probability);
  near(market('clean:home:yes').probability, market('score:away:no').probability);
  near(market('parity:match:odd').probability + market('parity:match:even').probability, 1);
  near(['home', 'draw', 'away'].reduce((n, outcome) => n + market(`eh:-1:${outcome}`).probability, 0), 1);
  near(Array.from({ length: 9 }, (_, n) => market(`exact:match:${n}`).probability).reduce((a, b) => a + b, 0) + market('exact:match:9+').probability, 1);
  near(market('correct:0:0').probability, prediction.matrix[0][0]);
});
test('Combinaciones usan probabilidades conjuntas y excluyen eventos imposibles', () => {
  const m = market('result-btts:home:yes');
  near(m.probability, prediction.matrix.reduce((sum, row, h) => sum + row.reduce((s, p, a) => s + (h > a && a > 0 ? p : 0), 0), 0));
  assert.ok(Math.abs(m.probability - market('home').probability * market('btts:yes').probability) > 1e-3);
  assert.equal(prediction.markets.some(m => m.key === 'btts-total:yes:under:1.5'), false);
});
test('Búsqueda global conserva los bloques, tolera tildes, orden de palabras y coma decimal', () => {
  const groups = groupMarkets(prediction.markets, '2,5 goles');
  assert.ok(groups.length >= 5);
  assert.ok(groups.some(g => g.title === 'Goles del local'));
  assert.ok(groups.some(g => g.title === 'Resultado y total de goles'));
  assert.equal(groupMarkets(prediction.markets, 'HANDICAP asiatico')[0].title, 'Hándicap asiático');
  assert.deepEqual(groupMarkets(prediction.markets, 'inexistente'), []);
  assert.equal(groupMarkets(prediction.markets).flatMap(g => g.markets).length, prediction.markets.length);
});
test('Evaluación rápida mantiene 1X2 idéntico sin construir el catálogo completo', () => {
  assert.deepEqual(scoreDistribution(1.5, 1.1, -0.08, false).markets, prediction.markets.slice(0, 3));
});
