import type { ReactNode } from 'react';
import { Sparkles, BadgeCheck } from 'lucide-react';
import type { Opportunity } from '../../shared/comparisons';
import { pct } from '../lib';
import OddsComparison from './OddsComparison';
import './OpportunitySection.css';

export default function OpportunitySection({ kind, items, loading = false, linkToMatch = true, control }: { kind: 'featured' | 'recommended'; items: Opportunity[]; loading?: boolean; linkToMatch?: boolean; control?: ReactNode }) {
  const recommended = kind === 'recommended', Icon = recommended ? BadgeCheck : Sparkles, Tag = linkToMatch ? 'a' : 'article';
  return <section className={`opportunities-section ${recommended ? 'recommended-section' : ''}`} aria-label={recommended ? 'Recomendadas' : 'Destacadas'}>
    <div className="section-heading"><div><h2><Icon size={19}/>{recommended ? 'Recomendadas' : 'Cuotas destacadas'}</h2><p className="section-subtitle">{recommended ? 'Probabilidad estimada ≥ 75 % y valor esperado ≥ +1 %.' : 'Las mayores diferencias a favor entre modelo y casa.'}</p></div>{control || (recommended && <span className="small-tag recommendation-tag">Alta probabilidad</span>)}</div>
    {loading ? <div className="empty-state glass compact" role="status">Comparando cuotas…</div> : items.length ? <div className="opportunity-grid">{items.map(({ analysis: a, market: m, quote: q, ev }) => <Tag className={`opportunity glass ${recommended ? 'opportunity-recommended' : ''}`} href={linkToMatch ? `#/partido/${encodeURIComponent(a.fixture.id)}` : undefined} key={`${a.fixture.id}/${m.key}`} data-glow>
      <div className="opportunity-top"><span>{a.fixture.competitionName}</span><span className="edge">+{pct(ev)} VE</span></div>
      <h3>{m.label}</h3><p className="opportunity-fixture">{a.fixture.home} <span>vs</span> {a.fixture.away}</p>
      {recommended && <div className="confidence-line"><BadgeCheck size={15}/><span>{pct(m.probability)} estimada por el modelo</span></div>}
      <div className="opportunity-prices"><OddsComparison market={m} quote={q}/></div>
      {linkToMatch && <span className="opportunity-detail">Ver todas las comparativas</span>}
    </Tag>)}</div> : <div className="empty-state glass compact"><Icon size={24}/><h3>{recommended ? 'Ninguna selección cumple ahora el criterio' : 'Sin diferencias positivas con este filtro'}</h3><p>{recommended ? 'Se necesita probabilidad alta, valor positivo y una evaluación suficiente. No se rellena esta sección con selecciones de menor calidad.' : 'Aquí aparecerán las comparativas con valor positivo y datos suficientes.'}</p></div>}
  </section>;
}
