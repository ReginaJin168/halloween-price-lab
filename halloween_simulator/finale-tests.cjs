'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),S=require('./engine.js'),scope={};
vm.runInNewContext(fs.readFileSync(__dirname+'/finale-data.js','utf8'),scope);
const d=scope.HalloweenFinaleData;
assert.equal(d.rows.length,100);assert.equal(d.threshold,90);
assert.equal(new Set(d.rows.map(r=>r.price)).size,100);
const best=d.rows.filter(r=>r.avgExperience!==null&&r.avgExperience>=90).sort((a,b)=>b.avgProfit-a.avgProfit)[0];
assert.equal(best.price,25);assert.ok(best.avgExperience>=90);
for(const price of [1,24,25,100]){
 const fresh=S.summarize(Array.from({length:1000},(_,index)=>S.simulateNight(price,{seed:d.seed,index,trace:false})));
 const stored=d.rows.find(r=>r.price===price);
 assert.equal(stored.avgProfit,fresh.avgProfit);assert.equal(stored.avgExperience,fresh.avgExperience);
 assert.ok(Math.abs(stored.avgRevenue-stored.avgFixedCost-stored.avgProfit)<1e-8);
}
assert.ok(d.rows.find(r=>r.price===24).avgExperience<90);
console.log('PASS: 100 prices, same 1,000 nights, exact engine replay, 90-point eligibility, constrained winner $25.');
