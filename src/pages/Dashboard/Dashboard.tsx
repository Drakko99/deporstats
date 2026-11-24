import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Analysis } from '../../../shared/types';
import { isMatchToday, selectHighlights } from '../../../shared/comparisons';
import MatchList from '../../components/MatchList';
import OpportunitySection from '../../components/OpportunitySection';
import { ComparisonLegend } from '../../components/OddsComparison';
import './Dashboard.css';

export default function Dashboard({ analyses, loading, selectedCount }: { analyses: Analysis[]; loading: boolean; selectedCount: number }) {
  const [minimum, setMinimum] = useState(0), [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const { featured, recommended } = selectHighlights(analyses, { minimum });
  const today = analyses.filter(a => isMatchToday(a.fixture.startsAt, now)).sort((a, b) => a.fixture.startsAt.localeCompare(b.fixture.startsAt));
  return <>
    <div className="page-heading dashboard-heading"><div><p className="eyebrow">TU VISTA GENERAL</p><h1>Radar de cuotas<span>.</span></h1><p>Lo que calcula el modelo. Lo que paga la casa.</p></div><div className="overview-count"><span><strong>{loading ? '—' : analyses.length}</strong> partidos</span><i/><span><strong>{selectedCount}</strong> torneos</span></div></div>
    <ComparisonLegend/>
    <OpportunitySection kind="featured" items={featured} loading={loading} control={<label className="radar-filter"><span>Probabilidad mínima</span><select value={minimum} onChange={e => setMinimum(+e.target.value)}><option value={0}>Todas</option><option value={0.5}>50 %</option><option value={0.6}>60 %</option><option value={0.7}>70 %</option></select></label>}/>
    <OpportunitySection kind="recommended" items={recommended} loading={loading}/>
    <p className="radar-note">Probabilidades estimadas, no certezas. VE es el valor esperado según el modelo. Los destacados cubren el calendario disponible; no se repite la misma selección en ambos grupos.</p>
    <section className="dashboard-matches" aria-labelledby="today-title"><div className="section-heading"><div><h2 id="today-title"><CalendarDays size={18}/>Partidos de hoy</h2><p className="section-subtitle">{today.length} encuentros · hora peninsular española</p></div><a href="#/partidos" className="secondary-button">Ver todos los partidos</a></div>
      {!loading && !today.length ? <div className="empty-state glass compact"><CalendarDays size={26}/><h3>No quedan partidos para hoy</h3><p>Consulta el calendario completo en Partidos.</p></div> : <MatchList analyses={today} loading={loading}/>}</section>
  </>;
}
