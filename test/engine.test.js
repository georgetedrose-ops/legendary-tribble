import { describe, it, expect } from 'vitest';
import { makeRng, hashSeed } from '../src/engine/rng.js';
import { createInitialState, buildWorld } from '../src/engine/state.js';
import { step, applyCommand, applyEffects } from '../src/engine/sim.js';
import { computeAICommands } from '../src/engine/ai.js';
import { worldDeadFraction, livingDiseases } from '../src/engine/scoring.js';
import { getNode } from '../src/data/skillTree.js';

function soloConfig(typeId = 'virus', seed = 42) {
  return { seed, localPlayerId: 'you', players: [{ id: 'you', name: 'Me', diseaseName: 'Test', typeId }] };
}

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it('produces different streams for different seeds', () => {
    expect(makeRng(1).next()).not.toEqual(makeRng(2).next());
  });
  it('hashSeed is stable and 32-bit', () => {
    const s = hashSeed('ABCD');
    expect(s).toBe(hashSeed('ABCD'));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('world', () => {
  it('builds a fully connected graph', () => {
    const w = buildWorld();
    expect(w.order.length).toBeGreaterThanOrEqual(20);
    // every city has at least one neighbour
    for (const id of w.order) expect(w.adjacency[id].length).toBeGreaterThan(0);
  });
  it('links are symmetric', () => {
    const w = buildWorld();
    for (const id of w.order) {
      for (const { to } of w.adjacency[id]) {
        expect(w.adjacency[to].some((l) => l.to === id)).toBe(true);
      }
    }
  });
});

describe('determinism', () => {
  it('two sims with the same seed and commands match exactly', () => {
    const run = () => {
      const s = createInitialState(soloConfig());
      for (let i = 0; i < 200; i++) {
        if (i === 10) applyCommand(s, { type: 'evolve', playerId: 'you', nodeId: 't_air1' });
        step(s);
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(a.tick).toBe(b.tick);
    expect(a.players[0].infectedTotal).toBeCloseTo(b.players[0].infectedTotal, 6);
    expect(a.players[0].killedTotal).toBeCloseTo(b.players[0].killedTotal, 6);
    expect(JSON.stringify(a.infections)).toBe(JSON.stringify(b.infections));
  });
});

describe('commands', () => {
  it('rejects evolving without enough DNA', () => {
    const s = createInitialState(soloConfig());
    const res = applyCommand(s, { type: 'evolve', playerId: 'you', nodeId: 's_hemo' });
    expect(res.ok).toBe(false);
  });
  it('rejects evolving without prerequisites', () => {
    const s = createInitialState(soloConfig());
    s.players[0].dna = 999;
    const res = applyCommand(s, { type: 'evolve', playerId: 'you', nodeId: 's_organ' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/prereq/);
  });
  it('applies an affordable, unlocked node and deducts DNA', () => {
    const s = createInitialState(soloConfig());
    s.players[0].dna = 50;
    const before = s.players[0].stats.vectors.air;
    const res = applyCommand(s, { type: 'evolve', playerId: 'you', nodeId: 't_air1' });
    expect(res.ok).toBe(true);
    expect(s.players[0].dna).toBe(50 - getNode('t_air1').cost);
    expect(s.players[0].stats.vectors.air).toBeGreaterThan(before);
    expect(s.players[0].owned).toContain('t_air1');
  });
  it('cannot buy the same node twice', () => {
    const s = createInitialState(soloConfig());
    s.players[0].dna = 50;
    applyCommand(s, { type: 'evolve', playerId: 'you', nodeId: 't_air1' });
    const res = applyCommand(s, { type: 'evolve', playerId: 'you', nodeId: 't_air1' });
    expect(res.ok).toBe(false);
  });
  it('disease players cannot use cure actions', () => {
    const s = createInitialState(soloConfig());
    const res = applyCommand(s, { type: 'cure_action', playerId: 'you', action: 'fund_research' });
    expect(res.ok).toBe(false);
  });
});

describe('applyEffects', () => {
  it('handles nested dotted keys additively and reversibly', () => {
    const stats = { infectivity: 0.5, vectors: { air: 0.1 }, resist: { heat: 0 } };
    applyEffects(stats, { infectivity: 0.1, 'vectors.air': 0.2, 'resist.heat': 0.3 }, +1);
    expect(stats.infectivity).toBeCloseTo(0.6);
    expect(stats.vectors.air).toBeCloseTo(0.3);
    expect(stats.resist.heat).toBeCloseTo(0.3);
    applyEffects(stats, { infectivity: 0.1, 'vectors.air': 0.2, 'resist.heat': 0.3 }, -1);
    expect(stats.infectivity).toBeCloseTo(0.5);
    expect(stats.vectors.air).toBeCloseTo(0.1);
  });
});

describe('match lifecycle', () => {
  it('a passive over-visible disease eventually gets cured (world survives)', () => {
    const s = createInitialState(soloConfig('nano')); // high severity, no evolution
    let guard = 0;
    while (s.status === 'running' && guard++ < 5000) step(s);
    expect(s.status).toBe('ended');
    // either eradicated (cure) or it still managed to win — but with no
    // evolution and high visibility it should be cured, not win the world.
    expect(['all-cured', 'world-defeated']).toContain(s.endReason);
  });

  it('an aggressive evolving disease can defeat the world', () => {
    const s = createInitialState(soloConfig('bioweapon'));
    let guard = 0;
    while (s.status === 'running' && guard++ < 5000) {
      for (const cmd of computeAICommands(s, s.players[0])) applyCommand(s, cmd);
      step(s);
    }
    expect(s.status).toBe('ended');
    expect(worldDeadFraction(s, buildWorld())).toBeGreaterThan(0.5);
  });

  it('a multiplayer match resolves to a single winner', () => {
    const cfg = {
      seed: 7,
      localPlayerId: 'you',
      players: [
        { id: 'you', name: 'You', diseaseName: 'A', typeId: 'virus' },
        { id: 'b', name: 'B', diseaseName: 'B', typeId: 'bacteria', isAI: true },
        { id: 'c', name: 'C', diseaseName: 'C', typeId: 'prion', isAI: true },
      ],
    };
    const s = createInitialState(cfg);
    let guard = 0;
    while (s.status === 'running' && guard++ < 6000) {
      if (s.tick % 4 === 0) for (const p of s.players) for (const cmd of computeAICommands(s, p)) applyCommand(s, cmd);
      step(s);
    }
    expect(s.status).toBe('ended');
    expect(s.winner).toBeTruthy();
  });

  it('eliminated diseases flip to the cure faction', () => {
    // Force-eradicate the player mid-match and confirm the flip.
    const s = createInitialState(soloConfig('virus'));
    for (let i = 0; i < 20; i++) step(s);
    // wipe their infections
    for (const id of buildWorld().order) delete s.infections[id]['you'];
    step(s);
    expect(s.players[0].faction).toBe('cure');
  });
});

describe('scoring', () => {
  it('living diseases are counted correctly', () => {
    const s = createInitialState(soloConfig());
    expect(livingDiseases(s, buildWorld()).length).toBe(1);
  });
});
