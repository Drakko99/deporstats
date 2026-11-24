import { useMemo } from 'react';
import { Info, Search } from 'lucide-react';
import type { Market, Quote } from '../../shared/types';
import { groupMarkets } from '../../shared/market-catalog';
import { marketExpectedValue } from '../../shared/market-math';
import { priceDifference } from '../../shared/comparisons';
import { comparisonTone } from './OddsComparison';
import { money, pct } from '../lib';

export default function MarketBlocks({ markets, quotes, demo, search, setSearch }: {
  markets: Market[]; quotes: Quote[]; demo: boolean; search: string; setSearch: (value: string) => void;
}) {
  const groups = useMemo(() => groupMarkets(markets, search), [markets, search]);
  const quoteMap = useMemo(() => new Map(quotes.map(q => [q.marketKey, q])), [quotes]);
  const count = groups.reduce((sum, group) => sum + group.markets.length, 0);
  return <div className="market-browser">
    <section className="glass market-search-panel">
      <div className="section-heading"><div><h2>Explora las apuestas</h2><p className="section-subtitle">Cada familia en su bloque. Una búsqueda para todas.</p></div><span className="small-tag">{markets.length} selecciones</span></div>
      <label className="market-search search-input"><Search size={18}/><input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Buscar en todos los bloques" placeholder="Busca: local, ambos marcan, hándicap, 2,5…"/></label>
      <div className="market-search-status"><span role="status" aria-live="polite">{count} selecciones en {groups.length} bloques{search.trim() ? ` para «${search.trim()}»` : ''}</span>{search && <button type="button" onClick={() => setSearch('')}>Limpiar búsqueda</button>}</div>
    </section>
    <div className="market-blocks">
      {groups.map(({ title, markets: selections }) => <section className="glass market-block" key={title}>
        <div className="market-block-title"><h3>{title}</h3><span>{selections.length} opciones</span></div>
        <div className="market-list" role="table" aria-label={`Comparativa: ${title}`}>
          <div className="market-list-heading" role="row"><span role="columnheader">Selección</span><span role="columnheader">Modelo</span><span role="columnheader">{demo ? 'Casa · ejemplo' : 'Winamax'}</span><span role="columnheader">VE estimado</span></div>
          {selections.map(m => {
            const q = quoteMap.get(m.key), difference = priceDifference(m.fairOdds, q?.odds), ev = q ? marketExpectedValue(m, q.odds) : null;
            return <div className={`market-row ${comparisonTone(difference)}`} role="row" key={m.key}>
              <div className="market-selection" role="cell"><strong>{m.label}</strong>{m.note && <span className="cell-note">{m.note}</span>}</div>
              <div className="market-price fair-price" role="cell"><span className="mobile-price-label">Modelo</span><strong title={m.fairOdds?.toFixed(2)}>{money(m.fairOdds)}</strong></div>
              <div className="market-price offered-price" role="cell"><span className="mobile-price-label">{demo ? 'Ejemplo' : 'Winamax'}</span><strong title={q?.odds.toFixed(2)}>{money(q?.odds)}</strong><span className="market-price-note">{difference === null ? 'Sin cuota' : difference > 0.0001 ? 'Por encima' : difference < -0.0001 ? 'Por debajo' : 'A la par'}</span></div>
              <div className="market-price ev-price" role="cell"><span className="mobile-price-label">VE estimado</span><strong>{ev === null ? '—' : `${ev > 0 ? '+' : ''}${pct(ev)}`}</strong></div>
            </div>;
          })}
        </div>
      </section>)}
    </div>
    {!count && <div className="glass empty-state compact"><Search size={26}/><h3>No hay apuestas con ese texto</h3><p>Prueba con un equipo, un tipo de apuesta o una línea de goles.</p><button className="secondary-button" onClick={() => setSearch('')}>Ver todos los bloques</button></div>}
    <p className="fineprint market-explanation"><Info size={16}/>VE: retorno neto esperado según el modelo, incluidas devoluciones y liquidaciones parciales. En modo real solo se compara cuando la casa ofrece una cuota compatible. Las probabilidades son estimaciones, no garantías.</p>
  </div>;
}
