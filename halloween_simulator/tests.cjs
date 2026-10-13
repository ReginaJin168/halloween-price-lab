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

test('zero attendance preserves fixed costs and reports unavailable guest averages', () => {
  const r = sim.simulateScenario(25, scenario([]), { trace: true });
  assert.equal(r.demand, 0); assert.equal(r.admitted, 0); assert.equal(r.exited, 0);
  assert.equal(r.revenue, 0); near(r.profit, -r.fixedCost);
  assert.equal(r.experience, null); assert.equal(r.meanWait, null); assert.equal(r.completionRate, null);
  assert.equal(r.completedBoth, 0); assert.deepEqual(r.visitors, []);
  const summary = sim.summarize([r]);
  assert.equal(summary.avgExperience, null); assert.equal(summary.meanNightExperience, null);
  assert.equal(summary.meanWait, null); assert.equal(summary.completionRate, null);
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

test('summaries weight individual visitors and separately average nonempty nights', () => {
  const empty = sim.simulateScenario(25, scenario([]), { trace: false });
  const quiet = sim.simulateScenario(25, scenario([candidate(0)]), { trace: false });
  const crowded = sim.simulateNight(1, { seed: 'weighted-summary', index: 4, trace: false });
  const rows = [empty, quiet, crowded], populated = rows.filter(r => r.admitted > 0);
  const total = sum(rows.map(r => r.admitted)), summary = sim.summarize(rows);
  assert.equal(summary.runs, 3);
  near(summary.avgProfit, sum(rows.map(r => r.profit)) / 3);
  near(summary.avgAdmitted, total / 3);
  near(summary.avgExperience, sum(populated.map(r => r.experience * r.admitted)) / total);
  near(summary.meanNightExperience, sum(populated.map(r => r.experience)) / populated.length);
  near(summary.meanWait, sum(populated.map(r => r.meanWait * r.admitted)) / total);
  near(summary.completionRate, sum(rows.map(r => r.completedBoth)) / total);
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
    near(v.experience, 100 - 0.8 * 2 * i);
    assert.deepEqual(v.completedActivities, ['haunted', 'pumpkin']);
  });
  assert.equal(r.completedBoth, 3); near(r.meanWait, 2); near(r.experience, 98.4);
  near(r.revenue, 60); near(r.profit, 60 - 1800);
});

test('a duration that fits exactly at activity closing earns completion credit', () => {
  const walk = sim.walkMinutes('entrance', 'haunted', 80);
  const r = sim.simulateScenario(20, scenario([candidate(0, { hauntedMinutes: 120 - walk })]), { trace: true });
  const v = r.visitors[0], service = v.segments.find(s => s.kind === 'activity');
  near(service.end, 120); assert.deepEqual(v.completedActivities, ['haunted']);
  assert.equal(v.completed, false); near(v.experience, 75);
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
    near(v.experience, Math.max(0, 50 - 0.8 * (120 - queueArrival)));
    assert.equal(v.segments.at(-1).to, 'exit');
  }
  assert.equal(r.completedBoth, 0); assert.equal(r.completionRate, 0); assert.equal(r.exited, 2);
});

