import './style.css';
import { GameRunner } from './game/runner.js';
import { LocalTransport } from './net/transport.js';
import { OnlineTransport, createRoom, joinRoom } from './net/online.js';
import { MapView } from './ui/map.js';
import { buildWorld } from './engine/state.js';
import { DISEASE_TYPES } from './data/diseaseTypes.js';
import { SKILL_NODES, getNode, prereqsMet } from './data/skillTree.js';
import { TICK, LIMITS, CURE } from './engine/constants.js';
import { worldDeadFraction } from './engine/scoring.js';

const app = document.getElementById('app');
const world = buildWorld();

// Tiny hyperscript helper.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function clear() { app.innerHTML = ''; }

const session = {
  username: localStorage.getItem('contagion_user') || '',
  runner: null,
};

// ── name flavour ──────────────────────────────────────────────────────────
const BOT_NAMES = ['Vex', 'Mara', 'Koll', 'Sina', 'Drev', 'Pax', 'Nyx', 'Orin'];
const DISEASE_WORDS_A = ['Crimson', 'Pale', 'Black', 'Silent', 'Burning', 'Hollow', 'Iron', 'Whisper'];
const DISEASE_WORDS_B = ['Fever', 'Rot', 'Flux', 'Pox', 'Bloom', 'Plague', 'Strain', 'Blight'];
const randItem = (a) => a[Math.floor(Math.random() * a.length)];
const randDiseaseName = () => `${randItem(DISEASE_WORDS_A)} ${randItem(DISEASE_WORDS_B)}`;

// ════════════════════════════════════════════════════════════════════════════
// MENU
// ════════════════════════════════════════════════════════════════════════════
function renderMenu() {
  if (session.runner) { session.runner.dispose(); session.runner = null; }
  clear();
  const userInput = h('input', { class: 'field', maxlength: LIMITS.USERNAME_MAX, placeholder: 'Your username', value: session.username });
  const botCount = h('select', { class: 'field' },
    ...[1, 2, 3, 4, 5].map((n) => h('option', { value: n, ...(n === 3 ? { selected: 'selected' } : {}) }, `${n} AI rival${n > 1 ? 's' : ''}`)));
  const roomInput = h('input', { class: 'field', maxlength: 6, placeholder: 'ROOM CODE', style: 'text-transform:uppercase' });
  const msg = h('div', { class: 'small', style: 'min-height:18px;color:var(--accent)' });

  const requireName = () => {
    const name = userInput.value.trim();
    if (!name) { msg.textContent = 'Enter a username first.'; userInput.focus(); return null; }
    session.username = name; localStorage.setItem('contagion_user', name); return name;
  };

  const card = h('div', { class: 'card stack' },
    h('div', { class: 'brand' }, h('div', { class: 'dot' }), h('h1', {}, 'Contagion')),
    h('p', { class: 'sub' }, 'Engineer a disease. Evolve it. Race rival players to defeat humanity — and if your plague dies, switch sides and help the cure. Last plague standing wins.'),
    h('div', {}, h('label', { class: 'lbl' }, 'Username'), userInput),
    h('div', { class: 'divider' }),
    h('div', {}, h('label', { class: 'lbl' }, 'Practice / Local match'),
      h('div', { class: 'row' }, botCount,
        h('button', { class: 'btn primary', onclick: () => { const n = requireName(); if (n) renderSetup({ mode: 'local', bots: +botCount.value }); } }, 'Play vs AI'))),
    h('div', { class: 'divider' }),
    h('div', {}, h('label', { class: 'lbl' }, 'Online multiplayer'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: async () => { const n = requireName(); if (!n) return; msg.textContent = 'Creating room…'; try { const code = await createRoom(n); renderLobby({ code, host: true }); } catch (e) { msg.textContent = onlineError(e); } } }, 'Create match'))),
    h('div', { class: 'row' }, roomInput,
      h('button', { class: 'btn', onclick: async () => { const n = requireName(); if (!n) return; const code = roomInput.value.trim().toUpperCase(); if (!code) { msg.textContent = 'Enter a room code.'; return; } msg.textContent = 'Joining…'; try { await joinRoom(code, n); renderLobby({ code, host: false }); } catch (e) { msg.textContent = onlineError(e); } } }, 'Join')),
    msg,
    h('p', { class: 'small', style: 'margin-top:6px' }, 'Tip: Online play needs the room server (deployed on Vercel). Vs AI works fully offline.'),
  );
  app.append(h('div', { class: 'screen' }, card));
  userInput.focus();
}

