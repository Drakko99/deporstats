import { CalendarDays, Clock3 } from 'lucide-react';
import type { Analysis } from '../../shared/types';
import { competitions } from '../../shared/competitions';
import { dateLabel } from '../lib';
import TeamBadge from './TeamBadge';
import OddsComparison from './OddsComparison';
import './MatchList.css';

/** Cada fila muestra las dos cuotas por selección; la fila completa abre el detalle. */
export default function MatchList({ analyses, loading }: { analyses: Analysis[]; loading: boolean }) {
  if (loading) return <div className="empty-state glass" role="status">Cargando los partidos…</div>;
  if (!analyses.length) return <div className="empty-state glass"><CalendarDays size={30}/><h3>No hay partidos para esta selección</h3><p>Prueba otro equipo o revisa tus competiciones en Ajustes.</p></div>;
  return <div className="match-list glass">
    <div className="match-list-heading" aria-hidden="true"><span>Competición · inicio</span><span>Encuentro</span><span>Modelo / Casa · resultado final</span></div>
    {analyses.map(({ fixture: f, prediction: p, quotes }) => {
      const competition = competitions.find(c => c.id === f.competition);
      return <a className="match-row" href={`#/partido/${encodeURIComponent(f.id)}`} key={f.id} data-glow>
        <div className="match-meta"><span className="league-name" style={{ color: competition?.color }}>{f.competitionName}</span><time dateTime={f.startsAt}><Clock3 size={13}/>{dateLabel(f.startsAt)}</time>{f.demo && <span className="row-source">Precios simulados</span>}</div>
        <div className="row-teams"><span><TeamBadge name={f.home}/><strong>{f.home}</strong></span><span className="row-versus" aria-label="contra">vs</span><span><TeamBadge name={f.away} away/><strong>{f.away}</strong></span></div>
        <div className="row-comparisons">{['home', 'draw', 'away'].map((key, i) => <div className="row-comparison" key={key}><span className="selection-label">{['1 · Local', 'X · Empate', '2 · Visitante'][i]}</span><OddsComparison market={p?.markets.find(m => m.key === key)} quote={quotes.find(q => q.marketKey === key)} compact/></div>)}</div>
        {!p && <span className="row-pending">Modelo pendiente de histórico</span>}
      </a>;
    })}
  </div>;
}
