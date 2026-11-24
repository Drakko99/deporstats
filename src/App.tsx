import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Activity, CalendarDays, LayoutDashboard, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, Menu, X, Goal, RefreshCw, LogOut, LockKeyhole } from 'lucide-react';
import type { Analysis } from '../shared/types';
import { competitions } from '../shared/competitions';
import { api } from './lib';
import PitchBackground from './components/PitchBackground';
import usePointerLight from './components/usePointerLight';
import { useAuth } from './components/Auth/AuthGate';
import Dashboard from './pages/Dashboard/Dashboard';
import Matches from './pages/Matches/Matches';
import MatchDetail from './pages/MatchDetail/MatchDetail';
import Model from './pages/Model/Model';
import Settings from './pages/Settings/Settings';

/** Las preferencias siguen funcionando aunque el navegador no permita persistirlas. */
function stored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
const navigation = [
  { path: '/', label: 'Panel', icon: LayoutDashboard },
  { path: '/partidos', label: 'Partidos', icon: CalendarDays },
  { path: '/modelo', label: 'Modelo', icon: Activity },
  { path: '/ajustes', label: 'Ajustes', icon: SlidersHorizontal }
];

export default function App() {
  usePointerLight();
  const { enabled: managedAccess, authenticated, requestLogin, logout } = useAuth();
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const [mode, setMode] = useState<'demo' | 'real'>(() => stored<string>('deporstats-mode', 'demo') === 'real' ? 'real' : 'demo');
  const [selected, setSelected] = useState<string[]>(() => {
    const defaults = competitions.slice(0, 5).map(c => c.id);
    const value = stored<unknown>('deporstats-competitions', defaults);
    return Array.isArray(value) ? value.filter(id => competitions.some(c => c.id === id)) : defaults;
  });
  const [collapsed, setCollapsed] = useState(stored<boolean>('deporstats-sidebar', false) === true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const sidebar = useRef<HTMLElement>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]), [error, setError] = useState('');
  const updateAnalysis = useCallback((analysis: Analysis) => setAnalyses(previous => previous.map(item => item.fixture.id === analysis.fixture.id ? analysis : item)), []);
  const [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const transition = useRef<{ skipTransition: () => void } | null>(null);

  useEffect(() => {
    const listener = () => {
      const update = () => { setRoute(location.hash.slice(1) || '/'); setMobileOpen(false); };
      // La captura de la vista saliente permite fundir ambas pantallas sin un vacío intermedio.
      // El navegador sin View Transitions conserva la animación CSS de entrada.
      transition.current?.skipTransition();
      if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        transition.current = document.startViewTransition(() => { flushSync(update); window.scrollTo(0, 0); });
      } else { update(); window.scrollTo(0, 0); }
    };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const change = () => { setIsMobile(query.matches); setMobileOpen(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => [...(sidebar.current?.querySelectorAll<HTMLElement>('a,button') ?? [])].filter(element => element.offsetParent !== null);
    sidebar.current?.querySelector<HTMLElement>('.mobile-close')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previousFocus?.focus(); };
  }, [mobileOpen]);
  useEffect(() => {
    try {
      localStorage.setItem('deporstats-mode', JSON.stringify(mode));
      localStorage.setItem('deporstats-competitions', JSON.stringify(selected));
      localStorage.setItem('deporstats-sidebar', JSON.stringify(collapsed));
    } catch { /* Preferencias temporales cuando el almacenamiento está deshabilitado. */ }
  }, [mode, selected, collapsed]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setAnalyses([]);
    api<{ analyses: Analysis[]; capped: boolean }>(`/fixtures?mode=${mode}`, { signal: controller.signal })
      .then(result => { setAnalyses(result.analyses); if (result.capped) setError('Se muestran los primeros 100 partidos de los próximos 7 días.'); })
      .catch(error => { if (error.name !== 'AbortError') setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, refresh]);

  const current = Math.max(0, navigation.findIndex(item => item.path === route || item.path === '/partidos' && route.startsWith('/partido/')));
  const visible = analyses.filter(a => selected.includes(a.fixture.competition));
  return <div className={`app-shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'menu-open' : ''}`}>
    <PitchBackground/>
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById('content')?.focus(); }}>Saltar al contenido</a>
    {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"/>}
    <aside ref={sidebar} className="sidebar" aria-label="Menú principal" role={isMobile ? 'dialog' : undefined} aria-modal={isMobile && mobileOpen ? true : undefined} inert={isMobile && !mobileOpen}>
      <a className="brand" href="#/" aria-label="DeporStats, inicio"><span className="brand-symbol"><Goal size={28}/></span><span>Depor<span className="brand-light">Stats</span></span></a>
      <button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20}/></button>
      <nav className="navigation" aria-label="Navegación principal" style={{ '--active-index': current } as CSSProperties}>
        <span className="nav-indicator"/>
        {navigation.map(item => <a key={item.path} href={'#' + item.path} className={navigation[current].path === item.path ? 'active' : ''} aria-current={navigation[current].path === item.path ? 'page' : undefined} title={item.label}><item.icon size={20}/><span>{item.label}</span></a>)}
      </nav>
      <div className="sidebar-bottom"><button className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Ampliar menú' : 'Plegar menú'}>{collapsed ? <PanelLeftOpen size={20}/> : <PanelLeftClose size={20}/>}<span>Plegar menú</span></button></div>
    </aside>
    <div className="main-shell" inert={mobileOpen}>
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" aria-expanded={mobileOpen}><Menu size={22}/></button><span className="sport-chip"><Goal size={18}/><span>Fútbol</span></span><span className="topbar-divider"/><span className="topbar-section">{navigation[current].label}</span></div><div className="topbar-actions"><div className="mode-switch" role="group" aria-label="Origen de los datos" style={{ '--mode-index': mode === 'real' ? 1 : 0 } as CSSProperties}><span className="mode-indicator"/><button onClick={() => setMode('demo')} aria-pressed={mode === 'demo'}>Demo</button><button onClick={() => setMode('real')} aria-pressed={mode === 'real'}>Real</button></div><button className="icon-button refresh" onClick={() => setRefresh(r => r + 1)} aria-label="Actualizar partidos" disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''}/></button>{managedAccess && <button className="icon-button auth-action" onClick={() => authenticated ? void logout() : requestLogin()} aria-label={authenticated ? "Cerrar sesión de edición" : "Acceso de edición"} title={authenticated ? "Cerrar sesión de edición" : "Acceso de edición"}>{authenticated ? <LogOut size={18}/> : <LockKeyhole size={18}/>}</button>}</div></header>
      <main id="content" tabIndex={-1}>
        <div className={`data-banner ${mode === 'real' ? 'real' : ''}`}><span>{mode === 'demo' ? 'DEMO' : 'DATOS REALES'}</span>{mode === 'demo' ? 'Partidos y cuotas simulados para explorar la aplicación.' : 'Prepartido · Winamax España · Histórico importado'}</div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="page-view"><div className="page-enter" key={route}>{route.startsWith('/partido/') ? <MatchDetail id={decodeURIComponent(route.slice(9))} mode={mode} onAnalysis={updateAnalysis}/> : route === '/modelo' ? <Model/> : route === '/ajustes' ? <Settings selected={selected} setSelected={setSelected}/> : route === '/partidos' ? <Matches analyses={visible} loading={loading}/> : <Dashboard analyses={visible} loading={loading} selectedCount={selected.length}/>}</div></div>
        <footer className="page-footer"><a href="#/" className="footer-brand"><Goal size={17}/>DeporStats</a><nav aria-label="Enlaces del pie"><a href="#/modelo">Metodología</a><a href="#/ajustes">Competiciones</a></nav></footer>
      </main>
    </div>
  </div>;
}
