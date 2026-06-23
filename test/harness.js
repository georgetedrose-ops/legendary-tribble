// Headless balance harness. Runs full matches with no UI and prints a summary,
// so we can tune constants and confirm the sim terminates sensibly.
// Usage: node test/harness.js [scenario]
import { createInitialState, buildWorld } from '../src/engine/state.js';
import { step, applyCommand } from '../src/engine/sim.js';
import { computeAICommands } from '../src/engine/ai.js';
import { worldDeadFraction } from '../src/engine/scoring.js';

function runMatch({ players, maxTicks = 4000, aiEvery = 4, label }) {
  let state = createInitialState({ seed: 12345, players });
  const world = buildWorld();
  let t = 0;
  for (; t < maxTicks && state.status === 'running'; t++) {
    if (t % aiEvery === 0) {
      for (const p of state.players) {
        if (p.isAI || players.length === 1) {
          for (const cmd of computeAICommands(state, p)) applyCommand(state, cmd);
        }
      }
    }
    step(state);
  }
  const dead = (worldDeadFraction(state, world) * 100).toFixed(1);
  const winner = state.players.find((p) => p.id === state.winner);
  console.log(`\n=== ${label} ===`);
  console.log(`ended=${state.status === 'ended'} ticks=${state.tick} worldDead=${dead}% reason=${state.endReason || '-'}`);
  console.log(`winner=${winner ? winner.diseaseName + ' (' + winner.id + ')' : 'none'}`);
  for (const p of [...state.players].sort((a, b) => b.score - a.score)) {
    console.log(
      `  ${p.id.padEnd(8)} ${p.faction.padEnd(7)} score=${String(p.score).padStart(7)} ` +
        `inf=${p.infectedTotal.toFixed(0)}M kill=${p.killedTotal.toFixed(0)}M ` +
        `dna=${p.dna.toFixed(0)} cure=${p.cureProgress.toFixed(0)}% nodes=${p.owned.length}`,
    );
  }
  return state;
}

// Scenario 1: solo disease vs the world (practice mode).
runMatch({
  label: 'SOLO bioweapon (auto-evolve)',
  players: [{ id: 'p1', name: 'Solo', diseaseName: 'Solo Plague', typeId: 'bioweapon' }],
});

// Scenario 2: passive disease (no evolution) — should it get cured? tests cure.
runMatch({
  label: 'SOLO virus, NO evolution (cure should win)',
  players: [{ id: 'p1', name: 'Passive', diseaseName: 'Lazy Bug', typeId: 'virus' }],
  aiEvery: 999999, // never evolves, never collects
});

// Scenario 3: 4-player AI free-for-all.
runMatch({
  label: '4-PLAYER AI free-for-all',
  players: [
    { id: 'p1', name: 'A', diseaseName: 'Alpha', typeId: 'virus', isAI: true },
    { id: 'p2', name: 'B', diseaseName: 'Beta', typeId: 'bacteria', isAI: true },
    { id: 'p3', name: 'C', diseaseName: 'Gamma', typeId: 'parasite', isAI: true },
    { id: 'p4', name: 'D', diseaseName: 'Delta', typeId: 'prion', isAI: true },
  ],
});
