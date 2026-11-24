import { mkdir, readFile, readdir, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Bucket } from './store';

/** Escritura atómica para que otra petición nunca lea medio JSON. */
export function createFileBucket(directory: string): Bucket {
  return {
    async get(key) {
      try { const text = await readFile(path.join(directory, encodeURIComponent(key)), 'utf8'); return { text: async () => text }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
    async put(key, value) {
      await mkdir(directory, { recursive: true });
      const target = path.join(directory, encodeURIComponent(key)), temporary = target + '.' + randomUUID() + '.tmp';
      try { await writeFile(temporary, value, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, target); }
      finally { await rm(temporary, { force: true }); }
    },
    async list({ prefix }) {
      try { return { objects: (await readdir(directory)).filter(name => !name.endsWith('.tmp')).map(decodeURIComponent).filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { objects: [] }; throw error; }
    }
  };
}
