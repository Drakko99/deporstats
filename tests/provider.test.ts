import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketMappings, normalizeOdds, type OddsResponse, type ProviderMarket } from '../server/providers/oddspapi';
const now = '2026-11-24T12:00:00Z';
const catalog: ProviderMarket[] = [{ marketId: 101, marketName: 'Full Time Result', sportId: 10, period: 'fulltime', playerProp: false, handicap: 0, marketType: '1x2', outcomes: [{ outcomeId: 101, outcomeName: '1' }, { outcomeId: 102, outcomeName: 'X' }, { outcomeId: 103, outcomeName: '2' }] }];
function payload(): OddsResponse { return { fixtureId: 'fixture-1', participant1Name: 'A', participant2Name: 'B', startTime: '2026-11-25T18:00:00Z', tournamentId: 8, tournamentName: 'LaLiga', tournamentSlug: 'laliga', categorySlug: 'spain', sportId: 10, statusId: 0, bookmakerOdds: { 'winamax.es': { suspended: false, bookmakerIsActive: true, markets: { '101': { marketActive: true, outcomes: Object.fromEntries([101, 102, 103].map((id, i) => [id, { players: { '0': { price: [2, 3.5, 4][i], active: true, changedAt: now } } }])) } } } } }; }
test('Normaliza los tres resultados de Winamax España', () => { const quotes = normalizeOdds(payload(), catalog, now); assert.equal(quotes.length, 3); assert.deepEqual(quotes.map(q => q.marketKey), ['home', 'draw', 'away']); assert.ok(quotes.every(q => q.demo === false)); });
test('Ignora un libro suspendido aunque sus precios estén activos', () => { const p = payload(); p.bookmakerOdds!['winamax.es'].suspended = true; assert.deepEqual(normalizeOdds(p, catalog, now), []); });
test('Ignora mercados inactivos', () => { const p = payload(); p.bookmakerOdds!['winamax.es'].markets['101'].marketActive = false; assert.deepEqual(normalizeOdds(p, catalog, now), []); });
test('Un grupo incompleto no se compara', () => { const p = payload(); delete p.bookmakerOdds!['winamax.es'].markets['101'].outcomes['102']; assert.deepEqual(normalizeOdds(p, catalog, now), []); });
test('Nunca reutiliza cuotas de otra región de Winamax', () => { const p = payload(); p.bookmakerOdds!['winamax.fr'] = p.bookmakerOdds!['winamax.es']; delete p.bookmakerOdds!['winamax.es']; assert.deepEqual(normalizeOdds(p, catalog, now), []); });
test('Excluye primera parte, otro deporte y props', () => { for (const patch of [{ period: 'firsthalf' }, { sportId: 11 }, { playerProp: true }]) assert.deepEqual(marketMappings(catalog.map(m => ({ ...m, ...patch }))), []); });
test('No usa el modelo prepartido en partidos ya iniciados', () => { const p = payload(); p.startTime = '2026-11-24T11:00:00Z'; assert.deepEqual(normalizeOdds(p, catalog, now), []); });
test('No transforma cuotas de jugador en cuotas de partido', () => { const p = payload(); const out = p.bookmakerOdds!['winamax.es'].markets['101'].outcomes['101']; out.players['77'] = out.players['0']; delete out.players['0']; assert.deepEqual(normalizeOdds(p, catalog, now), []); });
test('La línea de total se toma del catálogo verificado', () => { const m: ProviderMarket = { ...catalog[0], marketId: 999, marketName: 'Over Under Full Time', marketType: 'totals', handicap: 2.5, outcomes: [{ outcomeId: 88, outcomeName: 'Over' }, { outcomeId: 89, outcomeName: 'Under' }] }; assert.deepEqual(marketMappings([m])[0].outcomes, { '88': 'over:2.5', '89': 'under:2.5' }); });

test('Mapea cada familia nueva por tipo y nombre de selección, con orden independiente', () => {
  const cases: [string, number, string[], string[]][] = [
    ['bothteamsscore', 0, ['No', 'Yes'], ['btts:no', 'btts:yes']],
    ['drawnobet', 0, ['2', '1'], ['dnb:away', 'dnb:home']],
    ['doublechance', 0, ['2X', '1X', '12'], ['x2', '1x', '12']],
    ['spreads', -.25, ['2', '1'], ['ah:away:0.25', 'ah:home:-0.25']],
    ['spreads-european', -1, ['X', '2', '1'], ['eh:-1:draw', 'eh:-1:away', 'eh:-1:home']],
    ['totals', 2.25, ['Over', 'Under'], ['over:2.25', 'under:2.25']],
    ['teamtotals-team2', 1.75, ['Under', 'Over'], ['team:away:under:1.75', 'team:away:over:1.75']],
    ['oddeven-team1', 0, ['Even', 'Odd'], ['parity:home:even', 'parity:home:odd']],
    ['toscore-team2', 0, ['Yes', 'No'], ['score:away:yes', 'score:away:no']],
    ['cleansheet-team1', 0, ['Yes', 'No'], ['clean:home:yes', 'clean:home:no']],
    ['wintonil-team2', 0, ['Yes', 'No'], ['wintonil:away:yes', 'wintonil:away:no']],
    ['nobet-team1', 0, ['X', '2'], ['nobet:home:draw', 'nobet:home:away']],
    ['nobet-team2', 0, ['1', 'X'], ['nobet:away:home', 'nobet:away:draw']],
    ['correctscore', 0, ['1:2', '8:0'], ['correct:1:2', 'correct:8:0']],
    ['exactscore-team2', 0, ['0', '5+'], ['exact:away:0', 'exact:away:5+']],
    ['winningmargin', 0, ['No Goal', 'Draw (incl 0:0)', '1 By 2', '2 By 6+'], ['margin:no-goal', 'margin:draw', 'margin:home:2', 'margin:away:6+']],
  ];
  for (const [marketType, handicap, names, keys] of cases) {
    const mapped = marketMappings([{ ...catalog[0], marketType, handicap, marketName: marketType, outcomes: names.map((outcomeName, outcomeId) => ({ outcomeId, outcomeName })) }]);
    assert.deepEqual(Object.values(mapped[0]?.outcomes ?? {}), keys, marketType);
  }
});
test('Rechaza periodos, estadísticas y nombres ambiguos aunque tengan outcomes similares', () => {
  for (const marketType of ['1x2-corners', '1x2-bookings', 'halftime-fulltime', 'firstgoal', '2up']) {
    assert.deepEqual(marketMappings([{ ...catalog[0], marketType }]), []);
  }
  assert.deepEqual(marketMappings([{ ...catalog[0], period: 'result' }]), []);
  assert.deepEqual(marketMappings([{ ...catalog[0], marketType: 'spreads', handicap: .3 }]), []);
  assert.deepEqual(marketMappings([{ ...catalog[0], marketType: 'winningmargin', outcomes: [{ outcomeId: 1, outcomeName: 'Draw' }] }]), []);
});
test('Marcadores exactos conservan las selecciones disponibles sin inventar las ausentes', () => {
  const p = payload();
  const m = { ...catalog[0], marketType: 'correctscore', outcomes: [{ outcomeId: 101, outcomeName: '1:0' }, { outcomeId: 102, outcomeName: '0:0' }, { outcomeId: 103, outcomeName: 'Other' }] };
  delete p.bookmakerOdds!['winamax.es'].markets['101'].outcomes['102'];
  const quotes = normalizeOdds(p, [m], now);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].marketKey, 'correct:1:0');
});