test('picnic has no seat cap and requires two fully completed activities', () => {
  const guests = Array.from({ length: 60 }, (_, id) => candidate(id, {
    hauntedMinutes: 0.1, pumpkinMinutes: 0.1, picnicMinutes: 100
  }));
  const r = sim.simulateScenario(20, scenario(guests), { trace: true });
  assert.equal(r.completedBoth, 60);
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
  near(v.experience, Math.max(0, 100 - config.waitPenaltyPerMinute * wait -
    config.unfinishedActivityPenalty * (2 - completed.length)));
}

test('crowded seeded nights conserve guests, capacities, routes and cash flow', () => {
  let incompleteNights = 0, queuedGuests = 0;
  const config = sim.defaultConfig;
  for (let index = 0; index < 60; index++) {
    const r = sim.simulateNight(1, { seed: 'spatial-stress', index, trace: true });
    assert.equal(r.demand, r.admitted + r.turnedAway);
    assert.equal(r.admitted, r.visitors.length); assert.equal(r.exited, r.admitted);
    assert.ok(r.admitted <= config.maxAdmissions);
    near(r.revenue, r.price * r.admitted); near(r.fixedCost, sum(Object.values(config.costs)));
    near(r.profit, r.revenue - r.fixedCost);
    assert.equal(r.completedBoth, r.visitors.filter(v => v.completedActivities.length === 2).length);
    if (r.completedBoth < r.admitted) incompleteNights++;
    for (const v of r.visitors) {
      checkRoute(v, config);
      assert.ok(Number.isFinite(v.departure)); assert.ok(v.experience >= 0 && v.experience <= 100);
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

test('live experience counts only elapsed individual waiting and cries strictly below 90', () => {
  const r = sim.simulateScenario(20, scenario([
    candidate(0, { hauntedMinutes: 20 }), candidate(1)
  ]), { trace: true, config: { hauntedCapacity: 1, pumpkinCapacity: 1 } });
  const guest = r.visitors[1], queue = guest.segments.find(s => s.kind === 'queue');
  assert.ok(queue.end - queue.start > 12.5);
  assert.equal(sim.visitorExperienceAt(guest, guest.arrival - 1), null);
  near(sim.visitorExperienceAt(guest, guest.arrival), 100);
  near(sim.visitorExperienceAt(guest, queue.start), 100);
  near(sim.visitorExperienceAt(guest, queue.start + 5), 96);
  const boundary = sim.stateAt(r, queue.start + 12.5).guests.find(g => g.id === guest.id);
  assert.equal(boundary.experience, 90); assert.equal(boundary.expression, 'smile');
  const later = sim.stateAt(r, queue.start + 12.5001);
  const crying = later.guests.find(g => g.id === guest.id);
  assert.ok(crying.experience < 90); assert.equal(crying.expression, 'cry');
  const other = later.guests.find(g => g.id === 0);
  assert.equal(other.experience, 100); assert.equal(other.expression, 'smile');
  assert.throws(() => sim.visitorExperienceAt({ arrival: 0 }, 0));
  assert.throws(() => sim.visitorExperienceAt(guest, NaN));
});

test('unfinished activities reduce live experience only at closing, including exact finishes', () => {
  const walk = sim.walkMinutes('entrance', 'haunted', 80);
  const r = sim.simulateScenario(20, scenario([
    candidate(0, { hauntedMinutes: 120 - walk })
  ]), { trace: true });
  const guest = r.visitors[0];
  near(sim.visitorExperienceAt(guest, 119.999), 100);
  // The first activity ends exactly at closing; only the second is missed.
  near(sim.visitorExperienceAt(guest, 120), 75);
  const closing = sim.stateAt(r, 120).guests[0];
  assert.equal(closing.expression, 'cry'); assert.equal(closing.experience, 75);

  const late = sim.simulateScenario(20, scenario([
    candidate(0, { arrival: 89, hauntedMinutes: 60 })
  ]), { trace: true }).visitors[0];
  const queue = late.segments.find(s => s.kind === 'queue');
  near(sim.visitorExperienceAt(late, 119.999), 100 - 0.8 * (119.999 - queue.start));
  near(sim.visitorExperienceAt(late, 120), 100 - 0.8 * (120 - queue.start) - 50);
});

test('live experience at and after departure equals the final per-guest score', () => {
  const r = sim.simulateScenario(20, scenario([
    candidate(0, { hauntedMinutes: 20 }), candidate(1),
    candidate(2, { arrival: 89, hauntedMinutes: 60 })
  ]), { trace: true, config: { hauntedCapacity: 1, pumpkinCapacity: 1 } });
  assert.ok(r.visitors.some(v => v.completed));
  assert.ok(r.visitors.some(v => !v.completed));
  for (const guest of r.visitors) {
    near(sim.visitorExperienceAt(guest, guest.departure), guest.experience);
    near(sim.visitorExperienceAt(guest, guest.departure + 200), guest.experience);
    assert.ok(!sim.stateAt(r, guest.departure).guests.some(g => g.id === guest.id));
  }
});

test('backward seeking restores expressions without mutating final scores, profit or summaries', () => {
  const s = scenario([candidate(0, { hauntedMinutes: 20 }), candidate(1)]);
  const options = { trace: true, config: { hauntedCapacity: 1, pumpkinCapacity: 1 } };
  const r = sim.simulateScenario(20, s, options), before = JSON.stringify(r);
  const summary = sim.summarize([r]);
  const guest = r.visitors[1], queue = guest.segments.find(s => s.kind === 'queue');
  const earlyTime = queue.start + 5, early = sim.stateAt(r, earlyTime);
  assert.equal(early.guests.find(g => g.id === guest.id).expression, 'smile');
  assert.equal(sim.stateAt(r, queue.start + 15).guests.find(g => g.id === guest.id).expression, 'cry');
  assert.deepEqual(sim.stateAt(r, earlyTime), early);
  assert.equal(JSON.stringify(r), before);
  assert.deepEqual(sim.summarize([r]), summary);
  const fast = sim.simulateScenario(20, s, { ...options, trace: false });
  assert.deepEqual(scalarResult(r), scalarResult(fast));
  assert.deepEqual(sim.summarize([fast]), summary);
});

test('live experience preserves the trace configuration for wait penalties and closing', () => {
  const config = { hauntedCapacity: 1, pumpkinCapacity: 1, waitPenaltyPerMinute: 2,
    unfinishedActivityPenalty: 10, closeMinutes: 60, admissionCloseMinutes: 30,
    picnicCloseMinutes: 90, expressionThreshold: 80 };
  const r = sim.simulateScenario(20, scenario([
    candidate(0, { hauntedMinutes: 20 }), candidate(1),
    candidate(2, { arrival: 29, hauntedMinutes: 60 })
  ]), { trace: true, config });
  const guest = r.visitors[1], queue = guest.segments.find(s => s.kind === 'queue');
  near(sim.visitorExperienceAt(guest, queue.start + 5), 90);
  const boundary = sim.stateAt(r, queue.start + 10).guests.find(g => g.id === guest.id);
  assert.equal(boundary.experience, 80); assert.equal(boundary.expression, 'smile');
  assert.equal(sim.stateAt(r, queue.start + 10.001).guests.find(g => g.id === guest.id).expression, 'cry');
  const late = r.visitors[2], lateQueue = late.segments.find(s => s.kind === 'queue');
  near(sim.visitorExperienceAt(late, 59.999), Math.max(0, 100 - 2 * (59.999 - lateQueue.start)));
  near(sim.visitorExperienceAt(late, 60), Math.max(0, 100 - 2 * (60 - lateQueue.start) - 20));
  for (const visitor of r.visitors) near(sim.visitorExperienceAt(visitor, visitor.departure), visitor.experience);
});

console.log(`\n${passed} behavioral tests passed.`);
