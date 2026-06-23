import { SCORE } from './constants.js';

// Recompute every player's live score and useful derived metrics (current
// infected/dead totals, cities dominated). Called once per tick.
export function computeScores(state, world) {
  // Tally current infected population and dominated cities per disease.
  const dominated = {};
  for (const p of state.players) dominated[p.id] = 0;

  for (const id of world.order) {
    const inf = state.infections[id];
    let leader = null;
    let leadFrac = 0;
    for (const pid in inf) {
      if (inf[pid] > leadFrac) {
        leadFrac = inf[pid];
        leader = pid;
      }
    }
    // "Dominated" = a disease holds a meaningful majority presence in the city.
    if (leader && leadFrac > 0.25) dominated[leader] += 1;
  }

  for (const p of state.players) {
    p.dominatedCities = dominated[p.id];
    p.score = Math.round(
      p.infectedTotal * SCORE.PER_INFECTED_MILLION +
        p.killedTotal * SCORE.PER_KILLED_MILLION +
        dominated[p.id] * SCORE.PER_CITY_DOMINATED +
        (p.survivedBonus ? SCORE.SURVIVAL_BONUS : 0),
    );
  }
}

// Global fraction of world population that has died.
export function worldDeadFraction(state, world) {
  let dead = 0;
  let total = 0;
  for (const id of world.order) {
    const pop = world.cities[id].pop;
    total += pop;
    dead += state.dead[id] * pop;
  }
  return total > 0 ? dead / total : 0;
}

// Living diseases = those with any presence on the map.
export function livingDiseases(state, world) {
  const out = [];
  for (const p of state.players) {
    if (p.faction !== 'disease') continue;
    let presence = 0;
    for (const id of world.order) presence += state.infections[id][p.id] || 0;
    if (presence > 1e-7) out.push(p);
  }
  return out;
}

// Decide whether the match is over and, if so, who won. Mutates state.status,
// state.winner, and sets a survival bonus on the victor.
export function checkEndConditions(state, world) {
  if (state.status !== 'running') return;
  const totalDiseases = state.players.filter((p) => p.startCity).length;
  const living = livingDiseases(state, world);
  const deadFrac = worldDeadFraction(state, world);

  const finish = (winnerId, reason) => {
    state.status = 'ended';
    state.winner = winnerId;
    state.endReason = reason;
    const w = state.players.find((p) => p.id === winnerId);
    if (w) {
      w.survivedBonus = true;
      computeScores(state, world);
    }
  };

  // World wiped out — whoever did the most damage takes the crown.
  if (deadFrac >= 0.97) {
    finish(topScorer(state), 'world-defeated');
    return;
  }
  // Last disease standing in a multiplayer match.
  if (totalDiseases > 1 && living.length === 1) {
    finish(living[0].id, 'last-standing');
    return;
  }
  // Everyone got cured — the world held. Highest score still "wins" the board.
  if (living.length === 0 && state.tick > 1) {
    finish(topScorer(state), 'all-cured');
    return;
  }
  // Solo practice: you win by defeating (almost) the whole world.
  if (totalDiseases === 1 && living.length === 1 && deadFrac >= 0.9) {
    finish(living[0].id, 'world-defeated');
  }
}

function topScorer(state) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of state.players) {
    if (p.score > bestScore) {
      bestScore = p.score;
      best = p.id;
    }
  }
  return best;
}
