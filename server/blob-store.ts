import { get, put, list } from '@vercel/blob';
import type { Bucket } from './store';

type BlobSdk = { get: typeof get; put: typeof put; list: typeof list };

/** Almacén privado; se crea por petición para no servir un modelo antiguo entre instancias. */
export function createBlobBucket(token: string, namespace = 'deporstats/production/', sdk: BlobSdk = { get, put, list }): Bucket {
  const prefix = namespace.endsWith('/') ? namespace : namespace + '/';
  const reads = new Map<string, Promise<string | null>>();
  return {
    async get(key) {
      if (!reads.has(key)) reads.set(key, (async () => {
        try {
          // El modelo acaba de poder cambiar: se necesita lectura consistente tras escritura.
          const result = await sdk.get(prefix + key, { token, access: 'private', useCache: false });
          if (!result) return null;
          if (result.statusCode !== 200) throw new Error('Respuesta de almacenamiento inesperada.');
          return new Response(result.stream).text();
        } catch { throw new Error('No se pudo leer el almacenamiento privado. Revisa la conexión de Blob.'); }
      })());
      const value = await reads.get(key)!;
      return value === null ? null : { text: async () => value };
    },
    async put(key, value) {
      try {
        await sdk.put(prefix + key, value, { token, access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
        reads.set(key, Promise.resolve(value));
      } catch { throw new Error('No se pudo guardar en Blob privado. Revisa el token y los límites de almacenamiento.'); }
    },
    async list({ prefix: filter }) {
      const objects: { key: string }[] = []; let cursor: string | undefined;
      do {
        const page = await sdk.list({ token, prefix: prefix + filter, cursor, limit: 1000 });
        objects.push(...page.blobs.map(blob => ({ key: blob.pathname.slice(prefix.length) })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return { objects };
    }
  };
}
