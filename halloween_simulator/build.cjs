#!/usr/bin/env node
'use strict';
// Rebuild the single-file, offline student interface after changing engine.js.
const fs = require('node:fs');
const path = require('node:path');
const directory = __dirname;
const template = fs.readFileSync(path.join(directory, 'ui-template.html'), 'utf8');
const engine = fs.readFileSync(path.join(directory, 'engine.js'), 'utf8');
const marker = '/* ENGINE_PLACEHOLDER */';
if (template.split(marker).length !== 2) throw new Error('Expected exactly one engine placeholder.');
if (/<\/script/i.test(engine)) throw new Error('Engine contains an unsafe HTML script terminator.');
const output = path.resolve(directory, '..', 'halloween_simulator.html');
fs.writeFileSync(output, template.replace(marker, () => engine));
console.log('Built offline classroom simulator: ' + output);
