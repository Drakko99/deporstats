import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBlobBucket } from '../server/blob-store';
import { createFileBucket } from '../server/file-store';

type Sdk = NonNullable<Parameters<typeof createBlobBucket>[2]>;
test('Blob usa acceso privado y consistente; comparte lecturas solo dentro de una petición', async () => {
  const calls: Array<{ key: string; options: Record<string, unknown> }> = [];
  const sdk = { get: async (key: string, options: Record<string, unknown>) => { calls.push({ key, options }); return { statusCode: 200, stream: new Response('{"value":1}').body }; } } as unknown as Sdk;
  const bucket = createBlobBucket('test-token', 'deporstats/production/', sdk);
  const [a, b] = await Promise.all([bucket.get('models/a.json'), bucket.get('models/a.json')]);
  assert.equal(await a!.text(), '{"value":1}'); assert.equal(await b!.text(), '{"value":1}');
  assert.equal(calls.length, 1); assert.equal(calls[0].key, 'deporstats/production/models/a.json');
  assert.deepEqual(calls[0].options, { token: 'test-token', access: 'private', useCache: false });
  await createBlobBucket('test-token', 'deporstats/production/', sdk).get('models/a.json');
  assert.equal(calls.length, 2);
});
test('Blob no usa modelos de producción en las previews y lee inmediatamente lo escrito', async () => {
  let captured: unknown;
  const sdk = { get: async () => null, put: async (key: string, value: string, options: unknown) => { captured = { key, value, options }; } } as unknown as Sdk;
  const bucket = createBlobBucket('test-token', 'deporstats/preview/', sdk);
  assert.equal(await bucket.get('model.json'), null);
  await bucket.put('model.json', '{"value":2}');
  assert.equal(await (await bucket.get('model.json'))!.text(), '{"value":2}');
  assert.deepEqual(captured, { key: 'deporstats/preview/model.json', value: '{"value":2}', options: { token: 'test-token', access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 } });
});
test('Los errores de Blob no filtran el token', async () => {
  const failure = async () => { throw new Error('request-url-with-test-secret-token'); };
  const bucket = createBlobBucket('test-secret-token', undefined, { get: failure, put: failure } as unknown as Sdk);
  await assert.rejects(bucket.get('model.json'), error => error instanceof Error && !error.message.includes('test-secret-token'));
  await assert.rejects(bucket.put('model.json', '{}'), error => error instanceof Error && !error.message.includes('test-secret-token'));
});
test('La lista de Blob recorre páginas y devuelve claves sin el prefijo de despliegue', async () => {
  const seen: Array<Record<string, unknown>> = [];
  const sdk = { list: async (options: Record<string, unknown>) => { seen.push(options); return options.cursor ? { blobs: [{ pathname: 'deporstats/preview/models/b.json' }], hasMore: false } : { blobs: [{ pathname: 'deporstats/preview/models/a.json' }], hasMore: true, cursor: 'next' }; } } as unknown as Sdk;
  const result = await createBlobBucket('test-token', 'deporstats/preview/', sdk).list({ prefix: 'models/' });
  assert.deepEqual(result.objects, [{ key: 'models/a.json' }, { key: 'models/b.json' }]);
  assert.equal(seen.length, 2); assert.equal(seen[1].cursor, 'next'); assert.equal(seen[0].prefix, 'deporstats/preview/models/');
});
test('El almacenamiento en disco persiste entre instancias y no deja escrituras parciales', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'deporstats-test-'));
  try {
    const bucket = createFileBucket(directory), key = 'models/spain%3Alaliga.json';
    assert.equal(await bucket.get(key), null);
    await Promise.all([bucket.put(key, 'first'), bucket.put(key, 'second')]);
    const restored = createFileBucket(directory);
    assert.ok(['first', 'second'].includes(await (await restored.get(key))!.text()));
    assert.deepEqual(await restored.list({ prefix: 'models/' }), { objects: [{ key }] });
    assert.ok((await readdir(directory)).every(name => !name.endsWith('.tmp')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
