import { buildWorld } from './state.js';
import { makeRng } from './rng.js';
import { getNode, prereqsMet } from '../data/skillTree.js';
import { WORLD, DISEASE, CURE, WEALTH_MOD, TICK } from './constants.js';
import { computeScores, checkEndConditions } from './scoring.js';

// ── stat helpers ────────────────────────────────────────────────────────────

// Environmental multiplier for a disease in a city, based on climate vs. the
// disease's heat/cold resistance. Hot/arid punish unless heat-resistant; cold
// punishes unless cold-resistant; temperate/humid are neutral/slightly kind.
function envMult(player, city) {
  const r = player.stats.resist;
  let m = 1;
  if (city.climate === 'hot' || city.climate === 'arid') m = 0.5 + Math.min(0.6, r.heat);
  else if (city.climate === 'cold') m = 0.5 + Math.min(0.6, r.cold);
  else if (city.climate === 'humid') m = 1.05;
  else m = 1.0;
  // Bacteria's "Hardened Shell" softens climate penalties.
  if (player.trait === 'hardened' && m < 1) m = 1 - (1 - m) * 0.6;
  // "Extremophile" capstone removes climate penalties entirely.
  if (m < 1 && hasFlag(player, 'extremophile')) m = 1.0;
  return Math.max(0.25, Math.min(1.15, m));
}

// Does a player have a given capstone special ability unlocked?
function hasFlag(player, flag) {
  return player.flags && player.flags.includes(flag);
}

// Bonus to cross-border export along a link, based on the relevant vector.
function vectorBonus(player, kind) {
  const v = player.stats.vectors;
  if (kind === 'air') return 1 + v.air * 1.6;
  if (kind === 'sea') return 1 + v.water * 1.6;
  return 1 + (v.animal * 0.9 + 0.15); // land: animals + general mobility
}

// Susceptible fraction available in a city right now.
function susceptible(state, cityId) {
  const inf = state.infections[cityId];
  let sumInf = 0;
  for (const pid in inf) sumInf += inf[pid];
  return Math.max(0, 1 - state.dead[cityId] - state.immune[cityId] - sumInf);
}

// ── the tick ─────────────────────────────────────────────────────────────────

