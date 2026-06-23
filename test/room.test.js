import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../api/room.js';

// Minimal req/res doubles for exercising the serverless relay handler.
function call(body) {
  return new Promise((resolve) => {
    const req = { method: 'POST', body };
    const res = {
      _status: 200,
      status(s) { this._status = s; return this; },
      json(obj) { resolve({ status: this._status, body: obj }); },
    };
    handler(req, res);
  });
}

describe('api/room relay', () => {
  beforeEach(() => {
    // Fresh room store between tests.
    globalThis.__contagionRooms = new Map();
  });

  it('rejects non-POST', async () => {
    const res = await new Promise((resolve) => {
      const r = { _s: 200, status(s) { this._s = s; return this; }, json(o) { resolve({ status: this._s, body: o }); } };
      handler({ method: 'GET' }, r);
    });
    expect(res.status).toBe(405);
  });

  it('creates a room and assigns a host player id', async () => {
    const r = await call({ action: 'create', code: 'AAAA', username: 'Host' });
    expect(r.status).toBe(200);
    expect(r.body.playerId).toBeTruthy();
  });

  it('prevents duplicate room codes', async () => {
    await call({ action: 'create', code: 'AAAA', username: 'Host' });
    const dup = await call({ action: 'create', code: 'AAAA', username: 'Other' });
    expect(dup.status).toBe(409);
  });

  it('lets a second player join and appear in the lobby', async () => {
    await call({ action: 'create', code: 'BBBB', username: 'Host' });
    const join = await call({ action: 'join', code: 'BBBB', username: 'Guest' });
    expect(join.status).toBe(200);
    const lobby = await call({ action: 'lobby', code: 'BBBB' });
    expect(lobby.body.players.length).toBe(2);
    expect(lobby.body.players[1].name).toBe('Guest');
  });

  it('only the host can start the match', async () => {
    const host = await call({ action: 'create', code: 'CCCC', username: 'Host' });
    const guest = await call({ action: 'join', code: 'CCCC', username: 'Guest' });
    const badStart = await call({ action: 'start', code: 'CCCC', playerId: guest.body.playerId });
    expect(badStart.status).toBe(403);
    const goodStart = await call({ action: 'start', code: 'CCCC', playerId: host.body.playerId });
    expect(goodStart.status).toBe(200);
    const lobby = await call({ action: 'lobby', code: 'CCCC' });
    expect(lobby.body.started).toBe(true);
  });

  it('queues commands and returns only newer ones via since', async () => {
    const host = await call({ action: 'create', code: 'DDDD', username: 'Host' });
    await call({ action: 'command', code: 'DDDD', playerId: host.body.playerId, cmd: { type: 'evolve', nodeId: 't_air1' } });
    await call({ action: 'command', code: 'DDDD', playerId: host.body.playerId, cmd: { type: 'evolve', nodeId: 't_water1' } });
    const all = await call({ action: 'poll-commands', code: 'DDDD', since: 0 });
    expect(all.body.commands.length).toBe(2);
    const newer = await call({ action: 'poll-commands', code: 'DDDD', since: 1 });
    expect(newer.body.commands.length).toBe(1);
    expect(newer.body.commands[0].cmd.nodeId).toBe('t_water1');
  });

  it('stores and serves the host snapshot; rejects non-host snapshots', async () => {
    const host = await call({ action: 'create', code: 'EEEE', username: 'Host' });
    const guest = await call({ action: 'join', code: 'EEEE', username: 'Guest' });
    const bad = await call({ action: 'snapshot', code: 'EEEE', playerId: guest.body.playerId, snapshot: { tick: 1 } });
    expect(bad.status).toBe(403);
    const ok = await call({ action: 'snapshot', code: 'EEEE', playerId: host.body.playerId, snapshot: { tick: 5 } });
    expect(ok.status).toBe(200);
    const got = await call({ action: 'poll-snapshot', code: 'EEEE' });
    expect(got.body.snapshot.tick).toBe(5);
  });

  it('404s for unknown rooms and 400s for unknown actions', async () => {
    expect((await call({ action: 'lobby', code: 'ZZZZ' })).status).toBe(404);
    expect((await call({ action: 'frobnicate', code: 'ZZZZ' })).status).toBe(400);
  });

  it('blocks joining a room that already started', async () => {
    const host = await call({ action: 'create', code: 'FFFF', username: 'Host' });
    await call({ action: 'start', code: 'FFFF', playerId: host.body.playerId });
    const late = await call({ action: 'join', code: 'FFFF', username: 'Latecomer' });
    expect(late.status).toBe(403);
  });
});
