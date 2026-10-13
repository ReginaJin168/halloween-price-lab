#!/usr/bin/env node
'use strict';
// Teacher-only command line; the student page needs no installation.
const fs = require('node:fs');
const path = require('node:path');
const sim = require('./engine.js');

function usage() {
  console.log('Halloween Price Lab — spatial edition\n\n' +
    'node cli.cjs --price 20 --runs 1000 --seed classroom-2026\n' +
    'node cli.cjs --plans plans.json --runs 1000 --out results.json --csv results.csv\n\n' +
    'Only ticket price changes. Capacities, staffing, admissions and costs are fixed.\n' +
    'Plan files contain a price and optional name. No external packages are needed.');
}

try {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') { usage(); process.exit(0); }
    if (!['--price', '--plan', '--plans', '--runs', '--seed', '--out', '--csv'].includes(args[i]))
      throw new Error('Unknown option: ' + args[i]);
    if (i + 1 >= args.length) throw new Error('Missing value: ' + args[i]);
    opt[args[i].slice(2)] = args[++i];
  }
  if ([opt.price, opt.plan, opt.plans].filter(x => x !== undefined).length > 1)
    throw new Error('Use only one of --price, --plan and --plans.');
  const read = filename => JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
  const plans = opt.plans ? read(opt.plans) : [opt.plan ? read(opt.plan) : {price: opt.price === undefined ? sim.defaultPlan.price : Number(opt.price)}];
  if (!Array.isArray(plans) || !plans.length) throw new Error('Expected a nonempty plans array.');
  const runs = opt.runs === undefined ? 1000 : Number(opt.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > 100000) throw new Error('Runs must be an integer from 1 to 100000.');
  const seed = opt.seed === undefined ? 'classroom-2026' : opt.seed;
  const result = {version: '2.0-spatial', seed, runs, plans: []};
  const f = n => n === null ? 'n/a' : n.toFixed(2);
  for (const plan of plans) {
    if (!plan || typeof plan !== 'object') throw new Error('Each plan must be an object containing price.');
    const obsolete = ['packs', 'checkinStaff', 'activityStaff', 'slotCaps'].filter(key => key in plan);
    if (obsolete.length) throw new Error('This is a price-only model; remove old settings: ' + obsolete.join(', '));
    const results = Array.from({length: runs}, (_, index) => sim.simulateNight(plan.price, {seed, index, trace: false}));
    const summary = sim.summarize(results);
    result.plans.push({plan: {name: plan.name || '$' + plan.price + ' ticket', price: plan.price}, summary, results});
    console.log(`${plan.name || '$' + plan.price + ' ticket'}: mean profit $${f(summary.avgProfit)}; experience ${f(summary.avgExperience)}/100; admitted ${f(summary.avgAdmitted)} per night.`);
  }
  if (opt.out) fs.writeFileSync(path.resolve(opt.out), JSON.stringify(result, null, 2) + '\n');
  if (opt.csv) {
    const fields = ['index', 'weather', 'price', 'demand', 'admitted', 'turnedAway', 'revenue', 'fixedCost', 'profit', 'experience', 'completedBoth', 'completionRate', 'meanWait'];
    const quote = x => '"' + String(x === null || x === undefined ? '' : x).replace(/"/g, '""') + '"';
    const rows = [['plan', ...fields]];
    for (const p of result.plans) for (const r of p.results) rows.push([p.plan.name, ...fields.map(k => r[k])]);
    fs.writeFileSync(path.resolve(opt.csv), rows.map(row => row.map(quote).join(',')).join('\n') + '\n');
  }
} catch (error) {
  console.error('Error: ' + error.message);
  process.exitCode = 1;
}
