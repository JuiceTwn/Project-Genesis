const Gen = require('../public/worldgen.js');
const seed = +process.argv[2] || 1337, sid = +process.argv[3] || 0, rad = +process.argv[4] || 30;
const m = Gen.generate(seed, { pop: 480 }); const s = m.settlements[sid];
const S = 14, W = m.W, H = m.H, w = (rad*2+1)*S, px = Buffer.alloc(w*w*3);
const col = { 0:[120,160,80],1:[90,70,50],2:[150,90,70],3:[60,110,170],4:[170,190,100],5:[50,100,50],6:[140,100,60],7:[110,150,190],8:[225,210,160],9:[120,115,110] };
for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) { const X = s.x+x, Y = s.y+y; let c = [0,0,0]; if (X>=0&&Y>=0&&X<W&&Y<H) { const i=Y*W+X; c = col[m.t[i]].slice(); if (m.t[i]===3) c = m.wk[i]===1?[30,70,130]:[70,130,190]; const p=m.plots[m.pm[i]]; if (m.pm[i]>=0 && m.t[i]!==1) c = p.rural?[200,200,90]:[190,110,90]; if (m.qm[i]) c=[200,160,60]; }
 for (let b=0;b<S;b++) for (let a=0;a<S;a++) { const o=(((y+rad)*S+b)*w+(x+rad)*S+a)*3; px[o]=c[0];px[o+1]=c[1];px[o+2]=c[2]; } }
require('fs').writeFileSync('/tmp/crop.ppm', Buffer.concat([Buffer.from(`P6 ${w} ${w} 255\n`), px]));
