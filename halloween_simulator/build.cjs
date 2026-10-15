#!/usr/bin/env node
'use strict';
// Rebuild the single-file, offline student interface after changing engine.js.
const fs = require('node:fs');
const path = require('node:path');
const directory = __dirname;
const template = fs.readFileSync(path.join(directory, 'ui-template.html'), 'utf8');
const engine = fs.readFileSync(path.join(directory, 'engine.js'), 'utf8');
const marker = '<script src="engine.js"></script>';
if (template.split(marker).length !== 2) throw new Error('Expected exactly one engine script.');
if (/<\/script/i.test(engine)) throw new Error('Engine contains an unsafe HTML script terminator.');
const output = path.resolve(directory, '..', 'halloween_simulator.html');
const data=fs.readFileSync(path.join(directory,'finale-data.js'),'utf8');
const vm=require('node:vm'),scope={};vm.runInNewContext(data,scope);
const hash=require('node:crypto').createHash('sha256').update(engine).digest('hex');
if(scope.HalloweenFinaleData.engineHash!==hash)throw new Error('Model changed. Run node build-finale.cjs first.');
let html=template.replace(marker, () => '<script>'+engine+'</script>');
html=html.replace('<link rel="stylesheet" href="finale.css">',()=>'<style>'+fs.readFileSync(path.join(directory,'finale.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="classroom.css">',()=>'<style>'+fs.readFileSync(path.join(directory,'classroom.css'),'utf8')+'</style>');
for(const file of ['finale-data.js','finale.js','classroom.js']){
 const code=fs.readFileSync(path.join(directory,file),'utf8');
 if(/<\/script/i.test(code))throw new Error('Unsafe script terminator: '+file);
 html=html.replace('<script src="'+file+'"></script>',()=>'<script>'+code+'</script>');
}
fs.writeFileSync(output,html);
console.log('Built offline classroom simulator: ' + output);