function onlineError(e) {
  return (e && e.message) ? `Online unavailable: ${e.message}. Vs AI still works.` : 'Online unavailable. Vs AI still works.';
}

// ════════════════════════════════════════════════════════════════════════════
// ONLINE LOBBY (waiting room) — see online.js for the polling protocol.
// ════════════════════════════════════════════════════════════════════════════
function renderLobby({ code, host }) {
  clear();
  let transport;
  const playersEl = h('ul', { class: 'lobby-list' });
  const status = h('div', { class: 'small' }, 'Waiting for players…');
  const startBtn = host ? h('button', { class: 'btn primary', disabled: 'disabled', onclick: () => transport.startMatch() }, 'Start match') : null;

  transport = new OnlineTransport({ code, username: session.username, host });
  transport.onLobby((lobby) => {
    playersEl.innerHTML = '';
    for (const p of lobby.players) {
      playersEl.append(h('li', {}, h('span', { class: 'swatch', style: `background:${p.color || '#888'}` }), h('span', {}, p.name + (p.host ? ' (host)' : '')), h('span', { class: 'spacer' })));
    }
    if (startBtn) startBtn.disabled = lobby.players.length < 1 ? 'disabled' : null;
    status.textContent = `${lobby.players.length} player(s) in room. Share the code to invite more.`;
  });
  transport.onStart((config) => {
    startGame(config, transport);
  });
  transport.onError((e) => { status.textContent = onlineError(e); });
  transport.connectLobby();

  app.append(h('div', { class: 'screen' }, h('div', { class: 'card stack' },
    h('div', { class: 'brand' }, h('div', { class: 'dot' }), h('h1', {}, 'Lobby')),
    h('p', { class: 'sub' }, 'Share this code with friends so they can join.'),
    h('div', { class: 'center' }, h('div', { class: 'code' }, code)),
    playersEl, status,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: () => { transport.dispose(); renderMenu(); } }, 'Leave'),
      startBtn || h('div')),
  )));
}

// ════════════════════════════════════════════════════════════════════════════
// DISEASE SETUP
// ════════════════════════════════════════════════════════════════════════════
function renderSetup({ mode, bots }) {
  clear();
  let selectedType = DISEASE_TYPES[1].id;
  const nameInput = h('input', { class: 'field', maxlength: LIMITS.DISEASE_NAME_MAX, placeholder: 'Name your disease', value: randDiseaseName() });

  const typeCards = DISEASE_TYPES.map((t) =>
    h('button', { class: 'type' + (t.id === selectedType ? ' sel' : ''), 'data-id': t.id, onclick: (e) => { selectedType = t.id; document.querySelectorAll('.type').forEach((n) => n.classList.toggle('sel', n.getAttribute('data-id') === t.id)); void e; } },
      h('div', { class: 'tname' }, h('span', { class: 'swatch', style: `background:${t.color}` }), t.name),
      h('div', { class: 'tblurb' }, t.blurb),
      h('div', { class: 'trait' }, `◆ ${t.trait.name}: ${t.trait.desc}`)));

  const begin = () => {
    const diseaseName = (nameInput.value.trim() || randDiseaseName()).slice(0, LIMITS.DISEASE_NAME_MAX);
    const players = [{ id: 'you', name: session.username, diseaseName, typeId: selectedType, isAI: false }];
    for (let i = 0; i < bots; i++) {
      players.push({ id: 'ai' + i, name: BOT_NAMES[i % BOT_NAMES.length], diseaseName: randDiseaseName(), typeId: randItem(DISEASE_TYPES).id, isAI: true });
    }
    const config = { seed: (Math.random() * 2 ** 32) >>> 0, players, localPlayerId: 'you' };
    startGame(config, new LocalTransport(config));
  };

  app.append(h('div', { class: 'screen' }, h('div', { class: 'card stack' },
    h('div', { class: 'brand' }, h('div', { class: 'dot' }), h('h1', {}, 'Create your disease')),
    h('p', { class: 'sub' }, `${mode === 'local' ? bots + ' AI rival(s)' : 'Online match'} · Pick a strain to start. You'll evolve it as you spread.`),
    h('div', {}, h('label', { class: 'lbl' }, 'Disease name'), nameInput),
    h('div', {}, h('label', { class: 'lbl' }, 'Starting strain'), h('div', { class: 'types' }, ...typeCards)),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: renderMenu }, '← Back'),
      h('button', { class: 'btn primary', onclick: begin }, 'Release into the wild →')),
  )));
}

