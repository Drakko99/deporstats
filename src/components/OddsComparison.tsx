import type { Market, Quote } from '../../shared/types';
import { priceDifference } from '../../shared/comparisons';
import { money, pct } from '../lib';
import './OddsComparison.css';

export function comparisonTone(difference: number | null): string {
  return difference === null ? 'unavailable' : difference > 0.0001 ? 'positive' : difference < -0.0001 ? 'negative' : 'neutral';
}
export function ComparisonLegend() {
  return <div className="comparison-legend"><span><i className="legend-swatch positive"/>Casa por encima del modelo</span><span><i className="legend-swatch negative"/>Casa por debajo</span><span className="muted">— Sin precio disponible</span></div>;
}
export default function OddsComparison({ market, quote, compact = false }: { market?: Market; quote?: Quote; compact?: boolean }) {
  const difference = priceDifference(market?.fairOdds, quote?.odds), tone = comparisonTone(difference);
  const label = compact ? 'Casa' : quote?.demo ? 'Casa · ejemplo' : quote?.bookmaker || 'Winamax España';
  return <div className={`odds-comparison ${compact ? 'comparison-compact' : ''} ${tone}`}>
    <div className="comparison-price"><span>Modelo</span><strong>{money(market?.fairOdds)}</strong></div>
    <div className="comparison-price offered-price"><span>{label}</span><strong>{money(quote?.odds)}</strong></div>
    <span className="comparison-difference" title="Diferencia del precio ofrecido respecto a la cuota justa; no es probabilidad de acierto.">{difference === null ? quote ? 'Sin modelo' : 'Sin cuota' : `${difference > 0 ? '+' : ''}${pct(difference)}${compact ? '' : ' de precio'}`}</span>
  </div>;
}
