import { CITIES, LINKS } from '../data/cities.js';
import { getDiseaseType } from '../data/diseaseTypes.js';
import { makeRng } from './rng.js';

// Build a normalised, validated world graph from the raw city/link data.
// Links are symmetrised (a<->b) and connectivity is asserted so no city is
// permanently unreachable. Cached because the topology never changes.
let _worldCache = null;
export function buildWorld() {
  if (_worldCache) return _worldCache;
  const cities = {};
  const order = [];
  for (const c of CITIES) {
    cities[c.id] = { ...c };
    order.push(c.id);
  }
  const adjacency = {};
  for (const id of order) adjacency[id] = [];
  const seen = new Set();
  for (const [a, b, kind] of LINKS) {
    if (!cities[a] || !cities[b]) throw new Error(`Link references unknown city: ${a}->${b}`);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue; // de-dupe accidental repeats
    seen.add(key);
    adjacency[a].push({ to: b, kind });
    adjacency[b].push({ to: a, kind });
  }
  // Connectivity check (BFS from first city must reach all).
  const reached = new Set([order[0]]);
  const queue = [order[0]];
  while (queue.length) {
    const cur = queue.shift();
    for (const { to } of adjacency[cur]) {
      if (!reached.has(to)) {
        reached.add(to);
        queue.push(to);
      }
    }
  }
  if (reached.size !== order.length) {
    const missing = order.filter((id) => !reached.has(id));
    throw new Error(`World graph is not fully connected. Unreachable: ${missing.join(', ')}`);
  }
  _worldCache = { cities, order, adjacency };
  return _worldCache;
}

export function totalWorldPopulation() {
  return buildWorld().order.reduce((s, id) => s + buildWorld().cities[id].pop, 0);
}

// Deep-ish clone of a stats object so each player gets independent stats.
function cloneStats(base) {
  return {
    infectivity: base.infectivity,
    severity: base.severity,
    lethality: base.lethality,
    vectors: { ...base.vectors },
    resist: { ...base.resist },
  };
}

// players config: [{ id, name, diseaseName, typeId, isAI }]
// startCityId: where each disease seeds (defaults to a deterministic spread of
// distinct cities so players don't all start on top of each other).
export function createInitialState(config) {
  const world = buildWorld();
  const rng = makeRng(config.seed >>> 0);
  const state = {
    seed: config.seed >>> 0,
    tick: 0,
    status: 'running',
    winner: null,
    rngState: rng.state(),
    infections: {}, // cityId -> { playerId -> infectedFraction }
    dead: {}, // cityId -> fraction of original pop dead
    immune: {}, // cityId -> fraction recovered/vaccinated (immune to all)
    lockdowns: {}, // cityId -> ticks remaining
    bubbles: [], // { id, cityId, playerId, value, ttl }
    nextBubbleId: 1,
    players: [],
  };
  for (const id of world.order) {
    state.infections[id] = {};
    state.dead[id] = 0;
    state.immune[id] = 0;
  }

  // Assign distinct, geographically spread starting cities.
  const candidateStarts = ['lag', 'del', 'mex', 'bej', 'bra', 'mos', 'cai', 'jak', 'lim', 'ist'];
  const shuffled = [...candidateStarts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  config.players.forEach((p, idx) => {
    const type = getDiseaseType(p.typeId);
    const start = p.startCityId || shuffled[idx % shuffled.length];
    const player = {
      id: p.id,
      name: p.name,
      diseaseName: p.diseaseName || `${type.name} ${idx + 1}`,
      typeId: type.id,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      typeColor: type.color, // representative colour of the strain (for flavour)
      isAI: !!p.isAI,
      faction: 'disease', // 'disease' | 'cure'
      alive: true,
      eliminatedTick: null,
      startCity: start,
      stats: cloneStats(type.base),
      trait: type.trait.id,
      flags: [], // capstone 'special' abilities unlocked via the skill tree
      owned: [],
      dna: 0,
      points: 0, // cure-faction research points (after elimination)
      cureProgress: 0, // 0..100 research against this disease
      attention: 0,
      ever: false, // has this disease ever had presence (for elimination logic)
      // running tallies for scoring
      infectedTotal: 0, // cumulative people infected (millions)
      killedTotal: 0, // cumulative people killed (millions)
      score: 0,
    };
    // Seed the disease in its start city.
    const seedFrac = 0.0006;
    state.infections[start][player.id] = seedFrac;
    player.ever = true;
    state.players.push(player);
  });

  state.rngState = rng.state();
  return state;
}

export function getPlayer(state, id) {
  return state.players.find((p) => p.id === id);
}

// Distinct, high-contrast player colours assigned by slot, independent of the
// chosen disease type — so two players who both pick "Virus" are still visually
// distinguishable on the map. Order chosen for maximum separation.
export const PLAYER_COLORS = ['#ff4d5e', '#36d1dc', '#7be36b', '#ffd23f', '#b07bff', '#ff8c42'];