export function step(state) {
  if (state.status !== 'running') return state;
  const world = buildWorld();
  const rng = makeRng(state.rngState);

  const diseases = state.players.filter((p) => p.faction === 'disease');
  const newInfectedMillions = {}; // playerId -> millions infected this tick
  const newKilledMillions = {}; // playerId -> millions killed this tick
  for (const p of state.players) {
    newInfectedMillions[p.id] = 0;
    newKilledMillions[p.id] = 0;
  }

  // Snapshot infections so migration uses consistent start-of-tick values.
  const snap = {};
  for (const id of world.order) snap[id] = { ...state.infections[id] };

  // ── 1. Cross-border migration (Risk-style spread along links) ──
  // A lockdown normally severs a city's links. The "aerosol" capstone lets a
  // disease keep crossing AIR links even through locked-down cities.
  for (const id of world.order) {
    for (const link of world.adjacency[id]) {
      const dst = link.to;
      if (dst < id) continue; // handle each undirected pair once
      const locked = state.lockdowns[id] > 0 || state.lockdowns[dst] > 0;
      const weight = WORLD.LINK_WEIGHT[link.kind];
      for (const p of diseases) {
        if (locked && !(link.kind === 'air' && hasFlag(p, 'aerosol'))) continue;
        const Ia = snap[id][p.id] || 0;
        const Ib = snap[dst][p.id] || 0;
        const broadcast = p.trait === 'broadcast';
        // a -> dst
        if (Ia > WORLD.EXPORT_THRESHOLD || (broadcast && Ia > 0)) {
          const flow = WORLD.EXPORT_RATE * weight * Ia * vectorBonus(p, link.kind);
          seedInfection(state, dst, p.id, flow);
        }
        // dst -> a
        if (Ib > WORLD.EXPORT_THRESHOLD || (broadcast && Ib > 0)) {
          const flow = WORLD.EXPORT_RATE * weight * Ib * vectorBonus(p, link.kind);
          seedInfection(state, id, p.id, flow);
        }
      }
    }
  }

  // ── 2. Within-city growth, deaths, and cure-driven recovery ──
  for (const id of world.order) {
    const city = world.cities[id];
    const inf = state.infections[id];
    const heal = WEALTH_MOD[city.wealth].healthcare;
    let S = susceptible(state, id);

    // Growth: every disease present draws from the shared susceptible pool.
    const requests = [];
    let totalReq = 0;
    for (const p of diseases) {
      const Ip = inf[p.id] || 0;
      if (Ip <= 0) continue;
      const growth = WORLD.BASE_GROWTH * p.stats.infectivity * envMult(p, city);
      const contact = Ip + 0.0006; // small contact floor so footholds can grow
      const want = growth * contact * S * 1.6; // logistic spread within the city
      if (want > 0) {
        requests.push([p.id, want]);
        totalReq += want;
      }
    }
    if (totalReq > 0) {
      const scale = totalReq > S ? S / totalReq : 1;
      for (const [pid, want] of requests) {
        const add = want * scale;
        inf[pid] = (inf[pid] || 0) + add;
        newInfectedMillions[pid] += add * city.pop;
      }
      S = susceptible(state, id);
    }

    // Deaths: lethality converts infected -> dead, dampened by healthcare.
    for (const p of diseases) {
      const Ip = inf[p.id] || 0;
      if (Ip <= 0) continue;
      const deaths = Math.min(Ip, (p.stats.lethality * Ip * 0.025) / heal);
      if (deaths > 0) {
        inf[p.id] = Ip - deaths;
        state.dead[id] += deaths;
        newKilledMillions[p.id] += deaths * city.pop;
      }
    }

    // Cure recovery: once a disease is fully researched, it gets scrubbed out.
    for (const p of diseases) {
      if (p.cureProgress >= 100 && inf[p.id] > 0) {
        const recover = inf[p.id] * 0.12;
        inf[p.id] = Math.max(0, inf[p.id] - recover);
        state.immune[id] += recover;
        if (inf[p.id] < 1e-9) delete inf[p.id];
      }
    }
  }

  // ── 3. Lockdown timers ──
  for (const id in state.lockdowns) {
    if (state.lockdowns[id] > 0) state.lockdowns[id] -= 1;
  }

  // ── 4. DNA / points income, attention, and cure research ──
  for (const p of diseases) {
    const infM = newInfectedMillions[p.id];
    const killM = newKilledMillions[p.id];
    p.infectedTotal += infM;
    p.killedTotal += killM;
    // "fast_metabolism" doubles passive income; "necrosis" boosts kill income.
    const passive = DISEASE.DNA_PER_TICK * (hasFlag(p, 'fast_metabolism') ? 2.2 : 1);
    const killMult = hasFlag(p, 'necrosis') ? 1.6 : 1;
    const income =
      passive +
      infM * DISEASE.DNA_PER_MILLION_INFECTED +
      killM * DISEASE.DNA_PER_MILLION_KILLED * killMult;
    p.dna += income;

    // Virus mutates: occasional free micro-boosts.
    if (p.trait === 'mutator' && rng.chance(0.04)) {
      const stat = rng.pick(['infectivity', 'severity', 'lethality']);
      p.stats[stat] += 0.01;
    }
    // Bioweapon escalates lethality on its own.
    if (p.trait === 'escalation') p.stats.lethality += 0.0012;

    // Attention rises with severity and fresh deaths; some types stay quiet.
    let attn = p.stats.severity * CURE.ATTENTION_PER_SEVERITY + killM * CURE.ATTENTION_PER_DEATH_MILLION;
    if (p.trait === 'stealth') attn *= 0.7;
    if (hasFlag(p, 'asymptomatic')) attn *= 0.5; // capstone: stay under the radar
    p.attention = Math.min(100, p.attention + attn);

    // Cure research: faster when wealthy cities are infected; resist.drug and
    // the prion's neural trait slow it. Eliminated players (cure faction) can
    // accelerate it dramatically with fund_research actions.
    let richExposure = 0;
    for (const id of world.order) {
      const c = world.cities[id];
      if ((state.infections[id][p.id] || 0) > 0.01) {
        richExposure += WEALTH_MOD[c.wealth].research;
      }
    }
    const drugMod = Math.max(0.2, 1 - p.stats.resist.drug);
    const neuralMod = p.trait === 'neural' ? 0.65 : 1;
    const immunityMod = hasFlag(p, 'drug_immunity') ? 0.4 : 1; // capstone: cripple the cure
    const research =
      CURE.BASE_RATE * (p.attention / 100) * (1 + richExposure * 0.15) * drugMod * neuralMod * immunityMod;
    p.cureProgress = Math.min(100, p.cureProgress + research);
  }

  // ── 5. Cure-faction passive income (eliminated players still play) ──
  for (const p of state.players) {
    if (p.faction === 'cure') {
      p.points += DISEASE.DNA_PER_TICK * 2.2;
    }
  }

  // ── 6. DNA bubbles (collectible boosts over actively-infected cities) ──
  updateBubbles(state, rng, diseases, world);

  // ── 7. Advance clock, recompute scores, check for a winner ──
  state.tick += 1;
  computeScores(state, world);
  markEliminations(state, world);
  checkEndConditions(state, world);

  state.rngState = rng.state();
  return state;
}