// ════════════════════════════════════════════════════════════════════════════
// GAME SCREEN
// ════════════════════════════════════════════════════════════════════════════
function startGame(config, transport) {
  if (session.runner) session.runner.dispose();
  const runner = new GameRunner({ config, transport });
  session.runner = runner;
  renderGame(runner);
  runner.start();
}

function renderGame(runner) {
  clear();
  let activeTab = 'evolve';
  let cureTarget = null; // selected city id for cure actions

  // ── topbar ──
  const elDisease = h('span', {});
  const stDna = statBox('DNA');
  const stInfected = statBox('Infected');
  const stDead = statBox('Dead');
  const stTick = statBox('Day');
  const speedBtns = TICK.SPEEDS.map((s, i) =>
    h('button', { class: 'btn', onclick: () => runner.setSpeed(i) }, s === 0 ? '❚❚' : `${s}×`));
  const speedWrap = h('div', { class: 'speed' }, ...speedBtns);

  const topbar = h('div', { class: 'topbar' },
    h('span', { class: 'title' }, h('span', { class: 'dot', style: 'width:16px;height:16px' }), elDisease),
    stDna.el, stInfected.el, stDead.el, stTick.el,
    h('span', { class: 'spacer' }), speedWrap,
    h('button', { class: 'btn ghost', onclick: () => { runner.stop(); renderMenu(); } }, 'Quit'));

  // ── map ──
  const canvas = h('canvas', { id: 'map' });
  const cureBar = h('span', {});
  const cureBarWrap = h('div', { class: 'cure-bar' },
    h('div', { class: 'bar-label' }, 'Global cure research'),
    h('div', { class: 'bar cure' }, cureBar));
  const events = h('div', { class: 'events' });
  const mapwrap = h('div', { class: 'mapwrap' }, canvas, cureBarWrap, events);

  // ── sidebar ──
  const tabEvolve = h('div', { class: 'tab on', onclick: () => setTab('evolve') }, 'Evolve');
  const tabCure = h('div', { class: 'tab', onclick: () => setTab('cure') }, 'Cure');
  const tabs = h('div', { class: 'tabs' }, tabEvolve, tabCure);
  const panel = h('div', { class: 'panel' });
  const scoreboard = h('div', { class: 'scoreboard' });
  const sidebar = h('div', { class: 'sidebar' }, tabs, panel, scoreboard);

  const main = h('div', { class: 'main' }, mapwrap, sidebar);
  app.append(h('div', { class: 'game' }, topbar, main));

  // Map view; clicking a city sets the cure target (used on the Cure tab).
  const mapView = new MapView(canvas, world, {
    onCityClick: (id) => {
      // If a DNA bubble for the local player sits on this city, collect it.
      const me = runner.localPlayer();
      const bubble = runner.state.bubbles.find((b) => b.cityId === id && b.playerId === me.id);
      if (bubble) { runner.submit({ type: 'collect_bubble', playerId: me.id, bubbleId: bubble.id }); return; }
      cureTarget = id;
      if (activeTab === 'cure') renderPanel();
    },
  });

  function setTab(t) { activeTab = t; tabEvolve.classList.toggle('on', t === 'evolve'); tabCure.classList.toggle('on', t === 'cure'); renderPanel(); }

  // ── panel rendering (depends on faction + tab) ──
  function renderPanel() {
    const me = runner.localPlayer();
    panel.innerHTML = '';
    if (me.faction === 'cure' || activeTab === 'cure') {
      renderCurePanel(me);
    } else {
      renderEvolvePanel(me);
    }
  }

  function renderEvolvePanel(me) {
    if (me.faction === 'cure') return;
    const branches = ['transmission', 'symptoms', 'resilience'];
    const titles = { transmission: '🦠 Transmission', symptoms: '☠ Symptoms', resilience: '🛡 Resilience' };
    for (const br of branches) {
      const wrap = h('div', { class: 'branch' }, h('h3', {}, titles[br]));
      const nodes = SKILL_NODES.filter((n) => n.branch === br).sort((a, b) => a.tier - b.tier);
      for (const node of nodes) {
        const owned = me.owned.includes(node.id);
        const ready = prereqsMet(node.id, me.owned);
        const afford = me.dna >= node.cost;
        // 'cant' = unlocked but currently too expensive (dimmed, still shown).
        const cls = 'node' + (owned ? ' owned' : !ready ? ' locked' : !afford ? ' cant' : '');
        wrap.append(h('div', { class: cls, title: node.req.length ? 'Requires: ' + node.req.map((r) => getNode(r).name).join(', ') : '',
          // Recompute eligibility live at click time so accumulating DNA always
          // lets you buy, regardless of when the panel was last drawn.
          onclick: () => {
            const live = runner.localPlayer();
            if (live.faction !== 'disease') return;
            if (live.owned.includes(node.id)) return;
            if (!prereqsMet(node.id, live.owned)) return;
            if (live.dna < node.cost) return;
            runner.submit({ type: 'evolve', playerId: live.id, nodeId: node.id });
            renderPanel();
          } },
          h('div', { class: 'ninfo' }, h('div', { class: 'nname' }, node.name), h('div', { class: 'ndesc' }, node.desc)),
          h('div', { class: 'ncost' }, owned ? '✓' : `${node.cost}`)));
      }
      panel.append(wrap);
    }
  }

  function renderCurePanel(me) {
    if (me.faction !== 'cure') {
      panel.append(h('p', { class: 'hint' }, 'You command a plague. If it is ever fully eradicated you will join the global cure effort and spend research points to hunt down the remaining diseases. The world cure progress is shown above the map — keep your disease quiet to slow it.'));
      return;
    }
    panel.append(h('p', { class: 'hint' }, `Your plague was eradicated — you've joined humanity's defence. Spend research points to stop the remaining plagues. Click a city on the map to target lockdowns and vaccinations.`));
    const target = cureTarget ? world.cities[cureTarget] : null;
    panel.append(h('div', { class: 'small', style: 'margin:8px 0' }, target ? `Selected city: ${target.name}` : 'No city selected — click the map.'));
    const action = (name, desc, cost, enabled, fn) =>
      h('div', { class: 'cure-action' }, h('div', { class: 'cname' }, name), h('div', { class: 'cdesc' }, desc),
        h('button', { class: 'btn', disabled: enabled ? null : 'disabled', onclick: fn }, `${cost} pts`));
    panel.append(action('Fund research', 'Push the global cure against the strongest remaining plague.', CURE.ACTION_COST.fund_research, me.points >= CURE.ACTION_COST.fund_research,
      () => { runner.submit({ type: 'cure_action', playerId: me.id, action: 'fund_research' }); }));
    panel.append(action('Lockdown', 'Seal a city for a while — cuts its links so plagues can\'t spread through it.', CURE.ACTION_COST.lockdown, cureTarget && me.points >= CURE.ACTION_COST.lockdown,
      () => { runner.submit({ type: 'cure_action', playerId: me.id, action: 'lockdown', cityId: cureTarget }); }));
    panel.append(action('Vaccinate', 'Immunise a chunk of a city\'s remaining healthy population.', CURE.ACTION_COST.vaccinate, cureTarget && me.points >= CURE.ACTION_COST.vaccinate,
      () => { runner.submit({ type: 'cure_action', playerId: me.id, action: 'vaccinate', cityId: cureTarget }); }));
  }

  // ── HUD update on each state change ──
  let lastFaction = null;
  let lastPanelSig = null;
  // A signature that changes whenever the panel's interactive content should
  // visibly update (newly affordable nodes, owned set, cure points/target).
  const panelSig = (me) => {
    if (me.faction === 'cure') return `C|${Math.floor(me.points)}|${cureTarget || '-'}`;
    const buyable = SKILL_NODES.filter((n) => !me.owned.includes(n.id) && prereqsMet(n.id, me.owned) && me.dna >= n.cost).map((n) => n.id).join(',');
    return `D|${me.owned.length}|${buyable}`;
  };
  const unsub = runner.onChange((state) => {
    const me = runner.localPlayer();
    elDisease.textContent = me.diseaseName + (me.faction === 'cure' ? '  (cure)' : '');
    if (me.faction === 'cure') { stDna.set(Math.floor(me.points) + ' pts'); stDna.label('Research'); }
    else { stDna.set(Math.floor(me.dna)); stDna.label('DNA'); }
    stInfected.set(fmt(me.infectedTotal) + 'M');
    stDead.set((worldDeadFraction(state, world) * 100).toFixed(0) + '%');
    stTick.set(state.tick);

    // strongest disease's cure progress drives the global bar.
    const topCure = Math.max(0, ...state.players.filter((p) => p.faction === 'disease').map((p) => p.cureProgress));
    cureBar.style.width = topCure + '%';

    speedBtns.forEach((b, i) => b.classList.toggle('on', i === runner.speedIndex));
    renderScoreboard(state, me);
    mapView.draw(state);

    const sig = panelSig(me);
    if (me.faction !== lastFaction || sig !== lastPanelSig) {
      lastFaction = me.faction;
      lastPanelSig = sig;
      const scroll = panel.scrollTop;
      renderPanel();
      panel.scrollTop = scroll; // keep the player's place in the tree
    }
    if (state.status === 'ended') { setTimeout(() => renderGameOver(runner), 700); unsub(); }
  });

  runner.onEvent((ev) => {
    const t = h('div', { class: 'toast ' + (ev.kind === 'good' ? 'good' : ev.kind === 'bad' ? 'bad' : ev.kind === 'warn' ? 'warn' : '') }, ev.msg);
    events.append(t);
    setTimeout(() => t.remove(), 4200);
    while (events.children.length > 4) events.firstChild.remove();
  });

  function renderScoreboard(state, me) {
    scoreboard.innerHTML = '';
    scoreboard.append(h('div', { class: 'small', style: 'text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px' }, 'Players'));
    const ordered = [...state.players].sort((a, b) => b.score - a.score);
    for (const p of ordered) {
      const dead = p.faction === 'cure';
      scoreboard.append(h('div', { class: 'prow' + (p.id === me.id ? ' me' : '') + (dead ? ' dead' : '') },
        h('span', { class: 'swatch', style: `background:${p.color}` }),
        h('span', { class: 'pname' }, p.diseaseName, ' ', h('span', { class: 'small' }, '· ' + p.name)),
        dead ? h('span', { class: 'badge' }, 'cure') : null,
        h('span', { class: 'psc' }, fmt(p.score))));
    }
  }

  renderPanel();
  // Smooth redraw for bubble pulse even while paused.
  (function raf() { if (!session.runner || session.runner !== runner) return; mapView.draw(runner.state); requestAnimationFrame(raf); })();
}

