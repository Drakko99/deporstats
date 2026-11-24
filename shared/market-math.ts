import type { Market } from './types';

export function returnWeights(market: Market): { win: number; refund: number } {
  const s = market.settlement;
  return s ? { win: s.win + s.halfWin / 2, refund: s.push + (s.halfWin + s.halfLoss) / 2 } : { win: market.probability, refund: market.pushProbability };
}
/** Incluye ganancias/pérdidas parciales en líneas asiáticas de cuarto. */
export function marketExpectedValue(market: Market, odds: number): number {
  const weights = returnWeights(market);
  return weights.win * odds + weights.refund - 1;
}
