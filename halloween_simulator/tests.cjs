'use strict';
const assert = require('node:assert/strict');
const sim = require('./engine.js');
let passed = 0;
function test(name, body) { body(); console.log('PASS ' + name); passed++; }
function near(actual, expected, epsilon = 1e-8) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`);
}
function candidate(id, changes = {}) {
  return { id, arrival: 0, willingnessToPay: 100, firstLocation: 'haunted',
    hauntedMinutes: 2, pumpkinMinutes: 1, picnicMinutes: 10, walkingSpeed: 80, ...changes };
}
function scenario(candidates) { return { seed: 'fixture', index: 0, weather: 'Clear', candidates }; }
function scalarResult(result) { const { visitors, ...scalars } = result; return scalars; }
function sum(values) { return values.reduce((a, b) => a + b, 0); }

// This suite verifies behavior and accounting independently of the price chosen
// by the class. No expected maximizing price is embedded in student-facing files.
test('only finite prices within the shared $1–$100 range are accepted', () => {
  for (const price of [1, 1.25, 25, 99.9, 100]) assert.equal(sim.validatePrice(price).valid, true);
  for (const price of [0, -1, 100.01, NaN, Infinity, -Infinity, null, undefined, '20']) {
    assert.equal(sim.validatePrice(price).valid, false, `Invalid price accepted: ${price}`);
    assert.throws(() => sim.simulateNight(price, { seed: 'bounds', index: 0, trace: false }));
  }
});

test('same seed and night replay exactly without mutating candidate data', () => {
  const a = sim.generateScenario('replay', 7), b = sim.generateScenario('replay', 7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, sim.generateScenario('replay', 8));
  const before = JSON.stringify(a);
  assert.deepEqual(sim.simulateScenario(25, a, { trace: true }), sim.simulateScenario(25, b, { trace: true }));
  assert.equal(JSON.stringify(a), before);
  assert.deepEqual(sim.simulateNight(25, { seed: 'replay', index: 7, trace: true }),
    sim.simulateScenario(25, b, { trace: true }));
});

test('zero attendance preserves fixed costs and an empty animation', () => {
  const r = sim.simulateScenario(25, scenario([]), { trace: true });
  assert.equal(r.demand, 0); assert.equal(r.admitted, 0); assert.equal(r.exited, 0);
  assert.equal(r.revenue, 0); near(r.profit, -r.fixedCost);
  assert.equal(r.completedBoth, 0); assert.equal(r.completionRate, null);
  assert.deepEqual(r.visitors, []);
  assert.deepEqual(sim.stateAt(r, 30).guests, []);
  const summary = sim.summarize([r]);
  near(summary.avgProfit, -1800); assert.equal(summary.avgAdmitted, 0);
  assert.equal(summary.totalCompletedBoth, 0); assert.equal(summary.avgCompletionRate, null);
  assert.equal(summary.lossProbability, 1); assert.equal(summary.noAdmissionProbability, 1);
});

test('willingness to pay nests potential demand across all classroom prices', () => {
  for (let index = 0; index < 15; index++) {
    const s = sim.generateScenario('nested-demand', index);
    let previous = Infinity;
    for (const price of [1, 5, 15, 25, 40, 70, 100]) {
      const r = sim.simulateScenario(price, s, { trace: false });
      const expected = s.candidates.filter(v => v.willingnessToPay >= price).length;
      assert.equal(r.demand, expected); assert.equal(r.potentialDemand, expected);
      assert.ok(r.demand <= previous); previous = r.demand;
      assert.equal(r.admitted + r.turnedAway, r.demand);
    }
  }
});

test('trace-free simulations reproduce every nightly scalar result exactly', () => {
  for (let index = 0; index < 15; index++) for (const price of [1, 30, 100]) {
    const options = { seed: 'trace-parity', index };
    const trace = sim.simulateNight(price, { ...options, trace: true });
    const fast = sim.simulateNight(price, { ...options, trace: false });
    assert.deepEqual(scalarResult(fast), scalarResult(trace));
    assert.ok(!fast.visitors || fast.visitors.length === 0);
  }
});

test('profit and attendance summaries weight every night equally, including empty nights', () => {
  const empty = sim.simulateScenario(25, scenario([]), { trace: false });
  const quiet = sim.simulateScenario(25, scenario([candidate(0)]), { trace: false });
  const crowded = sim.simulateNight(1, { seed: 'weighted-summary', index: 4, trace: false });
  const rows = [empty, quiet, crowded];
  const total = sum(rows.map(r => r.admitted)), summary = sim.summarize(rows);
  assert.equal(summary.runs, 3);
  near(summary.avgProfit, sum(rows.map(r => r.profit)) / 3);
  near(summary.avgAdmitted, total / 3);
  near(summary.lossProbability, rows.filter(r => r.profit < 0).length / 3);
});

test('hand-calculated one-seat FIFO preserves service duration and total waiting', () => {
  const config = { hauntedCapacity: 1, pumpkinCapacity: 1 };
  const r = sim.simulateScenario(20, scenario([candidate(0), candidate(1), candidate(2)]), { trace: true, config });
  const walk = Math.hypot(285 - 170, 180 - 430) / 80;
  const secondWalk = 470 / 80;
  const picnicWalk = Math.hypot(750 - 755, 440 - 180) / 80;
  const exitWalk = Math.hypot(935 - 750, 530 - 440) / 80;
  r.visitors.forEach((v, i) => {
    const haunted = v.segments.find(s => s.kind === 'activity' && s.location === 'haunted');
    const pumpkin = v.segments.find(s => s.kind === 'activity' && s.location === 'pumpkin');
    near(haunted.start, walk + 2 * i); near(haunted.end, walk + 2 * i + 2);
    near(pumpkin.start, haunted.end + secondWalk); near(pumpkin.end, pumpkin.start + 1);
    near(v.waitMinutes, 2 * i); near(v.totalWait, 2 * i);
    near(v.departure, pumpkin.end + picnicWalk + 10 + exitWalk);
    assert.deepEqual(v.completedActivities, ['haunted', 'pumpkin']);
  });
  assert.equal(r.visitors.filter(v => v.completed).length, 3);
  near(sum(r.visitors.map(v => v.waitMinutes)) / r.admitted, 2);
  near(r.revenue, 60); near(r.profit, 60 - 1800);
});

test('a duration that fits exactly at activity closing earns completion credit', () => {
  const walk = sim.walkMinutes('entrance', 'haunted', 80);
  const r = sim.simulateScenario(20, scenario([candidate(0, { hauntedMinutes: 120 - walk })]), { trace: true });
  const v = r.visitors[0], service = v.segments.find(s => s.kind === 'activity');
  near(service.end, 120); assert.deepEqual(v.completedActivities, ['haunted']);
  assert.equal(v.completed, false);
  assert.ok(!v.segments.some(s => s.kind === 'picnic'));
});

test('late FIFO head cannot be overtaken; closing records wait and incompletion', () => {
  const config = { hauntedCapacity: 1, pumpkinCapacity: 1 };
  const guests = [candidate(0, { arrival: 89, hauntedMinutes: 60 }),
    candidate(1, { arrival: 89, hauntedMinutes: 1 })];
  const r = sim.simulateScenario(20, scenario(guests), { trace: true, config });
  const queueArrival = 89 + sim.walkMinutes('entrance', 'haunted', 80);
  for (const v of r.visitors) {
    assert.equal(v.completedActivities.length, 0); assert.equal(v.completed, false);
    assert.ok(!v.segments.some(s => s.kind === 'activity' || s.kind === 'picnic'));
    const queue = v.segments.find(s => s.kind === 'queue');
    near(queue.start, queueArrival); near(queue.end, 120);
    near(v.waitMinutes, 120 - queueArrival);
    assert.equal(v.segments.at(-1).to, 'exit');
  }
  assert.ok(r.visitors.every(v => !v.completed)); assert.equal(r.exited, 2);
});

test('picnic has no seat cap and requires two fully completed activities', () => {
  const guests = Array.from({ length: 60 }, (_, id) => candidate(id, {
    hauntedMinutes: 0.1, pumpkinMinutes: 0.1, picnicMinutes: 100
  }));
  const r = sim.simulateScenario(20, scenario(guests), { trace: true });
  assert.equal(r.visitors.filter(v => v.completed).length, 60);
  const state = sim.stateAt(r, 30);
  assert.equal(state.counts.picnic.inside, 60);
  assert.ok(state.counts.picnic.inside > sim.defaultConfig.hauntedCapacity);
  assert.ok(state.counts.picnic.inside > sim.defaultConfig.pumpkinCapacity);
  for (const v of r.visitors) {
    const picnic = v.segments.find(s => s.kind === 'picnic');
    const activities = v.segments.filter(s => s.kind === 'activity');
    assert.equal(activities.length, 2); assert.ok(picnic.start >= activities.at(-1).end);
  }
});

test('maximum admissions is a cumulative nightly limit, even after earlier exits', () => {
  const r = sim.simulateScenario(20, scenario([
    candidate(0), candidate(1, { arrival: 89 })
  ]), { trace: true, config: { maxAdmissions: 1 } });
  assert.equal(r.demand, 2); assert.equal(r.admitted, 1); assert.equal(r.turnedAway, 1);
  assert.equal(r.visitors[0].id, 0); assert.ok(r.visitors[0].departure < 89);
});

function checkActivityCapacity(visitors, location, cap) {
  const events = visitors.flatMap(v => v.segments
    .filter(s => s.kind === 'activity' && s.location === location)
    .flatMap(s => [{ time: s.start, delta: 1 }, { time: s.end, delta: -1 }]));
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let count = 0;
  for (const event of events) { count += event.delta; assert.ok(count >= 0 && count <= cap); }
  assert.equal(count, 0);
}
function checkRoute(v, config) {
  assert.ok(v.segments.length > 0);
  near(v.segments[0].start, v.arrival);
  let time = v.arrival, location = 'entrance', wait = 0;
  const completed = [];
  for (const s of v.segments) {
    near(s.start, time); assert.ok(s.end > s.start);
    if (s.kind === 'walk') {
      assert.equal(s.from, location);
      const a = config.map.nodes[s.from], b = config.map.nodes[s.to];
      near(s.end - s.start, Math.hypot(b.x - a.x, b.y - a.y) / v.walkingSpeed);
      assert.ok(config.map.edges.some(e => e.includes(s.from) && e.includes(s.to)));
      location = s.to;
    } else {
      assert.equal(s.location, location);
      if (s.kind === 'queue') wait += s.end - s.start;
      if (s.kind === 'activity') {
        assert.ok(s.end <= config.closeMinutes + 1e-8);
        near(s.end - s.start, v[s.location + 'Minutes']);
        assert.ok(!completed.includes(s.location)); completed.push(s.location);
      }
      if (s.kind === 'picnic') {
        assert.deepEqual(new Set(completed), new Set(['haunted', 'pumpkin']));
        assert.ok(s.end <= config.picnicCloseMinutes);
        assert.ok(s.end - s.start <= v.picnicMinutes + 1e-8);
      }
    }
    time = s.end;
  }
  assert.equal(location, 'exit'); near(time, v.departure); near(wait, v.waitMinutes);
  assert.deepEqual(completed, v.completedActivities); assert.equal(v.completed, completed.length === 2);
}

test('crowded seeded nights conserve guests, capacities, routes and cash flow', () => {
  let incompleteNights = 0, queuedGuests = 0;
  const config = sim.defaultConfig;
  for (let index = 0; index < 60; index++) {
    const r = sim.simulateNight(1, { seed: 'spatial-stress', index, trace: true });
    assert.equal(r.demand, r.admitted + r.turnedAway);
    assert.equal(r.admitted, r.visitors.length); assert.equal(r.exited, r.admitted);
    assert.equal(r.completedBoth, r.visitors.filter(v => v.completedActivities.length === 2).length);
    near(r.completionRate, r.completedBoth / r.admitted);
    assert.ok(r.admitted <= config.maxAdmissions);
    near(r.revenue, r.price * r.admitted); near(r.fixedCost, sum(Object.values(config.costs)));
    near(r.profit, r.revenue - r.fixedCost);
    if (r.visitors.some(v => !v.completed)) incompleteNights++;
    for (const v of r.visitors) {
      checkRoute(v, config);
      assert.ok(Number.isFinite(v.departure));
      if (v.waitMinutes > 0) queuedGuests++;
    }
    for (const location of ['haunted', 'pumpkin']) checkActivityCapacity(r.visitors, location, config[location + 'Capacity']);
    for (let t = 0; t <= Math.ceil(r.endTime) + 1; t += 3) {
      const state = sim.stateAt(r, t);
      assert.equal(state.arrived, r.visitors.filter(v => v.arrival <= t).length);
      assert.equal(state.exited, r.visitors.filter(v => v.departure <= t).length);
      assert.equal(state.guests.length, state.arrived - state.exited);
      assert.equal(new Set(state.guests.map(g => g.id)).size, state.guests.length);
      assert.ok(state.counts.haunted.inside <= config.hauntedCapacity);
      assert.ok(state.counts.pumpkin.inside <= config.pumpkinCapacity);
      for (const location of ['haunted', 'pumpkin']) {
        const slots = state.guests.filter(g => g.kind === 'queue' && g.location === location)
          .map(g => g.slot).sort((a, b) => a - b);
        assert.deepEqual(slots, Array.from({ length: slots.length }, (_, i) => i));
      }
    }
    const end = sim.stateAt(r, r.endTime);
    assert.equal(end.guests.length, 0); assert.equal(end.exited, r.admitted);
  }
  assert.ok(queuedGuests > 1000); assert.ok(incompleteNights > 0);
});

test('state interpolation uses the same recorded movements as the simulation', () => {
  const r = sim.simulateScenario(20, scenario([candidate(0)]), { trace: true });
  const v = r.visitors[0];
  for (const segment of v.segments) {
    const state = sim.stateAt(r, (segment.start + segment.end) / 2);
    assert.equal(state.guests.length, 1);
    const g = state.guests[0]; assert.equal(g.kind, segment.kind); near(g.progress, 0.5);
    assert.equal(g.from, segment.from); assert.equal(g.to, segment.to);
    assert.equal(g.location, segment.location);
  }
  assert.equal(sim.stateAt(r, -1).arrived, 0);
  assert.throws(() => sim.stateAt(r, NaN));
  assert.throws(() => sim.stateAt(sim.simulateNight(20, { trace: false }), 10));
});

test('faces react to long waits and rewind without changing the night', () => {
  const night = { visitors: [{ id: 0, arrival: 0, departure: 30, segments: [
    { kind: 'queue', location: 'haunted', start: 0, end: 20, slot: 0 },
    { kind: 'walk', location: 'haunted', from: 'haunted', to: 'exit', start: 20, end: 30 }
  ] }] };
  const before = JSON.stringify(night);
  assert.equal(sim.stateAt(night, 5).guests[0].expression, 'smile');
  assert.equal(sim.stateAt(night, 9).guests[0].expression, 'cry');
  assert.equal(sim.stateAt(night, 5).guests[0].expression, 'smile');
  assert.equal(JSON.stringify(night), before);
});

test('the classroom $20 replay visibly contains both expressions by 7:49 PM', () => {
  const night = sim.simulateNight(20, { seed: 'classroom-2026', index: 585, trace: true });
  const faces = sim.stateAt(night, 109).guests.map(guest => guest.expression);
  assert.ok(faces.includes('smile'));
  assert.ok(faces.includes('cry'));
});

test('invalid capacities, costs, candidate IDs and timings are rejected', () => {
  for (const config of [
    { hauntedCapacity: 0 }, { pumpkinCapacity: 1.5 }, { maxAdmissions: -1 },
    { costs: { pumpkinMaterials: -1 } }, { arrivalWeights: [0.5, 0.4] },
    { weather: [{ name: 'Clear', probability: 0.9, multiplier: 1 }] }
  ]) assert.throws(() => sim.simulateNight(20, { config }));
  for (const changes of [
    { arrival: -1 }, { arrival: 91 }, { hauntedMinutes: 0 }, { pumpkinMinutes: NaN },
    { picnicMinutes: -1 }, { walkingSpeed: 0 }, { willingnessToPay: -1 }, { firstLocation: 'picnic' }
  ]) assert.throws(() => sim.simulateScenario(20, scenario([candidate(0, changes)])));
  assert.throws(() => sim.simulateScenario(20, scenario([candidate(0), candidate(0)])));
  assert.throws(() => sim.generateScenario('invalid-index', -1));
  assert.throws(() => sim.summarize([]));
});

test('classroom replay keeps the established crowd and profit on the first three $20 nights', () => {
  for (const [index, admitted, profit] of [[0, 177, 1740], [1, 186, 1920], [2, 400, 6200]]) {
    const night = sim.simulateNight(20, { seed: 'classroom-2026', index, trace: true });
    assert.equal(night.admitted, admitted); near(night.profit, profit);
    assert.equal(sim.stateAt(night, night.endTime).exited, admitted);
  }
});

test('the three classroom prices preserve their established 1,000-night averages', () => {
  const bank = Array.from({ length: 1000 }, (_, index) => sim.generateScenario('classroom-2026', index));
  for (const [price, admitted, profit] of [[20, 242.073, 3041.46], [10, 340.665, 1606.65], [50, 69.617, 1680.85]]) {
    const summary = sim.summarize(bank.map(night => sim.simulateScenario(price, night, { trace: false })));
    near(summary.avgAdmitted, admitted); near(summary.avgProfit, profit);
  }
});

test('seeking backward restores the earlier positions without changing a simulated night', () => {
  const night = sim.simulateNight(20, { seed: 'classroom-2026', index: 2, trace: true });
  const before = JSON.stringify(night), earlier = sim.stateAt(night, 45);
  sim.stateAt(night, 120);
  assert.deepEqual(sim.stateAt(night, 45), earlier);
  assert.equal(JSON.stringify(night), before);
});

test('completion counts both finished activities and separates no, partial and full completion', () => {
  const firstWalk = sim.walkMinutes('entrance', 'haunted', 80);
  const secondWalk = sim.walkMinutes('haunted', 'pumpkin', 80);
  const unfinished = candidate(2, { hauntedMinutes: 200 });
  const onlyFirst = candidate(1, { hauntedMinutes: 120 - firstWalk });
  const exactBoth = candidate(0, { pumpkinMinutes: 120 - firstWalk - 2 - secondWalk });
  const sets = [
    { guests: [unfinished], completed: 0, rate: 0 },
    { guests: [exactBoth, onlyFirst, unfinished], completed: 1, rate: 1 / 3 },
    { guests: [candidate(0), candidate(1)], completed: 2, rate: 1 }
  ];
  for (const { guests, completed, rate } of sets) {
    const fixture = scenario(guests);
    const traced = sim.simulateScenario(20, fixture, { trace: true });
    const fast = sim.simulateScenario(20, fixture, { trace: false });
    assert.equal(traced.completedBoth, completed); near(traced.completionRate, rate);
    assert.deepEqual(scalarResult(traced), fast);
    for (const v of traced.visitors.filter(v => v.completed)) {
      assert.deepEqual(new Set(v.completedActivities), new Set(['haunted', 'pumpkin']));
      assert.ok(v.segments.filter(s => s.kind === 'activity').every(s => s.end <= 120));
    }
  }
  const exact = sim.simulateScenario(20, scenario([exactBoth]), { trace: true });
  assert.equal(exact.completedBoth, 1);
  near(exact.visitors[0].segments.filter(s => s.kind === 'activity').at(-1).end, 120);
});

test('aggregate completion counts guests across uneven nights, including an empty night', () => {
  const rows = [
    sim.simulateScenario(20, scenario([]), { trace: false }),
    sim.simulateScenario(20, scenario([candidate(0)]), { trace: false }),
    sim.simulateScenario(20, scenario([candidate(0), candidate(1, { hauntedMinutes: 200 }),
      candidate(2, { hauntedMinutes: 200 })]), { trace: false })
  ];
  const summary = sim.summarize(rows);
  assert.equal(summary.totalAdmitted, 4); assert.equal(summary.totalCompletedBoth, 2);
  near(summary.avgCompletionRate, 0.5);
  assert.notEqual(summary.avgCompletionRate, (rows[1].completionRate + rows[2].completionRate) / 2);
  near(summary.avgProfit, sum(rows.map(r => r.profit)) / 3);
});

console.log(`\n${passed} behavioral tests passed.`);
