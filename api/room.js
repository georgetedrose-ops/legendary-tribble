// Serverless relay "mailbox" for online matches (Vercel function).
//
// Deliberately dumb: it stores room rosters, a queue of player commands, and
// the host's latest state snapshot. The host browser runs the real simulation
// (see src/net/online.js), so this endpoint never needs game logic.
//
// Storage is an in-memory Map. That is perfect for `vercel dev` and small
// single-instance deployments. For multi-instance production scale, swap the
// `store` object for Vercel KV / Upstash Redis (same get/set shape) — the
// handler logic does not change.

const store = globalThis.__contagionRooms || (globalThis.__contagionRooms = new Map());
const ROOM_TTL_MS = 1000 * 60 * 60; // reap idle rooms after an hour

function reap() {
  const now = Date.now();
  for (const [code, room] of store) if (now - room.touched > ROOM_TTL_MS) store.delete(code);
}

function getRoom(code) {
  const room = store.get(code);
  if (room) room.touched = Date.now();
  return room;
}

function makePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 9);
}

const COLORS = ['#e0566b', '#3fcad4', '#7cce6f', '#d8a23a', '#9b8cf0', '#ff9f6b'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  reap();
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const { action, code } = body;

  try {
    switch (action) {
      case 'create': {
        if (store.has(code)) return send(res, 409, { error: 'room exists' });
        const playerId = makePlayerId();
        const room = {
          code,
          hostId: playerId,
          started: false,
          seed: (Math.random() * 2 ** 32) >>> 0,
          players: [{ id: playerId, name: clip(body.username), color: COLORS[0], host: true }],
          commands: [],
          cmdIdx: 0,
          snapshot: null,
          touched: Date.now(),
        };
        store.set(code, room);
        return send(res, 200, { playerId });
      }
      case 'join': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        if (room.started) return send(res, 403, { error: 'match already started' });
        if (room.players.length >= 6) return send(res, 403, { error: 'room full' });
        const playerId = makePlayerId();
        room.players.push({ id: playerId, name: clip(body.username), color: COLORS[room.players.length % COLORS.length], host: false });
        return send(res, 200, { playerId });
      }
      case 'lobby': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        return send(res, 200, { code, started: room.started, seed: room.seed, players: room.players });
      }
      case 'start': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        if (body.playerId !== room.hostId) return send(res, 403, { error: 'only host can start' });
        room.started = true;
        return send(res, 200, { ok: true });
      }
      case 'command': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        room.cmdIdx += 1;
        room.commands.push({ idx: room.cmdIdx, cmd: body.cmd });
        // Keep the queue bounded; the host acks via `since`.
        if (room.commands.length > 500) room.commands.splice(0, room.commands.length - 500);
        return send(res, 200, { ok: true, idx: room.cmdIdx });
      }
      case 'poll-commands': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        const since = body.since || 0;
        return send(res, 200, { commands: room.commands.filter((c) => c.idx > since) });
      }
      case 'snapshot': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        if (body.playerId !== room.hostId) return send(res, 403, { error: 'only host can snapshot' });
        room.snapshot = body.snapshot;
        return send(res, 200, { ok: true });
      }
      case 'poll-snapshot': {
        const room = getRoom(code);
        if (!room) return send(res, 404, { error: 'no such room' });
        return send(res, 200, { snapshot: room.snapshot });
      }
      default:
        return send(res, 400, { error: 'unknown action' });
    }
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
}

function clip(s) {
  return String(s || 'Player').slice(0, 16);
}
function send(res, status, obj) {
  res.status(status).json(obj);
}
