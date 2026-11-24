import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createNodeServer } from './node-http';
import { createFileBucket } from './file-store';
try { loadEnvFile('.env'); } catch { /* Las variables también pueden inyectarse desde el servidor. */ }
const directory = path.resolve('dist/client');
const server = createNodeServer({
  BUCKET: createFileBucket(path.resolve(process.env.DATA_DIR || 'data')),
  ODDSPAPI_API_KEY: process.env.ODDSPAPI_API_KEY,
  APP_PASSWORD: process.env.APP_PASSWORD,
  ACCESS_MODE: process.env.ACCESS_MODE === 'private' ? 'private' : 'public',
  SESSION_SECRET: process.env.SESSION_SECRET,
  REQUIRE_AUTH: true
}, async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) { res.writeHead(405); res.end(); return; }
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  // Solo sirve el index y los assets compilados; .env y el código nunca son rutas públicas.
  if (pathname !== '/' && pathname !== '/index.html' && pathname !== '/robots.txt' && !pathname.startsWith('/assets/')) { res.writeHead(404); res.end('No encontrado'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(directory, relative);
  if (!file.startsWith(directory + path.sep)) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(file), ext = path.extname(file);
    const type = ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' } as Record<string, string>)[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('No encontrado'); }
}, process.env.PUBLIC_ORIGIN);
const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
server.listen(port, host, () => console.log(`DeporStats: servidor de producción iniciado en el puerto ${port}.`));
