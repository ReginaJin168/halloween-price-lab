'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'ui-template.html'),'utf8');
const built=fs.readFileSync(path.join(__dirname,'../halloween_simulator.html'),'utf8');
assert.equal((source.match(/<script src="engine\.js"><\/script>/g)||[]).length,1);
assert.ok(source.indexOf('src="engine.js"')<source.indexOf('const S=HalloweenSim'));
assert.ok(!source.includes('ENGINE_PLACEHOLDER'));
for(const m of source.matchAll(/<script src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(__dirname,m[1])));
assert.ok(!/<script src=/.test(built),'Offline build must embed all scripts');
for(const html of [source,built]){
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 assert.ok(html.includes('id="map"'));assert.ok(html.includes('id="play"'));assert.ok(html.includes('id="finale-plot"'));
}
console.log('PASS template loads engine before animation; offline build embeds scripts; both retain animation and final plot; all scripts parse.');