function statBox(label) {
  const v = h('span', { class: 'v' }, '–');
  const k = h('span', { class: 'k' }, label);
  const el = h('div', { class: 'stat' }, k, v);
  return { el, set: (x) => (v.textContent = x), label: (x) => (k.textContent = x) };
}

// ════════════════════════════════════════════════════════════════════════════
// GAME OVER
// ════════════════════════════════════════════════════════════════════════════
function renderGameOver(runner) {
  const state = runner.state;
  clear();
  const me = runner.localPlayer();
  const winner = state.players.find((p) => p.id === state.winner);
  const youWon = winner && winner.id === me.id;
  const ordered = [...state.players].sort((a, b) => b.score - a.score);

  const reasonText = {
    'world-defeated': 'The world has fallen.',
    'last-standing': 'The last plague standing claims the world.',
    'all-cured': 'Humanity eradicated every plague.',
  }[state.endReason] || 'The match has ended.';

  app.append(h('div', { class: 'screen' }, h('div', { class: 'card' },
    h('div', { class: 'brand' }, h('div', { class: 'dot' }), h('h1', {}, 'Game Over')),
    h('p', { class: 'sub' }, reasonText),
    h('div', { class: 'winner', style: `color:${winner ? winner.color : '#fff'}` }, winner ? `${winner.diseaseName} wins` : 'No survivors'),
    h('p', { class: 'small' }, youWon ? 'That plague was yours. Masterfully done. 🏆' : (me.faction === 'cure' ? 'Your plague was eradicated — but you fought on for the cure.' : 'Your plague was outlasted. Try a different strategy.')),
    h('table', { class: 'results' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Plague'), h('th', { class: 'num' }, 'Infected'), h('th', { class: 'num' }, 'Killed'), h('th', { class: 'num' }, 'Score'))),
      h('tbody', {}, ...ordered.map((p, i) =>
        h('tr', {}, h('td', {}, i + 1 + (p.id === state.winner ? ' 🏆' : '')), h('td', {}, p.name), h('td', { style: `color:${p.color}` }, p.diseaseName),
          h('td', { class: 'num' }, fmt(p.infectedTotal) + 'M'), h('td', { class: 'num' }, fmt(p.killedTotal) + 'M'), h('td', { class: 'num' }, fmt(p.score)))))),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: renderMenu }, 'Play again'),
    ),
  )));
}

// ── format helper ──
function fmt(n) {
  n = Math.round(n);
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}

renderMenu();
