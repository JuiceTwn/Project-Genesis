// Builds everything: client bundle, standalone demo.html, server bundle.  Usage: node scripts/build.mjs [--watch]
import { build } from 'esbuild';
import fs from 'node:fs';

const common = { bundle: true, sourcemap: false, target: 'es2022', logLevel: 'warning' };
fs.mkdirSync('public', { recursive: true });
fs.mkdirSync('dist', { recursive: true });

// 1. browser client (connects to the server over a websocket)
await build({ ...common, entryPoints: ['src/client/main.ts'], outfile: 'public/client.js', format: 'iife', platform: 'browser', minify: true });
const html = fs.readFileSync('src/client/index.html', 'utf8');
fs.writeFileSync('public/index.html', html);

// 2. standalone demo: the same client with the sim bundled in, as one HTML file
const demo = await build({ ...common, entryPoints: ['src/client/demo.ts'], write: false, format: 'iife', platform: 'browser', minify: true });
const js = demo.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
fs.writeFileSync('demo.html', html.replace('<script src="client.js"></script>', () => `<script>\n${js}\n</script>`));

// 3. server
await build({ ...common, entryPoints: ['src/server/main.ts'], outfile: 'dist/server.js', format: 'cjs', platform: 'node', external: ['ws'] });

const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`built: public/client.js ${kb('public/client.js')}, demo.html ${kb('demo.html')}, dist/server.js ${kb('dist/server.js')}`);
