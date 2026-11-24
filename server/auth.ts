import type { Environment } from './store';

const COOKIE = 'deporstats_session';
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...headers }
});
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Formato de sesión inválido.');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export function authEnabled(env: Environment): boolean { return Boolean(env.REQUIRE_AUTH || env.APP_PASSWORD || env.SESSION_SECRET); }
function configured(env: Environment): boolean { return (env.APP_PASSWORD?.length ?? 0) >= 16 && (env.SESSION_SECRET?.length ?? 0) >= 32; }
async function signingKey(env: Environment): Promise<CryptoKey> {
  // Cambiar cualquiera de los dos secretos invalida también las sesiones anteriores.
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([env.SESSION_SECRET, env.APP_PASSWORD])));
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(value: string, key: CryptoKey): Promise<string> { return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))); }
async function validSession(request: Request, key: CryptoKey, now: number): Promise<boolean> {
  const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || token.length > 2048) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !signature || !await crypto.subtle.verify('HMAC', key, decode(signature), encoder.encode(payload))) return false;
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    return Number.isInteger(data.iat) && Number.isInteger(data.exp) && data.iat <= now && data.exp > now && data.exp - data.iat === SESSION_SECONDS;
  } catch { return false; }
}
function cookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

/** Protege la API en el propio servidor, incluso si alguien llama a sus rutas directamente. */
export async function authorize(request: Request, env: Environment, now = Math.floor(Date.now() / 1000)): Promise<Response | null> {
  const url = new URL(request.url), sessionRoute = url.pathname === '/api/session';
  const access = env.ACCESS_MODE === 'private' ? 'private' : 'public';
  const readOnly = request.method === 'GET' || request.method === 'HEAD';
  if (!authEnabled(env)) return sessionRoute ? json({ enabled: false, authenticated: true, configured: true, access }) : null;
  if (!sessionRoute && access === 'public' && readOnly) return null;
  if (sessionRoute && request.method === 'GET' && !configured(env)) return json({ enabled: true, authenticated: false, configured: false, access });
  if (!configured(env)) return json({ enabled: true, authenticated: false, configured: false, access, error: 'Configura APP_PASSWORD (mínimo 16 caracteres) y SESSION_SECRET (mínimo 32) en el servidor.' }, 503);
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Origen no permitido.' }, 403);
  }
  const key = await signingKey(env);
  if (sessionRoute && request.method === 'GET') return json({ enabled: true, configured: true, authenticated: await validSession(request, key, now), access });
  if (sessionRoute && request.method === 'DELETE') return json({ authenticated: false }, 200, { 'set-cookie': cookie(request, '', 0) });
  if (sessionRoute && request.method === 'POST') {
    try {
      if (!request.headers.get('content-type')?.includes('application/json') || Number(request.headers.get('content-length')) > 4096) return json({ error: 'Petición de acceso inválida.' }, 400);
      const raw = await request.text();
      if (encoder.encode(raw).length > 4096) return json({ error: 'Petición de acceso inválida.' }, 400);
      const { password } = JSON.parse(raw);
      if (typeof password !== 'string' || password.length > 1024) return json({ error: 'Contraseña incorrecta.' }, 401);
      const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(env.APP_PASSWORD!));
      if (!await crypto.subtle.verify('HMAC', key, expected, encoder.encode(password))) return json({ error: 'Contraseña incorrecta.' }, 401);
      const payload = base64url(encoder.encode(JSON.stringify({ iat: now, exp: now + SESSION_SECONDS, nonce: crypto.randomUUID() })));
      const token = payload + '.' + await sign(payload, key);
      return json({ enabled: true, configured: true, authenticated: true, access }, 200, { 'set-cookie': cookie(request, token, SESSION_SECONDS) });
    } catch { return json({ error: 'Petición de acceso inválida.' }, 400); }
  }
  if (sessionRoute) return json({ error: 'Método no permitido.' }, 405);
  return await validSession(request, key, now) ? null : json({ error: 'Inicia sesión para acceder a DeporStats.' }, 401);
}
