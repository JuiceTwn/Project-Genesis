const {World,DAY_TICKS}=require('./public/sim.js');
const days=+process.argv[2]||6;
const t00=Date.now(); const w=new World({}); console.log('boot ms',Date.now()-t00,'dots',w.dots.length,'bld',w.buildings.length);
let t0=process.hrtime.bigint();
const kinds={};let says=0;
for(let i=0;i<days*DAY_TICKS;i++){
  w.step(); for(const m of w.drain()){ if(m.t==='ev'){kinds[m.k]=(kinds[m.k]||0)+1; if(process.argv[3]&&process.argv[3].split(',').includes(m.k))console.log('  ',m.x)} else if(m.t==='say') says++; }
  w.frame();
  if((i+1)%(DAY_TICKS/2)===0){
    const d=w.dots.filter(x=>!x.dead); const avg=f=>(d.reduce((a,x)=>a+f(x),0)/d.length).toFixed(1);
    const starving=d.filter(x=>x.hunger>90).length, s=w.stats, st=w.markets.map(m=>m.stock);
    console.log(`day ${w.day()} t=${w.tod().toFixed(2)} pop=${d.length} hun=${avg(x=>x.hunger)} coin=${avg(x=>x.coin)} mood=${avg(x=>w.mood(x))} starv=${starving} mkts=${st.length} stock(min/avg)=${Math.min(...st)}/${Math.round(st.reduce((a,b)=>a+b,0)/st.length)} treas=${Math.round(w.treasury)} biz=${JSON.stringify(w.biz)} sites=${w.sites.length} bld=${w.buildings.filter(b=>b.state==='ok').length} born=${s.births} died=${s.deaths}`);
  }
}
const ms=Number(process.hrtime.bigint()-t0)/1e6;
console.log('events by kind:',JSON.stringify(kinds));
console.log(`total ${ms.toFixed(0)}ms, ${(ms/(days*DAY_TICKS)).toFixed(3)} ms/tick`);
