// Transport abstraction. The game runner talks to a transport without caring
// whether the match is local (vs AI / pass-and-play) or online. A transport is
// responsible for delivering commands to every participant in a consistent
// order so that all clients' deterministic simulations stay in lockstep.
//
//   onCommand(cb)      – register a handler called with each delivered command
//   send(cmd)          – submit a local command for delivery
//   onReady(cb)        – called once the match may begin (with the agreed config)
//   start()            – begin networking
//   dispose()          – tear down

// LocalTransport: single client is authoritative. Commands are delivered back
// synchronously. Used for practice matches, AI games, and automated tests.
export class LocalTransport {
  constructor(config) {
    this.config = config;
    this._cmdHandlers = [];
    this._readyHandlers = [];
  }
  onCommand(cb) {
    this._cmdHandlers.push(cb);
  }
  onReady(cb) {
    this._readyHandlers.push(cb);
  }
  send(cmd) {
    // Deliver immediately and in submission order.
    for (const cb of this._cmdHandlers) cb(cmd);
  }
  start() {
    for (const cb of this._readyHandlers) cb(this.config);
  }
  dispose() {
    this._cmdHandlers = [];
    this._readyHandlers = [];
  }
}
