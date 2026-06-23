import { createInitialState, buildWorld, getPlayer } from '../engine/state.js';
import { step, applyCommand } from '../engine/sim.js';
import { computeAICommands } from '../engine/ai.js';
import { TICK } from '../engine/constants.js';

// Drives a match: owns the game state, runs the tick clock at a chosen speed,
// schedules AI decisions, applies commands, and emits change events the UI
// subscribes to. Transport-agnostic — commands flow in through submit() and out
// to listeners. For local play the runner is fully authoritative.
export class GameRunner {
  constructor({ config, transport, aiEvery = 4 }) {
    this.config = config;
    this.transport = transport;
    this.aiEvery = aiEvery;
    this.state = createInitialState(config);
    this.world = buildWorld();
    this.speedIndex = 1; // index into TICK.SPEEDS; starts at 1x
    this._timer = null;
    this._listeners = [];
    this._eventListeners = [];

    // Online roles: a "client" renders host snapshots and never steps the sim;
    // a "host" (and all local games) is authoritative.
    this.online = !!config.online;
    this.role = transport && transport.role ? transport.role : 'host';
    this.authoritative = !this.online || this.role === 'host';

    if (transport) {
      transport.onCommand((cmd) => this._apply(cmd));
      if (!this.authoritative && transport.onSnapshot) {
        transport.onSnapshot((snap) => this._ingestSnapshot(snap));
      }
    }
  }

  // A non-authoritative client replaces its state wholesale with the host's.
  _ingestSnapshot(snap) {
    if (!snap) return;
    this.state = snap;
    if (snap.status === 'ended') this.stop();
    this._emit();
  }

  // ── subscriptions ──
  onChange(cb) {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== cb);
    };
  }
  onEvent(cb) {
    this._eventListeners.push(cb);
  }
  _emit() {
    for (const cb of this._listeners) cb(this.state);
  }
  _event(msg, kind = 'info') {
    for (const cb of this._eventListeners) cb({ msg, kind, tick: this.state.tick });
  }

  // ── commands ──
  // Submit a command from the local player (or AI). Routed through the
  // transport so online matches stay consistent; locally it round-trips
  // immediately via LocalTransport.
  submit(cmd) {
    if (this.transport) this.transport.send(cmd);
    else this._apply(cmd);
  }
  _apply(cmd) {
    const before = this.state.players.map((p) => p.faction);
    const res = applyCommand(this.state, cmd);
    if (res && res.ok) this._afterApply(cmd, before);
    return res;
  }
  _afterApply(cmd, beforeFactions) {
    // Surface a couple of human-friendly events.
    if (cmd.type === 'evolve') {
      const p = getPlayer(this.state, cmd.playerId);
      if (p && this.isLocalPlayer(p.id)) this._event(`Evolved: ${nodeName(cmd.nodeId)}`, 'good');
    }
    void beforeFactions;
    this._emit();
  }

  // ── clock ──
  start() {
    if (this.transport) this.transport.start();
    // Clients are driven entirely by incoming snapshots — no local clock.
    if (this.authoritative) this._schedule();
    this._emit();
  }
  setSpeed(index) {
    this.speedIndex = Math.max(0, Math.min(TICK.SPEEDS.length - 1, index));
    this._schedule();
    this._emit();
  }
  togglePause() {
    this.setSpeed(this.speedIndex === 0 ? 1 : 0);
  }
  isPaused() {
    return TICK.SPEEDS[this.speedIndex] === 0;
  }
  _schedule() {
    if (this._timer) clearInterval(this._timer);
    if (!this.authoritative) return; // clients never tick locally
    const mult = TICK.SPEEDS[this.speedIndex];
    if (mult === 0) return; // paused
    const interval = TICK.MS_PER_TICK / mult;
    this._timer = setInterval(() => this.tick(), interval);
  }

  // One simulation tick. AI acts on a cadence; then the world steps.
  tick() {
    if (this.state.status !== 'running') {
      this.stop();
      this._emit();
      return;
    }
    // AI / autonomous actors (offline matches only — online peers are humans
    // who submit their own commands through the transport).
    if (!this.online && this.state.tick % this.aiEvery === 0) {
      for (const p of this.state.players) {
        if (this._isAutonomous(p)) {
          for (const cmd of computeAICommands(this.state, p)) applyCommand(this.state, cmd);
        }
      }
    }
    const prevWinner = this.state.winner;
    step(this.state);
    // Host broadcasts a snapshot for clients to render.
    if (this.online && this.role === 'host' && this.transport && this.transport.pushSnapshot && this.state.tick % 2 === 0) {
      this.transport.pushSnapshot(this.state);
    }
    if (this.state.status === 'ended' && !prevWinner) {
      const w = getPlayer(this.state, this.state.winner);
      this._event(`Match over — ${w ? w.diseaseName : 'no one'} prevails!`, 'good');
      if (this.online && this.role === 'host' && this.transport && this.transport.pushSnapshot) this.transport.pushSnapshot(this.state);
      this.stop();
    }
    this._emit();
  }

  _isAutonomous(p) {
    // AI-flagged players are autonomous; so is any disease/cure player that is
    // not the local human (in a single-device match the human is config.localPlayerId).
    if (p.isAI) return true;
    return p.id !== this.config.localPlayerId;
  }
  isLocalPlayer(id) {
    return id === this.config.localPlayerId;
  }
  localPlayer() {
    return getPlayer(this.state, this.config.localPlayerId);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
  dispose() {
    this.stop();
    if (this.transport) this.transport.dispose();
    this._listeners = [];
    this._eventListeners = [];
  }
}

import { getNode } from '../data/skillTree.js';
function nodeName(id) {
  const n = getNode(id);
  return n ? n.name : id;
}
