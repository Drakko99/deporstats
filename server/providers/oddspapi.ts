import type { Fixture, Quote } from '../../shared/types';
import { TOTAL_LINES, TEAM_LINES, ASIAN_LINES, EUROPEAN_LINES } from '../../shared/market-catalog';
import { read, write, type Environment } from '../store';

interface ProviderFixture { fixtureId: string; participant1Name: string; participant2Name: string; startTime: string; tournamentId: number; tournamentName: string; tournamentSlug: string; categorySlug: string; sportId: number; statusId: number }
interface Price { price: number; active: boolean; changedAt?: string; playerName?: string | null }
export interface OddsResponse extends ProviderFixture { bookmakerOdds?: Record<string, { suspended: boolean; bookmakerIsActive: boolean; markets: Record<string, { marketActive: boolean; outcomes: Record<string, { players: Record<string, Price> }> }> }> }
export interface ProviderMarket { marketId: number; marketName: string; sportId: number; period: string; playerProp: boolean; handicap: number; marketType: string; outcomes: { outcomeId: number; outcomeName: string }[] }

/** Peticiones solo desde el servidor; caché persistente y una única repetición en rate limit. */
export async function providerRequest<T>(env: Environment, endpoint: string, params: Record<string, string>, ttl: number): Promise<{ value: T; fetchedAt: string }> {
  if (!env.ODDSPAPI_API_KEY) throw new Error('Falta ODDSPAPI_API_KEY en el servidor. La demostración sigue disponible.');
  const key = `cache/${endpoint}/${encodeURIComponent(JSON.stringify(params))}.json`;
  const cached = await read<{ value: T; fetchedAt: string }>(env, key);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < ttl) return cached;
  const url = new URL(`https://api.oddspapi.io/v4/${endpoint}`);
  Object.entries({ ...params, apiKey: env.ODDSPAPI_API_KEY, language: 'en' }).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(12000) }); } catch { throw new Error('No se pudo contactar con OddsPapi. Vuelve a intentarlo más tarde.'); }
    const body = await response.json() as { error?: { code?: string; retryMs?: number } };
    if (!response.ok || body.error) {
      if (response.status === 429 && body.error?.code === 'RATE_LIMITED' && attempt === 0 && Number(body.error.retryMs) <= 5000) { await new Promise(r => setTimeout(r, Math.max(500, Number(body.error?.retryMs) || 1000))); continue; }
      if (response.status === 401) throw new Error('OddsPapi ha rechazado la clave del servidor.');
      if (response.status === 403) throw new Error('Tu plan de OddsPapi no permite esta consulta.');
      if (body.error?.code === 'REQUEST_LIMIT_EXCEEDED') throw new Error('Se ha agotado la cuota de consultas de OddsPapi.');
      if (response.status === 429) throw new Error('OddsPapi limita temporalmente las consultas. Espera antes de actualizar.');
      throw new Error(`OddsPapi no pudo servir los datos (HTTP ${response.status}).`);
    }
    const result = { value: body as T, fetchedAt: new Date().toISOString() }; if (env.BUCKET) await write(env, key, result); return result;
  }
  throw new Error('Consulta temporalmente limitada.');
}
export function normalizeFixture(p: ProviderFixture): Fixture {
  if (p.sportId !== 10 || !p.fixtureId || !p.participant1Name || !p.participant2Name || !p.tournamentSlug || !p.categorySlug || !Number.isFinite(Date.parse(p.startTime))) throw new Error('Partido incompleto recibido del proveedor.');
  return { id: p.fixtureId, home: p.participant1Name, away: p.participant2Name, startsAt: p.startTime, competition: `${p.categorySlug}:${p.tournamentSlug}`, competitionName: p.tournamentName, tournamentId: p.tournamentId, status: p.statusId, demo: false };
}
interface MarketMapping { marketId: string; outcomes: Record<string, string>; partial?: boolean }
/** Identidad semántica: tipo + periodo + línea + selección. Nunca por la posición del outcome. */
export function marketMappings(markets: ProviderMarket[]): MarketMapping[] {
  const result: MarketMapping[] = [];
  for (const m of markets) {
    if (m.sportId !== 10 || m.period !== 'fulltime' || m.playerProp !== false || !Number.isFinite(m.handicap)) continue;
    const t = m.marketType, line = m.handicap, side = t.endsWith('-team1') ? 'home' : t.endsWith('-team2') ? 'away' : 'match';
    let names: Record<string, string> | null = null, partial = false;
    const yesNo = (key: string) => ({ Yes: `${key}:yes`, No: `${key}:no` });
    if (t === '1x2' && line === 0) names = { '1': 'home', X: 'draw', '2': 'away' };
    else if ((t === 'bothteamsscore' || t === 'totals' && m.marketName === 'Both Teams To Score') && line === 0) names = yesNo('btts');
    else if (t === 'drawnobet' && line === 0) names = { '1': 'dnb:home', '2': 'dnb:away' };
    else if (t === 'doublechance' && line === 0) names = { '1X': '1x', '12': '12', '2X': 'x2' };
    else if (t === 'totals' && TOTAL_LINES.includes(line)) names = { Over: `over:${line}`, Under: `under:${line}` };
    // La línea de spreads pertenece a participant1; participant2 recibe el signo opuesto.
    else if (t === 'spreads' && ASIAN_LINES.includes(line)) names = { '1': `ah:home:${line}`, '2': `ah:away:${-line}` };
    else if (t === 'spreads-european' && EUROPEAN_LINES.includes(line)) names = { '1': `eh:${line}:home`, X: `eh:${line}:draw`, '2': `eh:${line}:away` };
    else if (/^teamtotals-team[12]$/.test(t) && TEAM_LINES.includes(line)) names = { Over: `team:${side}:over:${line}`, Under: `team:${side}:under:${line}` };
    else if (line === 0) {
      if (/^oddeven(-team[12])?$/.test(t)) names = { Odd: `parity:${side}:odd`, Even: `parity:${side}:even` };
      else if (/^toscore-team[12]$/.test(t)) names = yesNo(`score:${side}`);
      else if (/^cleansheet-team[12]$/.test(t)) names = yesNo(`clean:${side}`);
      else if (/^wintonil-team[12]$/.test(t)) names = yesNo(`wintonil:${side}`);
      else if (t === 'nobet-team1') names = { X: 'nobet:home:draw', '2': 'nobet:home:away' };
      else if (t === 'nobet-team2') names = { '1': 'nobet:away:home', X: 'nobet:away:draw' };
      else if (t === 'correctscore' || /^exactscore(-team[12])?$/.test(t) || t === 'winningmargin') {
        // Estos catálogos pueden contener "otros" y selecciones no modeladas.
        // Cada selección inequívoca es comparable por separado, sin completar precios ausentes.
        names = {}; partial = true;
        for (const o of m.outcomes) {
          const score = o.outcomeName.match(/^(\d+):(\d+)$/), exact = o.outcomeName.match(/^(\d+)(\+)?$/), margin = o.outcomeName.match(/^([12]) By ([1-6])(\+)?$/);
          if (t === 'correctscore' && score && +score[1] <= 8 && +score[2] <= 8) names[o.outcomeName] = `correct:${+score[1]}:${+score[2]}`;
          else if (t.startsWith('exactscore') && exact && (!exact[2] && +exact[1] <= 8 || exact[2] && +exact[1] >= 5 && +exact[1] <= 9)) names[o.outcomeName] = `exact:${side}:${+exact[1]}${exact[2] || ''}`;
          else if (t === 'winningmargin') {
            if (o.outcomeName === 'No Goal') names[o.outcomeName] = 'margin:no-goal';
            else if (o.outcomeName === 'Draw (incl 0:0)') names[o.outcomeName] = 'margin:draw';
            else if (margin && (!margin[3] && +margin[2] <= 5 || margin[3] && +margin[2] === 6)) names[o.outcomeName] = `margin:${margin[1] === '1' ? 'home' : 'away'}:${margin[2]}${margin[3] || ''}`;
            // "Draw" sin reglas explícitas es ambiguo: puede excluir el 0–0. No se compara.
          }
        }
      }
    }
    if (names) {
      const outcomes: Record<string, string> = {};
      for (const o of m.outcomes) if (names[o.outcomeName]) outcomes[String(o.outcomeId)] = names[o.outcomeName];
      if (Object.keys(outcomes).length && Object.keys(outcomes).length === Object.keys(names).length) result.push({ marketId: String(m.marketId), outcomes, ...(partial ? { partial: true } : {}) });
    }
  }
  return result;
}
/** Descarta mercados suspendidos, props, precios inválidos y grupos incompletos. */
export function normalizeOdds(payload: OddsResponse, catalog: ProviderMarket[], fetchedAt: string): Quote[] {
  if (payload.sportId !== 10 || payload.statusId !== 0 || Date.parse(payload.startTime) <= Date.parse(fetchedAt)) return [];
  const book = payload.bookmakerOdds?.['winamax.es'];
  if (!book || book.suspended !== false || book.bookmakerIsActive !== true) return [];
  const quotes: Quote[] = [];
  for (const mapping of marketMappings(catalog)) {
    const market = book.markets[mapping.marketId]; if (market?.marketActive !== true) continue;
    const group: Quote[] = [];
    for (const [id, marketKey] of Object.entries(mapping.outcomes)) {
      // Las cuotas de partido pertenecen al participante virtual 0, nunca a un jugador.
      const p = market.outcomes?.[id]?.players?.['0'];
      if (p?.active !== true || p.playerName || !Number.isFinite(p.price) || p.price <= 1) continue;
      if (p.changedAt && (!Number.isFinite(Date.parse(p.changedAt)) || Date.parse(p.changedAt) > Date.parse(fetchedAt) + 60000)) continue;
      group.push({ marketKey, odds: p.price, changedAt: p.changedAt ?? null, retrievedAt: fetchedAt, bookmaker: 'Winamax España', demo: false });
    }
    if (mapping.partial || group.length === Object.keys(mapping.outcomes).length) quotes.push(...group);
  }
  return [...new Map(quotes.map(q => [q.marketKey, q])).values()];
}
export async function getFixtures(env: Environment): Promise<Fixture[]> {
  const from = new Date(); from.setUTCHours(0, 0, 0, 0); const to = new Date(from.getTime() + 7 * 86400000);
  const r = await providerRequest<ProviderFixture[]>(env, 'fixtures', { sportId: '10', from: from.toISOString(), to: to.toISOString(), statusId: '0', hasOdds: 'true', bookmakers: 'winamax.es' }, 5 * 60000);
  if (!Array.isArray(r.value)) throw new Error('Respuesta inesperada al consultar partidos.');
  return r.value.filter(f => f.sportId === 10 && f.statusId === 0 && Date.parse(f.startTime) > Date.now()).map(normalizeFixture);
}
export async function getOdds(env: Environment, fixture: Fixture): Promise<Quote[]> {
  const odds = await providerRequest<OddsResponse>(env, 'odds', { fixtureId: fixture.id, bookmakers: 'winamax.es', oddsFormat: 'decimal', verbosity: '3' }, 120000);
  if (odds.value.fixtureId !== fixture.id) throw new Error('La respuesta corresponde a otro partido.');
  const catalog = await providerRequest<ProviderMarket[]>(env, 'markets', {}, 86400000);
  if (!Array.isArray(catalog.value)) throw new Error('Catálogo de mercados inválido.');
  const quotes = normalizeOdds(odds.value, catalog.value, odds.fetchedAt);
  await write(env, `quotes/${fixture.id}.json`, quotes); return quotes;
}
