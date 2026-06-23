// Online multiplayer transport (host-authoritative relay).
//
// Vercel runs serverless functions, not long-lived socket servers, so rather
// than fight that we use a simple relay model that is robust to it:
//
//   • One client is the HOST. It runs the authoritative simulation and, every
//     few ticks, POSTs a compact state snapshot to /api/room.
//   • Every client (host included) POSTs its own commands to /api/room.
//   • The HOST polls for queued commands and applies them to the sim.
//   • Non-host CLIENTS poll for the latest snapshot and just render it.
//
// This means the sim only ever runs in one place, so there is no determinism
// drift between machines. The serverless endpoint is a dumb mailbox.
//
// NOTE: this is the online "beta". Vs-AI play is fully self-contained and needs
// no server at all.

const API = '/api/room';
const POLL_MS = 700;

async function api(action, body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) {
    let detail = res.status;
    try { detail = (await res.json()).error || detail; } catch { /* ignore */ }
    throw new Error(String(detail));
  }
  return res.json();
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Module-scoped identity for the current online session.
let identity = null; // { code, playerId, host }

export async function createRoom(username) {
  const code = randomCode();
  const r = await api('create', { code, username });
  identity = { code, playerId: r.playerId, host: true };
  return code;
}

export async function joinRoom(code, username) {
  const r = await api('join', { code, username });
  identity = { code, playerId: r.playerId, host: false };
  return code;
}

export class OnlineTransport {
  constructor({ code, username, host }) {
    this.code = code;
    this.username = username;
    this.host = host || (identity && identity.host);
    this.playerId = identity ? identity.playerId : null;
    this.role = this.host ? 'host' : 'client';

    this._cmdHandlers = [];
    this._readyHandlers = [];
    this._lobbyHandlers = [];
    this._startHandlers = [];
    this._snapshotHandlers = [];
    this._errorHandlers = [];
    this._lobbyTimer = null;
    this._matchTimer = null;
    this._seenCmd = 0; // highest command index applied (host)
    this._matchStarted = false;
  }

  // ── lobby ──
  onLobby(cb) { this._lobbyHandlers.push(cb); }
  onStart(cb) { this._startHandlers.push(cb); }
  onError(cb) { this._errorHandlers.push(cb); }
  _err(e) { for (const cb of this._errorHandlers) cb(e); }

  connectLobby() {
    const poll = async () => {
      try {
        const room = await api('lobby', { code: this.code, playerId: this.playerId });
        for (const cb of this._lobbyHandlers) cb(room);
        if (room.started && !this._matchStarted) {
          this._matchStarted = true;
          this._beginMatch(room);
        }
      } catch (e) { this._err(e); }
    };
    poll();
    this._lobbyTimer = setInterval(poll, POLL_MS);
  }

  async startMatch() {
    try { await api('start', { code: this.code, playerId: this.playerId }); }
    catch (e) { this._err(e); }
  }

  _beginMatch(room) {
    if (this._lobbyTimer) clearInterval(this._lobbyTimer);
    // Build the engine config from the lobby roster. Human players first; the
    // host may pad with AI if desired (kept simple: humans only here).
    const players = room.players.map((p) => ({
      id: p.id, name: p.name, diseaseName: p.diseaseName || p.name + "'s plague",
      typeId: p.typeId || 'virus', isAI: false,
    }));
    const config = { seed: room.seed, players, localPlayerId: this.playerId, online: true };
    for (const cb of this._startHandlers) cb(config);
  }

  // ── match-time API used by GameRunner ──
  onCommand(cb) { this._cmdHandlers.push(cb); }
  onReady(cb) { this._readyHandlers.push(cb); }
  onSnapshot(cb) { this._snapshotHandlers.push(cb); }

  send(cmd) {
    api('command', { code: this.code, playerId: this.playerId, cmd }).catch((e) => this._err(e));
  }

  async pushSnapshot(snapshot) {
    if (!this.host) return;
    try { await api('snapshot', { code: this.code, playerId: this.playerId, snapshot }); }
    catch (e) { this._err(e); }
  }

  start() {
    for (const cb of this._readyHandlers) cb({ code: this.code });
    if (this.host) {
      // Host polls for incoming commands to apply to its authoritative sim.
      this._matchTimer = setInterval(async () => {
        try {
          const r = await api('poll-commands', { code: this.code, playerId: this.playerId, since: this._seenCmd });
          for (const entry of r.commands || []) { this._seenCmd = entry.idx; for (const cb of this._cmdHandlers) cb(entry.cmd); }
        } catch (e) { this._err(e); }
      }, POLL_MS);
    } else {
      // Client polls for the latest snapshot to render.
      this._matchTimer = setInterval(async () => {
        try {
          const r = await api('poll-snapshot', { code: this.code, playerId: this.playerId });
          if (r.snapshot) for (const cb of this._snapshotHandlers) cb(r.snapshot);
        } catch (e) { this._err(e); }
      }, POLL_MS);
    }
  }

  dispose() {
    if (this._lobbyTimer) clearInterval(this._lobbyTimer);
    if (this._matchTimer) clearInterval(this._matchTimer);
    this._cmdHandlers = []; this._readyHandlers = []; this._lobbyHandlers = [];
    this._startHandlers = []; this._snapshotHandlers = []; this._errorHandlers = [];
  }
}
