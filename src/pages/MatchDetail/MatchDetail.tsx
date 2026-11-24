import { useEffect, useState } from 'react';
import { RefreshCw, Info, BarChart3 } from 'lucide-react';
import type { Analysis } from '../../../shared/types';
import { selectHighlights } from '../../../shared/comparisons';
import TeamBadge from '../../components/TeamBadge';
import OpportunitySection from '../../components/OpportunitySection';
import MarketBlocks from '../../components/MarketBlocks';
import { ComparisonLegend } from '../../components/OddsComparison';
import { api, dateLabel, pct } from '../../lib';
import './MatchDetail.css';

export default function MatchDetail({ id, mode, onAnalysis }: { id: string; mode: string; onAnalysis: (analysis: Analysis) => void }) {
  const [data, setData] = useState<Analysis | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(true), [search, setSearch] = useState('');
  useEffect(() => {
    const c = new AbortController(); setBusy(true); setData(null); setError('');
    api<Analysis>(`/analysis?mode=${mode}&id=${encodeURIComponent(id)}`, { signal: c.signal }).then(result => { if (!c.signal.aborted) { setData(result); onAnalysis(result); } }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [id, mode, refresh, onAnalysis]);
  useEffect(() => setSearch(''), [id, mode]);
  if (!data) return <><a href="#/partidos" className="back-link">Volver a partidos</a><div className="empty-state glass" role={error ? 'alert' : 'status'}>{error || 'Preparando el análisis…'}</div></>;
  const { fixture: f, prediction: p, quotes, modelInfo } = data;
  const highlights = selectHighlights([data], { limit: 2, distinctFixtures: false });
  const scores = (p?.matrix.flatMap((row, h) => row.map((prob, a) => ({ score: `${h} – ${a}`, prob }))) ?? []).sort((a, b) => b.prob - a.prob).slice(0, 5);
  return <><a href="#/partidos" className="back-link">Volver a partidos</a>
    <section className="detail-hero glass" data-glow><div className="detail-meta"><span className="eyebrow">{f.competitionName}</span><span>{dateLabel(f.startsAt)} · hora peninsular</span></div><div className="detail-teams"><div><TeamBadge name={f.home}/><h1>{f.home}</h1></div><span className="detail-vs">VS<span>90 MIN</span></span><div><TeamBadge name={f.away} away/><h1>{f.away}</h1></div></div><div className="detail-bottom"><span>{f.demo ? 'Encuentro y cuotas simulados' : 'Prepartido · Sin prórroga ni penaltis'}</span><button className="secondary-button" disabled={busy} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={15}/>Actualizar cuotas</button></div></section>
    <ComparisonLegend/>
    <div className="detail-highlights"><OpportunitySection kind="featured" items={highlights.featured} linkToMatch={false}/><OpportunitySection kind="recommended" items={highlights.recommended} linkToMatch={false}/></div>
    <div className="detail-grid">
      {p ? <MarketBlocks markets={p.markets} quotes={quotes} demo={f.demo} search={search} setSearch={setSearch}/> : <section className="glass empty-state"><BarChart3 size={30}/><h3>Aún no hay una estimación</h3><p>Importa resultados en Modelo y comprueba los nombres de los equipos.</p><a href="#/modelo" className="secondary-button">Configurar modelo</a></section>}
    <aside className="glass model-summary"><h2>Lectura del modelo</h2>{p && <><div className="rate-pair"><div><span>Goles previstos · local</span><strong>{p.homeRate.toFixed(2)}</strong></div><div><span>Goles previstos · visitante</span><strong>{p.awayRate.toFixed(2)}</strong></div></div><h3>Marcadores más probables</h3><div className="score-list">{scores.map(s => <div key={s.score}><strong>{s.score}</strong><div><span style={{ width: `${s.prob / scores[0].prob * 100}%` }}/></div><span>{pct(s.prob)}</span></div>)}</div></>}{modelInfo && <dl><div><dt>Histórico</dt><dd>{modelInfo.sampleSize} partidos</dd></div><div><dt>Muestra efectiva</dt><dd>{Math.round(modelInfo.effectiveSampleSize)}</dd></div><div><dt>Semivida</dt><dd>{modelInfo.options.halfLifeDays} días</dd></div><div><dt>Peso xG</dt><dd>{pct(modelInfo.options.xgWeight)}</dd></div><div><dt>Prueba 1X2</dt><dd>{modelInfo.evaluated || 'Sin evaluar'}</dd></div></dl>}</aside></div>
    <div className="notice"><Info size={18}/><div>{data.messages.map(m => <p key={m}>{m}</p>)}{quotes[0] && <p>Última consulta: {dateLabel(quotes[0].retrievedAt)}.</p>}<p>Córners, tarjetas, jugadores y apuestas por mitades necesitan datos y modelos específicos; no se estiman con el marcador final.</p></div></div>
  </>;
}
