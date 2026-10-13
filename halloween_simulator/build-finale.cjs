'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const S=require('./engine.js'),seed='classroom-2026',runs=1000;
const scenarios=Array.from({length:runs},(_,i)=>S.generateScenario(seed,i));
const rows=[];
for(let price=S.config.minPrice;price<=S.config.maxPrice;price++){
  const s=S.summarize(scenarios.map(scenario=>S.simulateScenario(price,scenario,{trace:false})));
  rows.push({price,...s});
  if(price%10===0)console.log('Compared '+price+' ticket prices.');
}
const data={seed,runs,threshold:90,engineHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'engine.js'))).digest('hex'),rows};
fs.writeFileSync(path.join(__dirname,'finale-data.js'),'globalThis.HalloweenFinaleData = '+JSON.stringify(data)+';\n');
const qualified=rows.filter(r=>r.avgExperience!==null&&r.avgExperience>=90);
const best=qualified.reduce((a,b)=>!a||b.avgProfit>a.avgProfit?b:a,null);
console.log(JSON.stringify({qualified:qualified.length,best},null,2));
