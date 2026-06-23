import { SKILL_NODES, prereqsMet } from '../data/skillTree.js';
import { buildWorld } from './state.js';

// Lightweight, deterministic AI. Each bot is given a "personality" derived from
// its id so different bots favour different evolution strategies, keeping
// matches varied. Returns a list of commands to enqueue this decision step.
//
// AI decisions are throttled (every few ticks) by the caller; this function
// just decides what to do *now* given current state.

const PERSONALITIES = {
  spreader: ['transmission', 'symptoms', 'resilience'],
  killer: ['symptoms', 'resilience', 'transmission'],
  survivor: ['resilience', 'transmission', 'symptoms'],
};

function personalityFor(player) {
  const keys = Object.keys(PERSONALITIES);
  let h = 0;
  for (const ch of player.id) h = (h + ch.charCodeAt(0)) % keys.length;
  return PERSONALITIES[keys[h]];
}

export function computeAICommands(state, player) {
  const cmds = [];
  const world = buildWorld();

  // Always grab any DNA/point bubbles that belong to this player.
  for (const b of state.bubbles) {
    if (b.playerId === player.id) cmds.push({ type: 'collect_bubble', playerId: player.id, bubbleId: b.id });
  }

  if (player.faction === 'disease') {
    // Buy the cheapest affordable, prereq-met node, biased by personality so
    // bots build coherent diseases rather than scattering points.
    const order = personalityFor(player);
    const affordable = SKILL_NODES.filter(
      (n) => !player.owned.includes(n.id) && prereqsMet(n.id, player.owned) && player.dna >= n.cost,
    );
    if (affordable.length) {
      affordable.sort((a, b) => {
        const pa = order.indexOf(a.branch);
        const pb = order.indexOf(b.branch);
        if (pa !== pb) return pa - pb;
        return a.cost - b.cost;
      });
      // Don't blow everything at once early; keep a small reserve.
      const pick = affordable[0];
      if (player.dna >= pick.cost) cmds.push({ type: 'evolve', playerId: player.id, nodeId: pick.id });
    }
  } else if (player.faction === 'cure') {
    // Cure faction: fund research against the strongest disease, and lock down
    // / vaccinate the worst-hit cities to choke the spread.
    if (player.points >= 4) {
      cmds.push({ type: 'cure_action', playerId: player.id, action: 'fund_research' });
    }
    if (player.points >= 5) {
      // Find the most infected city overall.
      let worst = null;
      let worstFrac = 0;
      for (const id of world.order) {
        let f = 0;
        const inf = state.infections[id];
        for (const pid in inf) f += inf[pid];
        if (f > worstFrac) {
          worstFrac = f;
          worst = id;
        }
      }
      if (worst && worstFrac > 0.2) {
        cmds.push({ type: 'cure_action', playerId: player.id, action: 'vaccinate', cityId: worst });
      }
    }
  }
  return cmds;
}
