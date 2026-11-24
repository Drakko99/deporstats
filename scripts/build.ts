import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
await viteBuild();
await build({ entryPoints: ['server/production.ts'], outfile: 'dist/server/index.js', format: 'esm', platform: 'node', bundle: true, packages: 'external', target: 'node22', sourcemap: true });
console.log('Frontend y servidor Node de producción compilados.');
