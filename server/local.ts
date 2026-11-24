import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createFileBucket } from './file-store';
import { createNodeServer } from './node-http';
try { loadEnvFile('.env'); } catch { /* La clave es opcional para la demostración. */ }
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
const server = createNodeServer({
  BUCKET: createFileBucket(path.resolve(process.env.DATA_DIR || 'data')),
  ODDSPAPI_API_KEY: process.env.ODDSPAPI_API_KEY,
  APP_PASSWORD: process.env.APP_PASSWORD,
  ACCESS_MODE: process.env.ACCESS_MODE === 'private' ? 'private' : 'public',
  SESSION_SECRET: process.env.SESSION_SECRET
}, (req, res) => { vite.middlewares(req, res); }, process.env.PUBLIC_ORIGIN);
const argument = (flag: string) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : undefined; };
const host = argument('--host') || process.env.HOST || '127.0.0.1', port = Number(argument('--port') || process.env.PORT || 3000);
server.listen(port, host, () => console.log(`DeporStats disponible en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
