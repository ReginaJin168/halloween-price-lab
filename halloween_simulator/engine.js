/* Halloween Event Lab — spatial, finite-horizon classroom simulation (v2). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HalloweenSim = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function deepFreeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }
  const defaultConfig = deepFreeze({
    minPrice: 1, maxPrice: 100, defaultPrice: 20,
    openTime: '18:00', closeTime: '20:00', closeMinutes: 120,
    admissionCloseMinutes: 90, picnicCloseMinutes: 150,
    staffShiftStartMinutes: -15, staffShiftEndMinutes: 165,
    maxAdmissions: 400, hauntedCapacity: 20, pumpkinCapacity: 24,
    staff: { entrance: 2, haunted: 2, pumpkin: 3, picnic: 1, total: 8 },
    costs: { staff: 600, pumpkinMaterials: 800, siteSetup: 400 },
    totalFixedCost: 1800,
    basePotentialVisitors: 600, willingnessMean: 24, demandCV: 0.25,
    weather: [
      { name: 'Clear', probability: 0.65, multiplier: 1 },
      { name: 'Warm', probability: 0.20, multiplier: 0.9 },
      { name: 'Rain', probability: 0.15, multiplier: 0.65 }
    ],
    arrivalWeights: [0.30, 0.42, 0.28],
    hauntedMean: 8, hauntedShape: 9,
    pumpkinMean: 10, pumpkinShape: 9,
    picnicMean: 18, picnicShape: 4,
    walkingSpeed: 80, walkingSpeedMinFactor: 0.8, walkingSpeedMaxFactor: 1.2,
    waitPenaltyPerMinute: 0.8, unfinishedActivityPenalty: 25, expressionThreshold: 90,
    map: {
      width: 1000, height: 600,
      nodes: {
        entrance: { x: 170, y: 430 }, haunted: { x: 285, y: 180 },
        pumpkin: { x: 755, y: 180 }, picnic: { x: 750, y: 440 },
        exit: { x: 935, y: 530 }
      },
      edges: [
        ['entrance', 'haunted'], ['entrance', 'pumpkin'], ['haunted', 'pumpkin'],
        ['haunted', 'picnic'], ['pumpkin', 'picnic'],
        ['haunted', 'exit'], ['pumpkin', 'exit'], ['picnic', 'exit']
      ]
    }
  });
  const defaultPlan = Object.freeze({ price: defaultConfig.defaultPrice });
  const EPSILON = 1e-9;

  function resolveConfig(overrides) {
    const c = Object.assign({}, defaultConfig, overrides || {});
    c.costs = Object.assign({}, defaultConfig.costs, overrides && overrides.costs);
    c.staff = Object.assign({}, defaultConfig.staff, overrides && overrides.staff);
    c.map = Object.assign({}, defaultConfig.map, overrides && overrides.map);
    c.map.nodes = Object.assign({}, defaultConfig.map.nodes,
      overrides && overrides.map && overrides.map.nodes);
    // Costs are components, so the displayed total and cashflow always agree.
    c.totalFixedCost = Object.values(c.costs).reduce((sum, amount) => sum + amount, 0);
    for (const key of ['minPrice', 'maxPrice', 'defaultPrice', 'closeMinutes',
      'admissionCloseMinutes', 'picnicCloseMinutes', 'willingnessMean', 'hauntedMean',
      'hauntedShape', 'pumpkinMean', 'pumpkinShape', 'picnicMean', 'picnicShape',
      'walkingSpeed', 'walkingSpeedMinFactor', 'walkingSpeedMaxFactor']) {
      if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error('Invalid configuration: ' + key);
    }
    for (const key of ['maxAdmissions', 'hauntedCapacity', 'pumpkinCapacity']) {
      if (!Number.isInteger(c[key]) || c[key] < 1) throw new Error('Invalid configuration: ' + key);
    }
    for (const key of ['basePotentialVisitors', 'demandCV', 'waitPenaltyPerMinute', 'unfinishedActivityPenalty', 'expressionThreshold']) {
      if (!Number.isFinite(c[key]) || c[key] < 0) throw new Error('Invalid configuration: ' + key);
    }
    if (c.expressionThreshold > 100 || c.minPrice > c.maxPrice || c.defaultPrice < c.minPrice || c.defaultPrice > c.maxPrice ||
        c.admissionCloseMinutes > c.closeMinutes || c.picnicCloseMinutes <= c.closeMinutes ||
        c.walkingSpeedMinFactor > c.walkingSpeedMaxFactor)
      throw new Error('Invalid configuration ranges or closing times.');
    if (Object.values(c.costs).some(amount => !Number.isFinite(amount) || amount < 0))
      throw new Error('Fixed cost components must be finite and nonnegative.');
    if (!Array.isArray(c.arrivalWeights) || !c.arrivalWeights.length ||
        c.arrivalWeights.some(x => !Number.isFinite(x) || x < 0) ||
        Math.abs(c.arrivalWeights.reduce((sum, x) => sum + x, 0) - 1) > EPSILON)
      throw new Error('Arrival weights must sum to one.');
    if (!Array.isArray(c.weather) || !c.weather.length ||
        c.weather.some(w => typeof w.name !== 'string' || !Number.isFinite(w.probability) ||
          w.probability < 0 || !Number.isFinite(w.multiplier) || w.multiplier < 0) ||
        Math.abs(c.weather.reduce((sum, w) => sum + w.probability, 0) - 1) > EPSILON)
      throw new Error('Weather probabilities must sum to one.');
    for (const name of ['entrance', 'haunted', 'pumpkin', 'picnic', 'exit']) {
      const point = c.map.nodes[name];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        throw new Error('Missing or invalid map node: ' + name);
    }
    return c;
  }
  function validatePrice(price, overrides) {
    const c = resolveConfig(overrides);
    const errors = [];
    if (typeof price !== 'number' || !Number.isFinite(price) || price < c.minPrice || price > c.maxPrice)
      errors.push('Ticket price must be a number from $' + c.minPrice + ' to $' + c.maxPrice + '.');
    return { valid: errors.length === 0, errors };
  }

  function hashSeed(value) {
    const str = String(value);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
    return h >>> 0;
  }
  function randomStream(seed) {
    let state = hashSeed(seed);
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
    };
  }
  function normal(rng) { return Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng()); }
  function gamma(shape, scale, rng) {
    if (shape < 1) return gamma(shape + 1, scale, rng) * Math.pow(rng(), 1 / shape);
    const d = shape - 1 / 3, k = 1 / Math.sqrt(9 * d);
    for (;;) {
      const z = normal(rng), base = 1 + k * z;
      if (base <= 0) continue;
      const v = base * base * base, u = rng();
      if (u < 1 - 0.0331 * z ** 4 || Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v)))
        return scale * d * v;
    }
  }
  function poisson(mean, rng) {
    let total = 0, remaining = mean;
    while (remaining > 0) {
      const chunk = Math.min(remaining, 25), threshold = Math.exp(-chunk);
      let product = 1, count = 0;
      do { count++; product *= rng(); } while (product > threshold);
      total += count - 1; remaining -= chunk;
    }
    return total;
  }
  function pickWeighted(items, rng, weight) {
    const u = rng(); let cumulative = 0;
    for (const item of items) { cumulative += weight(item); if (u < cumulative) return item; }
    return items[items.length - 1];
  }

  // The candidate bank, including willingness to pay and all personal timings,
  // depends on the scenario alone. A higher price retains a nested subset.
  function generateScenario(seed, index, overrides) {
    const c = resolveConfig(overrides);
    if (!Number.isInteger(index) || index < 0) throw new Error('Night index must be a nonnegative integer.');
    const rng = randomStream(JSON.stringify(['night', String(seed), index]));
    const weather = pickWeighted(c.weather, rng, w => w.probability);
    const crowdMultiplier = c.demandCV === 0 ? 1 : gamma(1 / (c.demandCV * c.demandCV), c.demandCV * c.demandCV, rng);
    const expected = c.basePotentialVisitors * weather.multiplier * crowdMultiplier;
    if (!Number.isFinite(expected) || expected > 100000) throw new Error('Candidate bank is too large.');
    const count = poisson(expected, rng), candidates = [];
    for (let id = 0; id < count; id++) {
      const r = randomStream(JSON.stringify(['visitor', String(seed), index, id]));
      const slot = pickWeighted(c.arrivalWeights.map((weight, i) => ({ weight, i })), r, x => x.weight).i;
      candidates.push({
        id, arrival: (slot + r()) * c.admissionCloseMinutes / c.arrivalWeights.length,
        willingnessToPay: -c.willingnessMean * Math.log(r()),
        firstLocation: r() < 0.5 ? 'haunted' : 'pumpkin',
        hauntedMinutes: gamma(c.hauntedShape, c.hauntedMean / c.hauntedShape, r),
        pumpkinMinutes: gamma(c.pumpkinShape, c.pumpkinMean / c.pumpkinShape, r),
        picnicMinutes: gamma(c.picnicShape, c.picnicMean / c.picnicShape, r),
        walkingSpeed: c.walkingSpeed * (c.walkingSpeedMinFactor +
          r() * (c.walkingSpeedMaxFactor - c.walkingSpeedMinFactor))
      });
    }
    candidates.sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    return { seed: String(seed), index, weather: weather.name,
      weatherMultiplier: weather.multiplier, crowdMultiplier, candidates };
  }

  class EventHeap {
    constructor() { this.items = []; this.serial = 0; }
    before(a, b) { return a.time < b.time || (a.time === b.time &&
      (a.priority < b.priority || (a.priority === b.priority && a.serial < b.serial))); }
    push(time, type, visitor, location, slot) {
      const priority = type === 'finish' ? 0 : type === 'close' ? 1 : 2;
      const event = { time, type, visitor, location, slot, priority, serial: this.serial++ };
      const a = this.items; a.push(event); let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (!this.before(event, a[p])) break; a[i] = a[p]; i = p; }
      a[i] = event;
    }
    pop() {
      const a = this.items, first = a[0], last = a.pop();
      if (a.length) {
        let i = 0;
        for (;;) {
          const left = 2 * i + 1, right = left + 1;
          if (left >= a.length) break;
          const child = right < a.length && this.before(a[right], a[left]) ? right : left;
          if (!this.before(a[child], last)) break;
          a[i] = a[child]; i = child;
        }
        a[i] = last;
      }
      return first;
    }
    get size() { return this.items.length; }
  }
  function distance(from, to, configuration) {
    const c = configuration || defaultConfig;
    const a = c.map.nodes[from], b = c.map.nodes[to];
    if (!a || !b) throw new Error('Unknown map location.');
    const connected = c.map.edges.some(edge =>
      (edge[0] === from && edge[1] === to) || (edge[0] === to && edge[1] === from));
    if (!connected) throw new Error('There is no walking path from ' + from + ' to ' + to + '.');
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
  function walkMinutes(from, to, walkingSpeed, configuration) {
    if (!Number.isFinite(walkingSpeed) || walkingSpeed <= 0) throw new Error('Walking speed must be positive.');
    return distance(from, to, configuration) / walkingSpeed;
  }

  function validateScenario(scenario, c) {
    if (!scenario || !Array.isArray(scenario.candidates)) throw new Error('A scenario needs a candidate bank.');
    const ids = new Set();
    for (const guest of scenario.candidates) {
      if (!Number.isInteger(guest.id) || guest.id < 0 || ids.has(guest.id))
        throw new Error('Candidate IDs must be unique nonnegative integers.');
      ids.add(guest.id);
      if (!Number.isFinite(guest.arrival) || guest.arrival < 0 || guest.arrival > c.admissionCloseMinutes ||
          !Number.isFinite(guest.willingnessToPay) || guest.willingnessToPay < 0 ||
          !['haunted', 'pumpkin'].includes(guest.firstLocation))
        throw new Error('Invalid candidate arrival, willingness to pay, or route.');
      for (const key of ['hauntedMinutes', 'pumpkinMinutes', 'picnicMinutes', 'walkingSpeed'])
        if (!Number.isFinite(guest[key]) || guest[key] <= 0) throw new Error('Candidate ' + key + ' must be positive.');
    }
  }

  function simulateScenario(price, scenario, options) {
    const opts = options || {}, c = resolveConfig(opts.config), trace = opts.trace !== false;
    const validation = validatePrice(price, c);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    validateScenario(scenario, c);
    const interested = scenario.candidates.filter(v => v.willingnessToPay >= price)
      .sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    const visitors = interested.slice(0, c.maxAdmissions).map(candidate => Object.assign({}, candidate, {
      completed: false, completedActivities: [], waitMinutes: 0, totalWait: 0,
      experience: null, departure: null, segments: trace ? [] : undefined,
      experienceRules: trace ? {
        closeMinutes: c.closeMinutes, waitPenaltyPerMinute: c.waitPenaltyPerMinute,
        unfinishedActivityPenalty: c.unfinishedActivityPenalty,
        expressionThreshold: c.expressionThreshold
      } : undefined
    }));
    const heap = new EventHeap();
    const sites = {
      haunted: { seats: Array(c.hauntedCapacity).fill(null), queue: [], head: 0 },
      pumpkin: { seats: Array(c.pumpkinCapacity).fill(null), queue: [], head: 0 }
    };
    let endTime = 0;
    function segment(v, value) { if (trace && value.end > value.start) v.segments.push(value); }
    function walk(v, from, to, time, type) {
      const end = time + walkMinutes(from, to, v.walkingSpeed, c);
      segment(v, { kind: 'walk', start: time, end, from, to });
      heap.push(end, type, v, to);
    }
    function leave(v, from, time) { walk(v, from, 'exit', time, 'exit'); }
    function finishQueue(v, location, time) {
      const wait = Math.max(0, time - v.queueStart);
      v.waitMinutes += wait;
      segment(v, { kind: 'queue', start: v.queueStart, end: time, location, slot: v.queueOrder });
      delete v.queueStart; delete v.queueOrder;
    }
    function startAvailable(location, time) {
      const site = sites[location];
      if (time >= c.closeMinutes) return;
      while (site.head < site.queue.length) {
        const slot = site.seats.indexOf(null);
        if (slot < 0) return;
        const v = site.queue[site.head], duration = v[location + 'Minutes'];
        // Strict FIFO: a late head stays in line, even if a shorter later visit
        // could fit. Nobody can overtake and nobody abandons before closing.
        if (time + duration > c.closeMinutes + EPSILON) return;
        site.head++; finishQueue(v, location, time); site.seats[slot] = v;
        const end = Math.min(c.closeMinutes, time + duration);
        segment(v, { kind: 'activity', start: time, end, location, slot });
        heap.push(end, 'finish', v, location, slot);
      }
    }
    for (const v of visitors) heap.push(v.arrival, 'entrance', v, 'entrance');
    heap.push(c.closeMinutes, 'close');
    while (heap.size) {
      const e = heap.pop(), v = e.visitor, t = e.time, location = e.location;
      if (e.type === 'entrance') {
        walk(v, 'entrance', v.firstLocation, t, 'join');
      } else if (e.type === 'join') {
        if (t >= c.closeMinutes) { leave(v, location, t); continue; }
        const site = sites[location];
        v.queueStart = t; v.queueOrder = site.queue.length;
        site.queue.push(v); startAvailable(location, t);
      } else if (e.type === 'finish') {
        sites[location].seats[e.slot] = null;
        v.completedActivities.push(location);
        if (v.completedActivities.length === 2) {
          v.completed = true; walk(v, location, 'picnic', t, 'picnic');
        } else {
          const next = location === 'haunted' ? 'pumpkin' : 'haunted';
          walk(v, location, next, t, 'join');
        }
        startAvailable(location, t);
      } else if (e.type === 'close') {
        for (const name of ['haunted', 'pumpkin']) {
          const site = sites[name];
          while (site.head < site.queue.length) {
            const waiting = site.queue[site.head++];
            finishQueue(waiting, name, t); leave(waiting, name, t);
          }
        }
      } else if (e.type === 'picnic') {
        // Default travel times ensure completion by 120 reaches picnic before
        // 150. A custom oversized map can instead miss picnic closing.
        const end = Math.min(t + v.picnicMinutes, c.picnicCloseMinutes);
        if (end > t) {
          segment(v, { kind: 'picnic', start: t, end, location: 'picnic', slot: v.id });
          heap.push(end, 'picnicEnd', v, 'picnic');
        } else leave(v, 'picnic', t);
      } else if (e.type === 'picnicEnd') {
        leave(v, 'picnic', t);
      } else if (e.type === 'exit') {
        v.departure = t; v.totalWait = v.waitMinutes;
        v.experience = Math.max(0, 100 - c.waitPenaltyPerMinute * v.waitMinutes -
          c.unfinishedActivityPenalty * (2 - v.completedActivities.length));
        endTime = Math.max(endTime, t);
      }
    }
    const admitted = visitors.length, completedBoth = visitors.filter(v => v.completed).length;
    const sumExperience = visitors.reduce((sum, v) => sum + v.experience, 0);
    const sumWait = visitors.reduce((sum, v) => sum + v.waitMinutes, 0);
    const revenue = price * admitted;
    const result = {
      price, seed: String(scenario.seed), index: scenario.index, weather: scenario.weather,
      demand: interested.length, potentialDemand: interested.length, admitted,
      turnedAway: interested.length - admitted, revenue, fixedCost: c.totalFixedCost,
      profit: revenue - c.totalFixedCost,
      experience: admitted ? sumExperience / admitted : null,
      completedBoth, completionRate: admitted ? completedBoth / admitted : null,
      meanWait: admitted ? sumWait / admitted : null,
      endTime, exited: admitted
    };
    if (trace) result.visitors = visitors;
    return result;
  }
  function simulateNight(price, options) {
    const opts = Object.assign({ seed: 'classroom-2026', index: 0, trace: true }, options || {});
    const validation = validatePrice(price, opts.config);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    return simulateScenario(price, generateScenario(opts.seed, opts.index, opts.config), opts);
  }

  function summarize(results) {
    if (!Array.isArray(results) || !results.length) throw new Error('Summarize needs at least one simulated night.');
    const runs = results.length, totalAdmitted = results.reduce((sum, r) => sum + r.admitted, 0);
    const average = key => results.reduce((sum, r) => sum + r[key], 0) / runs;
    const nonempty = results.filter(r => r.admitted > 0);
    return {
      runs, avgProfit: average('profit'), avgRevenue: average('revenue'),
      avgFixedCost: average('fixedCost'), avgDemand: average('demand'),
      avgAdmitted: average('admitted'), avgTurnedAway: average('turnedAway'),
      avgCompletedBoth: average('completedBoth'),
      avgExperience: totalAdmitted ? results.reduce((sum, r) => sum + (r.experience || 0) * r.admitted, 0) / totalAdmitted : null,
      meanNightExperience: nonempty.length ? nonempty.reduce((sum, r) => sum + r.experience, 0) / nonempty.length : null,
      completionRate: totalAdmitted ? results.reduce((sum, r) => sum + r.completedBoth, 0) / totalAdmitted : null,
      meanWait: totalAdmitted ? results.reduce((sum, r) => sum + (r.meanWait || 0) * r.admitted, 0) / totalAdmitted : null,
      lossProbability: results.filter(r => r.profit < 0).length / runs,
      noAdmissionProbability: results.filter(r => r.admitted === 0).length / runs,
      totalAdmitted
    };
  }

  // Replay is causal: only waiting that has happened counts. Unfinished
  // activities become a lost opportunity at closing, not on first arrival.
  // Recompute from the trace so seeking backwards restores the earlier score.
  function visitorExperienceAt(visitor, time) {
    if (!visitor || !Array.isArray(visitor.segments))
      throw new Error('Live experience needs a visitor simulated with trace:true.');
    if (!Number.isFinite(time)) throw new Error('Animation time must be finite.');
    if (time < visitor.arrival) return null;
    const c = visitor.experienceRules || defaultConfig;
    let waited = 0, completed = 0;
    for (const segment of visitor.segments) {
      if (segment.kind === 'queue')
        waited += Math.max(0, Math.min(time, segment.end) - segment.start);
      if (segment.kind === 'activity' && segment.end <= time) completed++;
    }
    const missing = time >= c.closeMinutes ? 2 - completed : 0;
    return Math.max(0, 100 - c.waitPenaltyPerMinute * waited -
      c.unfinishedActivityPenalty * missing);
  }

  function stateAt(night, time) {
    if (!night || !Array.isArray(night.visitors)) throw new Error('Animation needs a night simulated with trace:true.');
    if (!Number.isFinite(time)) throw new Error('Animation time must be finite.');
    const counts = {};
    for (const name of ['entrance', 'haunted', 'pumpkin', 'picnic']) counts[name] = { inside: 0, queue: 0 };
    const guests = []; let arrived = 0, exited = 0;
    for (const v of night.visitors) {
      if (v.arrival > time) continue;
      arrived++;
      if (v.departure <= time) { exited++; continue; }
      const s = v.segments.find(segment => segment.start <= time && segment.end > time);
      if (!s) continue;
      const experience = visitorExperienceAt(v, time);
      const guest = { id: v.id, kind: s.kind, location: s.location, experience,
        expression: experience < (v.experienceRules || defaultConfig).expressionThreshold ? 'cry' : 'smile',
        from: s.from, to: s.to, progress: (time - s.start) / (s.end - s.start), slot: s.slot };
      guests.push(guest);
      if (s.kind === 'queue') counts[s.location].queue++;
      else if (s.kind === 'activity' || s.kind === 'picnic') counts[s.location].inside++;
    }
    for (const location of ['haunted', 'pumpkin']) {
      // Convert immutable queue order into the current visible queue rank.
      guests.filter(g => g.kind === 'queue' && g.location === location)
        .sort((a, b) => a.slot - b.slot).forEach((g, rank) => { g.slot = rank; });
    }
    return { guests, counts, arrived, exited };
  }

  return Object.freeze({ version: '2.0.1', defaultConfig, config: defaultConfig, defaultPlan,
    validatePrice, resolveConfig, generateScenario, simulateScenario, simulateNight,
    summarize, stateAt, visitorExperienceAt, distance, walkMinutes });
});
