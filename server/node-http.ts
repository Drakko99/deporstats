import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleApi } from './api';
import type { Environment } from './store';

/** Traduce HTTP de Node a Request/Response compartidos con la función de Vercel. */
export function createNodeServer(env: Environment, fallback: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>, publicOrigin?: string) {
  if (publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN debe ser un origen sin ruta ni barra final.');
  return createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith('/api/')) { await fallback(req, res); return; }
      const limit = req.url.split('?')[0] === '/api/session' ? 4096 : 3_300_000;
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { res.writeHead(413, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'La petición supera el límite permitido.' })); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => { if (typeof value === 'string') headers.set(key, value); });
      const origin = publicOrigin ?? `http://${req.headers.host ?? 'localhost'}`;
      // La ruta no puede reemplazar el origen mediante una URL absoluta o //host.
      const url = new URL(origin); const incoming = new URL(req.url, origin); url.pathname = incoming.pathname; url.search = incoming.search;
      const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method ?? 'GET') ? { body: Buffer.concat(chunks) } : {}) });
      const response = await handleApi(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ error: 'Error interno del servidor.' })); }
  });
}
