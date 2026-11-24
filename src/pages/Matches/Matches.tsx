import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Analysis } from '../../../shared/types';
import { competitions } from '../../../shared/competitions';
import MatchList from '../../components/MatchList';
import { ComparisonLegend } from '../../components/OddsComparison';
import './Matches.css';

export default function Matches({ analyses, loading }: { analyses: Analysis[]; loading: boolean }) {
  const [search, setSearch] = useState(''), [league, setLeague] = useState('all');
  const filtered = analyses.filter(a => (league === 'all' || a.fixture.competition === league) && `${a.fixture.home} ${a.fixture.away}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).sort((a,b) => a.fixture.startsAt.localeCompare(b.fixture.startsAt));
  return <><div className="page-heading"><div><p className="eyebrow">CALENDARIO</p><h1>Partidos<span>.</span></h1><p>Las cuotas de tus competiciones, partido a partido.</p></div><span className="count-pill">{filtered.length} partidos</span></div>
    <div className="match-toolbar"><label className="search-input glass"><Search size={18}/><input placeholder="Buscar equipo…" aria-label="Buscar equipo" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Filtrar por torneo" value={league} onChange={e => setLeague(e.target.value)}><option value="all">Todos los torneos</option>{competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <ComparisonLegend/><MatchList analyses={filtered} loading={loading}/>
  </>;
}
