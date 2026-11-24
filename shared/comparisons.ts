import type { Analysis, Market, Quote } from './types';
import { marketExpectedValue } from './market-math';

export const RECOMMENDED_PROBABILITY = 0.75;
export const RECOMMENDED_VALUE = 0.01;
export const DISPLAY_TIME_ZONE = 'Europe/Madrid';
export interface Opportunity { analysis: Analysis; market: Market; quote: Quote; ev: number }
export function marketGroup(m: Market): string {
  if (m.group) return m.group;
  return ['home', 'draw', 'away'].includes(m.key) ? 'Resultado · 90 minutos' : ['1x', 'x2', '12'].includes(m.key) ? 'Doble oportunidad' : m.key.startsWith('btts') ? 'Ambos marcan' : m.key.startsWith('dnb') ? 'Empate devuelve' : 'Total de goles';
}
export function priceDifference(fair: number | null | undefined, offered: number | undefined): number | null {
  return fair != null && Number.isFinite(fair) && fair > 0 && offered != null && Number.isFinite(offered) && offered > 1 ? offered / fair - 1 : null;
}
export function opportunities(analyses: Analysis[], now = Date.now()): Opportunity[] {
  return analyses.filter(a => a.comparisonEligible && Date.parse(a.fixture.startsAt) > now).flatMap(analysis => (analysis.prediction?.markets ?? []).flatMap(market => {
    const quote = analysis.quotes.find(q => q.marketKey === market.key);
    if (!quote || priceDifference(market.fairOdds, quote.odds) === null || !Number.isFinite(Date.parse(quote.retrievedAt)) || now - Date.parse(quote.retrievedAt) > 10 * 60000 || Date.parse(quote.retrievedAt) > now) return [];
    const ev = marketExpectedValue(market, quote.odds);
    return Number.isFinite(ev) && ev > 0 ? [{ analysis, market, quote, ev }] : [];
  })).sort((a, b) => b.ev - a.ev);
}
const selectionKey = (o: Opportunity) => `${o.analysis.fixture.id}/${o.market.key}`;
/** La probabilidad es la de ganar; no se cuenta una devolución como un acierto. */
export function selectHighlights(analyses: Analysis[], { limit = 3, distinctFixtures = true, minimum = 0 } = {}) {
  const ranked = opportunities(analyses);
  const unique = (items: Opportunity[]) => {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = distinctFixtures ? item.analysis.fixture.id : `${item.analysis.fixture.id}/${marketGroup(item.market)}`;
      if (seen.has(key)) return false; seen.add(key); return true;
    }).slice(0, limit);
  };
  const recommended = unique(ranked.filter(o => o.market.probability >= RECOMMENDED_PROBABILITY && o.ev >= RECOMMENDED_VALUE)
    .sort((a, b) => b.market.probability - a.market.probability || b.ev - a.ev));
  const selected = new Set(recommended.map(selectionKey));
  const featured = unique(ranked.filter(o => o.market.probability >= minimum && !selected.has(selectionKey(o))));
  return { featured, recommended };
}
export function isMatchToday(startsAt: string, now = new Date()): boolean {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  return Number.isFinite(Date.parse(startsAt)) && day.format(new Date(startsAt)) === day.format(now);
}
