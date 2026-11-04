// Builds demo.html: a single file that runs the whole sim in the browser (no server needed).
const fs = require('fs');
const gen = fs.readFileSync('public/worldgen.js', 'utf8'), sim = fs.readFileSync('public/sim.js', 'utf8');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('<script src="worldgen.js"></script>\n<script src="sim.js"></script>', '<script>window.__LOCAL__=true;</script>\n<script>\n' + gen + '\n</script>\n<script>\n' + sim + '\n</script>');
fs.writeFileSync('demo.html', html);
console.log('demo.html', (html.length / 1024).toFixed(0) + ' KB');
