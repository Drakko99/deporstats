import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../server/auth';
import { handleApi } from '../server/api';
import type { Environment } from '../server/store';

// Valores inventados, usados únicamente por las pruebas.
const env: Environment = { REQUIRE_AUTH: true, ACCESS_MODE: 'public', APP_PASSWORD: 'test-password-with-32-characters!', SESSION_SECRET: 'test-session-secret-with-32-characters!' };
const origin = 'https://deporstats.example';
const now = 1_800_000_000;
function request(route: string, method = 'GET', cookie?: string, body?: unknown) {
  return new Request(origin + route, { method, headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function session() {
  const response = await authorize(request('/api/session', 'POST', undefined, { password: env.APP_PASSWORD }), env, now);
  assert.equal(response?.status, 200);
  return response!.headers.get('set-cookie')!;
}

test('La consulta pública funciona sin credenciales y no revela secretos', async () => {
  const response = await handleApi(request('/api/status'), { ...env, ODDSPAPI_API_KEY: 'test-provider-secret' });
  assert.equal(response.status, 200);
  const body = await response.text();
  for (const secret of [env.APP_PASSWORD!, env.SESSION_SECRET!, 'test-provider-secret']) assert.ok(!body.includes(secret));
  assert.equal(await authorize(request('/api/models'), env, now), null);
});
test('Sin configuración se puede consultar, pero nunca editar en producción', async () => {
  const empty: Environment = { REQUIRE_AUTH: true };
  assert.equal(await authorize(request('/api/fixtures'), empty, now), null);
  assert.equal((await authorize(request('/api/train', 'POST', undefined, {}), empty, now))?.status, 503);
  const status = await authorize(request('/api/session'), empty, now);
  assert.deepEqual(await status!.json(), { enabled: true, authenticated: false, configured: false, access: 'public' });
});
test('La API bloquea escrituras anónimas aunque se omita la interfaz', async () => {
  for (const route of ['/api/train', '/api/aliases']) assert.equal((await handleApi(request(route, 'POST', undefined, {}), env)).status, 401);
});
test('El modo privado bloquea también las consultas', async () => {
  assert.equal((await authorize(request('/api/models'), { ...env, ACCESS_MODE: 'private' }, now))?.status, 401);
  assert.equal(await authorize(request('/api/models', 'GET', await session()), { ...env, ACCESS_MODE: 'private' }, now), null);
});
test('La contraseña incorrecta y un cuerpo mal formado no crean sesión', async () => {
  for (const body of [{ password: 'incorrecta' }, {}, { password: 'x'.repeat(1100) }]) {
    const response = await authorize(request('/api/session', 'POST', undefined, body), env, now);
    assert.equal(response?.status, 401); assert.equal(response.headers.get('set-cookie'), null);
  }
  const response = await authorize(new Request(origin + '/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), env, now);
  assert.equal(response?.status, 400);
});
test('La sesión válida permite editar y la cookie es HttpOnly, Secure y SameSite', async () => {
  const cookie = await session();
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Secure/); assert.match(cookie, /Max-Age=43200/);
  assert.ok(!cookie.includes(env.APP_PASSWORD!));
  assert.equal(await authorize(request('/api/train', 'POST', cookie, {}), env, now + 1), null);
  const state = await authorize(request('/api/session', 'GET', cookie), env, now + 1);
  assert.equal((await state!.json()).authenticated, true);
});
test('Las sesiones manipuladas, caducadas o anteriores a la rotación se rechazan', async () => {
  const cookie = (await session()).split(';')[0];
  const dot = cookie.indexOf('.');
  const modified = cookie.slice(0, dot + 1) + (cookie[dot + 1] === 'a' ? 'b' : 'a') + cookie.slice(dot + 2);
  const write = (value: string) => request('/api/train', 'POST', value, {});
  assert.equal((await authorize(write(modified), env, now))?.status, 401);
  assert.equal((await authorize(write(cookie), env, now + 43200))?.status, 401);
  assert.equal((await authorize(write(cookie), { ...env, APP_PASSWORD: env.APP_PASSWORD + 'changed' }, now))?.status, 401);
  assert.equal((await authorize(write(cookie), { ...env, SESSION_SECRET: env.SESSION_SECRET + 'changed' }, now))?.status, 401);
});
test('Bloquea login y edición desde otro origen, incluso con cookie válida', async () => {
  const cookie = await session();
  for (const route of ['/api/session', '/api/train']) {
    const req = new Request(origin + route, { method: 'POST', headers: { cookie, origin: 'https://other.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await authorize(req, env, now))?.status, 403);
  }
});
test('Cerrar sesión elimina la cookie del navegador', async () => {
  const response = await authorize(request('/api/session', 'DELETE', await session()), env, now);
  assert.equal(response?.status, 200); assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
});
test('El desarrollo local sin secretos funciona sin contraseña', async () => {
  assert.equal(await authorize(request('/api/train', 'POST', undefined, {}), {}, now), null);
  const state = await authorize(request('/api/session'), {}, now);
  assert.equal((await state!.json()).enabled, false);
});