// Add infection to a destination city, bounded by its available susceptibles.
function seedInfection(state, cityId, playerId, amount) {
  if (amount <= 0) return;
  const S = susceptible(state, cityId);
  const add = Math.min(amount, S);
  if (add <= 0) return;
  state.infections[cityId][playerId] = (state.infections[cityId][playerId] || 0) + add;
}

function updateBubbles(state, rng, diseases, world) {
  // Decay existing bubbles.
  state.bubbles = state.bubbles.filter((b) => {
    b.ttl -= 1;
    return b.ttl > 0;
  });
  // Occasionally spawn a bubble over a city a disease meaningfully infects.
  for (const p of diseases) {
    if (!rng.chance(DISEASE.BUBBLE_SPAWN_CHANCE)) continue;
    const owned = world.order.filter((id) => (state.infections[id][p.id] || 0) > 0.02);
    if (!owned.length) continue;
    const cityId = rng.pick(owned);
    state.bubbles.push({
      id: state.nextBubbleId++,
      cityId,
      playerId: p.id,
      value: DISEASE.BUBBLE_VALUE,
      ttl: DISEASE.BUBBLE_TTL_TICKS,
    });
  }
}

// Flip diseases that have been completely eradicated into the Cure faction.
function markEliminations(state, world) {
  for (const p of state.players) {
    if (p.faction !== 'disease' || !p.ever) continue;
    let presence = 0;
    for (const id of world.order) presence += state.infections[id][p.id] || 0;
    if (presence < 1e-7) {
      p.faction = 'cure';
      p.alive = false;
      p.eliminatedTick = state.tick;
      p.points += 12; // a parting research grant so they can act immediately
    }
  }
}

// ── command application (the only way to mutate intent) ──────────────────────

