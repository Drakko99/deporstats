import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Goal, LockKeyhole } from 'lucide-react';
import PitchBackground from '../PitchBackground';
import './AuthGate.css';

type Session = { enabled: boolean; authenticated: boolean; configured: boolean; access: 'public' | 'private' };
const AuthContext = createContext({ enabled: false, authenticated: true, requestLogin: () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

/** La pantalla de acceso no sustituye la validación de cada petición en el backend. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null), [error, setError] = useState('');
  const [loginVisible, setLoginVisible] = useState(false);
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  async function inspect() {
    setError('');
    try {
      const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) { setSession({ enabled: true, authenticated: false, configured: false, access: 'private' }); throw new Error(body.error || 'El servidor no está disponible.'); }
      setSession(body);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar al servidor.'); }
  }
  useEffect(() => {
    void inspect();
    const expired = () => { setSession(previous => previous ? { ...previous, authenticated: false } : { enabled: true, authenticated: false, configured: true, access: 'public' }); setLoginVisible(true); setError('La sesión ha caducado. Introduce de nuevo tu contraseña.'); };
    window.addEventListener('deporstats:unauthorized', expired);
    return () => window.removeEventListener('deporstats:unauthorized', expired);
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo iniciar sesión.');
      setPassword(''); setSession(body); setLoginVisible(false);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function logout() {
    try {
      const response = await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
      setSession(previous => previous ? { ...previous, authenticated: false } : null); setLoginVisible(false); setError('');
    } catch (error) { window.alert((error as Error).message); }
  }
  if (session && !loginVisible && (session.authenticated || session.access === 'public')) return <AuthContext.Provider value={{ enabled: session.enabled, authenticated: session.authenticated, requestLogin: () => { setError(''); setLoginVisible(true); }, logout }}>{children}</AuthContext.Provider>;
  return <div className="auth-shell"><PitchBackground/><main className="auth-card glass"><div className="brand"><span className="brand-symbol"><Goal size={28}/></span><span>Depor<span className="brand-light">Stats</span></span></div>
    {!session && !error ? <p role="status">Comprobando acceso…</p> : <><LockKeyhole className="mint" size={26}/><h1>Administrar DeporStats<span>.</span></h1><p>La contraseña permite importar históricos y modificar los modelos.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {session?.configured ? <form onSubmit={login}><label><span>Contraseña</span><input type="password" autoComplete="current-password" required autoFocus value={password} onChange={event => setPassword(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button></form> : <><p className="fineprint">Configura APP_PASSWORD y SESSION_SECRET en el servidor para habilitar la edición.</p><button className="secondary-button" onClick={inspect}>Comprobar configuración</button></>}
      {session?.access === 'public' && <button className="text-link auth-back" onClick={() => { setLoginVisible(false); setError(''); }}>Volver a la web</button>}
    </>}
  </main></div>;
}