export function applyCommand(state, cmd) {
  const player = state.players.find((p) => p.id === cmd.playerId);
  if (!player) return { ok: false, error: 'unknown player' };

  switch (cmd.type) {
    case 'evolve': {
      if (player.faction !== 'disease') return { ok: false, error: 'not a disease' };
      const node = getNode(cmd.nodeId);
      if (!node) return { ok: false, error: 'unknown node' };
      if (player.owned.includes(node.id)) return { ok: false, error: 'already owned' };
      if (!prereqsMet(node.id, player.owned)) return { ok: false, error: 'prereqs not met' };
      if (isExclusivityLocked(node, player.owned)) return { ok: false, error: 'conflicts with an evolution you already have' };
      if (player.dna < node.cost) return { ok: false, error: 'not enough DNA' };
      player.dna -= node.cost;
      player.owned.push(node.id);
      if (node.effects) applyEffects(player.stats, node.effects, +1);
      // Capstone "special" abilities are recorded as flags the sim reads.
      if (Array.isArray(node.special)) {
        if (!player.flags) player.flags = [];
        for (const f of node.special) if (!player.flags.includes(f)) player.flags.push(f);
      }
      return { ok: true };
    }
    case 'collect_bubble': {
      const idx = state.bubbles.findIndex((b) => b.id === cmd.bubbleId && b.playerId === cmd.playerId);
      if (idx === -1) return { ok: false, error: 'no such bubble' };
      const [b] = state.bubbles.splice(idx, 1);
      if (player.faction === 'disease') player.dna += b.value;
      else player.points += b.value;
      return { ok: true };
    }
    case 'cure_action': {
      if (player.faction !== 'cure') return { ok: false, error: 'not in cure faction' };
      return applyCureAction(state, player, cmd);
    }
    default:
      return { ok: false, error: `unknown command ${cmd.type}` };
  }
}

function applyCureAction(state, player, cmd) {
  const world = buildWorld();
  if (cmd.action === 'fund_research') {
    const cost = CURE.ACTION_COST.fund_research;
    if (player.points < cost) return { ok: false, error: 'not enough points' };
    // Targets the strongest remaining disease (or a named one).
    const target = cmd.targetPlayerId
      ? state.players.find((p) => p.id === cmd.targetPlayerId)
      : strongestDisease(state, world);
    if (!target || target.faction !== 'disease') return { ok: false, error: 'no target' };
    player.points -= cost;
    target.cureProgress = Math.min(100, target.cureProgress + CURE.FUND_RESEARCH_AMOUNT);
    return { ok: true };
  }
  if (cmd.action === 'lockdown') {
    const cost = CURE.ACTION_COST.lockdown;
    if (player.points < cost) return { ok: false, error: 'not enough points' };
    if (!world.cities[cmd.cityId]) return { ok: false, error: 'unknown city' };
    player.points -= cost;
    state.lockdowns[cmd.cityId] = CURE.LOCKDOWN_TICKS;
    return { ok: true };
  }
  if (cmd.action === 'vaccinate') {
    const cost = CURE.ACTION_COST.vaccinate;
    if (player.points < cost) return { ok: false, error: 'not enough points' };
    if (!world.cities[cmd.cityId]) return { ok: false, error: 'unknown city' };
    player.points -= cost;
    const S = susceptible(state, cmd.cityId);
    state.immune[cmd.cityId] += S * CURE.VACCINATE_FRACTION;
    return { ok: true };
  }
  return { ok: false, error: 'unknown cure action' };
}

function strongestDisease(state, world) {
  let best = null;
  let bestPresence = -1;
  for (const p of state.players) {
    if (p.faction !== 'disease') continue;
    let presence = 0;
    for (const id of world.order) presence += state.infections[id][p.id] || 0;
    if (presence > bestPresence) {
      bestPresence = presence;
      best = p;
    }
  }
  return best;
}

// True if buying `node` is blocked by a mutually-exclusive choice: either the
// node excludes something already owned, or an owned node excludes this one.
export function isExclusivityLocked(node, owned) {
  if (Array.isArray(node.exclusiveWith) && node.exclusiveWith.some((id) => owned.includes(id))) return true;
  for (const ownedId of owned) {
    const o = getNode(ownedId);
    if (o && Array.isArray(o.exclusiveWith) && o.exclusiveWith.includes(node.id)) return true;
  }
  return false;
}

// Apply dotted-key additive effects to a stats object. sign +1 buys, -1 refunds.
export function applyEffects(stats, effects, sign) {
  for (const key in effects) {
    const delta = effects[key] * sign;
    if (key.includes('.')) {
      const [a, b] = key.split('.');
      stats[a][b] = (stats[a][b] || 0) + delta;
    } else {
      stats[key] = (stats[key] || 0) + delta;
    }
  }
}

export { susceptible };
