import { WORLD } from '../engine/constants.js';
import topology from '../data/world-110m.json' with { type: 'json' };
import { feature } from 'topojson-client';

// Canvas world map. Renders real country landmasses beneath a Risk-style graph
// of capital cities (nodes sized by population), animated travel sprites along
// actively-spreading links, multi-disease infection rings/halos, DNA bubbles
// and lockdown markers. Handles hover (tooltip) and click (city selection, used
// by the cure faction to target cities). Pure view: it reads game state and
// never mutates it. All animation lives in renderer-only state so the sim stays
// deterministic.

// Pre-convert the TopoJSON world (coords are [lon, lat]) into GeoJSON features
// once at module load. ~110m resolution: compact (~100KB) and plenty for a
// stylised map. Stored as raw lon/lat polygons; projected & cached per resize.
const LAND_FEATURES = feature(topology, topology.objects.countries).features;

const MAX_PARTICLES = 40; // hard cap on cosmetic travel sprites
const SPREAD_THRESHOLD = 0.05; // source infection fraction needed to export
const PARTICLE_SPEED = 0.00016; // progress per ms along a link (≈6s crossing)

export class MapView {
  constructor(canvas, world, { onCityClick } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.onCityClick = onCityClick;
    this.state = null;
    this.hover = null;
    this.selected = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Renderer-only animation state (never touches game state / determinism).
    this._particles = [];
    this._lastSpawn = 0; // wall-clock of last spawn attempt
    this._landPaths = null; // cached Path2D land polygons (rebuilt on resize)
    this._borderPath = null; // cached Path2D country borders

    this._bind();
    this.resize();
  }

  _bind() {
    this._onMove = (e) => {
      const { x, y } = this._mouse(e);
      this.hover = this._cityAt(x, y);
      this.canvas.style.cursor = this.hover ? 'pointer' : 'default';
      this._tooltipPos = { x: e.clientX, y: e.clientY };
    };
    this._onClick = (e) => {
      const { x, y } = this._mouse(e);
      const c = this._cityAt(x, y);
      if (c) {
        this.selected = c.id;
        if (this.onCityClick) this.onCityClick(c.id);
      }
    };
    this._onLeave = () => {
      this.hover = null;
    };
    this.canvas.addEventListener('mousemove', this._onMove);
    this.canvas.addEventListener('click', this._onClick);
    this.canvas.addEventListener('mouseleave', this._onLeave);
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.max(1, Math.floor(this.w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.h * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._buildLandPaths(); // re-project the cached world geometry
    if (this.state) this.draw(this.state);
  }

  _mouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Equirectangular projection with a margin so coastal cities aren't clipped.
  project(lat, lon) {
    const mx = 0.04;
    const x = ((lon + 180) / 360) * (this.w * (1 - 2 * mx)) + this.w * mx;
    const y = ((90 - lat) / 180) * (this.h * (1 - 2 * mx)) + this.h * mx;
    return { x, y };
  }

  // Re-project every country polygon into screen-space Path2D objects. Done
  // once per resize (not per frame) so the land render stays cheap. Uses the
  // exact same `project()` as the cities, so land aligns with the nodes.
  _buildLandPaths() {
    if (!this.w || !this.h) return;
    const land = new Path2D();
    const borders = new Path2D();
    const addRing = (ring) => {
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const p = this.project(lat, lon);
        if (i === 0) {
          land.moveTo(p.x, p.y);
          borders.moveTo(p.x, p.y);
        } else {
          land.lineTo(p.x, p.y);
          borders.lineTo(p.x, p.y);
        }
      }
      land.closePath();
      borders.closePath();
    };
    for (const f of LAND_FEATURES) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') {
        for (const ring of g.coordinates) addRing(ring);
      } else if (g.type === 'MultiPolygon') {
        for (const poly of g.coordinates) for (const ring of poly) addRing(ring);
      }
    }
    this._landPaths = land;
    this._borderPath = borders;
  }

  _radius(city) {
    return 5 + Math.sqrt(city.pop) * 1.7;
  }

  _cityAt(x, y) {
    for (const id of this.world.order) {
      const c = this.world.cities[id];
      const p = this.project(c.lat, c.lon);
      const r = this._radius(c) + 4;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) return c;
    }
    return null;
  }

  // Per-disease shares in a city, sorted descending, plus the leader and totals.
  _cityInfection(id) {
    if (!this.state) return { leader: null, frac: 0, total: 0, shares: [] };
    const inf = this.state.infections[id];
    let leader = null;
    let lead = 0;
    let total = 0;
    const shares = [];
    for (const pid in inf) {
      const v = inf[pid];
      if (v <= 0) continue;
      total += v;
      shares.push({ pid, v });
      if (v > lead) {
        lead = v;
        leader = pid;
      }
    }
    shares.sort((a, b) => b.v - a.v);
    return { leader, frac: lead, total, shares };
  }

  _color(playerId) {
    if (!this.state) return '#888';
    const p = this.state.players.find((x) => x.id === playerId);
    return p ? p.color : '#888';
  }

  // ── Cosmetic travel particles ─────────────────────────────────────────────
  // Spawn small sprites along links where a disease is actively spreading from
  // an infected source into a neighbour, coloured by the source disease's
  // player.color. Renderer-only; capped; throttled by wall-clock cadence.
  _updateParticles(now) {
    const dt = this._lastT ? now - this._lastT : 16;
    this._lastT = now;

    // Advance + cull existing particles.
    for (const p of this._particles) p.t += PARTICLE_SPEED * dt;
    this._particles = this._particles.filter((p) => p.t < 1);

    // Throttle spawning: at most one new particle per ~140ms, and never above
    // the cap. This keeps the map alive without clutter or overdraw.
    if (now - this._lastSpawn < 140 || this._particles.length >= MAX_PARTICLES) return;
    this._lastSpawn = now;
    if (!this.state) return;

    // Collect candidate (source, dest, kind, color) tuples from the graph.
    const candidates = [];
    for (const id of this.world.order) {
      if ((this.state.lockdowns[id] || 0) > 0) continue; // source locked
      const inf = this.state.infections[id];
      for (const link of this.world.adjacency[id]) {
        if ((this.state.lockdowns[link.to] || 0) > 0) continue; // dest locked
        for (const pid in inf) {
          if (inf[pid] >= SPREAD_THRESHOLD) {
            candidates.push({ from: id, to: link.to, kind: link.kind, pid });
          }
        }
      }
    }
    if (!candidates.length) return;

    // Bias spawn rate by candidate count so busy maps feel busier, but cap it.
    const spawns = Math.min(2, Math.ceil(candidates.length / 12));
    for (let i = 0; i < spawns && this._particles.length < MAX_PARTICLES; i++) {
      const c = candidates[(Math.random() * candidates.length) | 0];
      this._particles.push({
        from: c.from,
        to: c.to,
        kind: c.kind,
        color: this._color(c.pid),
        t: 0,
      });
    }
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const part of this._particles) {
      const a = this.world.cities[part.from];
      const b = this.world.cities[part.to];
      if (!a || !b) continue;
      const pa = this.project(a.lat, a.lon);
      const pb = this.project(b.lat, b.lon);
      // Ease the position slightly for a more organic feel.
      const t = part.t;
      const x = pa.x + (pb.x - pa.x) * t;
      const y = pa.y + (pb.y - pa.y) * t;
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      // Fade in/out at the ends so sprites don't pop on/off at nodes.
      const fade = Math.min(1, Math.min(t, 1 - t) * 6);

      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = fade;
      // Soft glow trail.
      ctx.shadowColor = part.color;
      ctx.shadowBlur = 6;
      if (part.kind === 'air') {
        ctx.rotate(ang);
        this._glyphPlane(ctx, part.color);
      } else if (part.kind === 'sea') {
        ctx.rotate(ang);
        this._glyphShip(ctx, part.color);
      } else {
        this._glyphDot(ctx, part.color);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _glyphPlane(ctx, color) {
    // Tiny arrow-like plane pointing along travel direction.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, 3);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-3, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  _glyphShip(ctx, color) {
    // Small boat hull (a rounded triangle/wedge).
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-3, 2.5);
    ctx.lineTo(-3, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-1.5, -3.5, 1, 3); // little mast
  }

  _glyphDot(ctx, color) {
    // Land: a glowing dot (a vehicle on the road).
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  draw(state) {
    this.state = state;
    const ctx = this.ctx;
    const now = performance.now();
    ctx.clearRect(0, 0, this.w, this.h);

    // Ocean background gradient.
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0b1426');
    g.addColorStop(1, '#0a1b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // Real country landmasses (slightly lighter than ocean), then faint
    // borders. Drawn from the cached projected paths so it's cheap per frame.
    if (this._landPaths) {
      ctx.fillStyle = '#1b2c45'; // dark slate land, sits above the ocean
      ctx.fill(this._landPaths);
      ctx.strokeStyle = 'rgba(140,180,225,0.32)'; // crisper coastlines/borders
      ctx.lineWidth = 0.7;
      ctx.stroke(this._borderPath);
    }

    // Subtle lat/long grid over the land for a "world map" feel.
    ctx.strokeStyle = 'rgba(120,160,200,0.05)';
    ctx.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) {
      const a = this.project(0, lon);
      ctx.beginPath();
      ctx.moveTo(a.x, 0);
      ctx.lineTo(a.x, this.h);
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const a = this.project(lat, 0);
      ctx.beginPath();
      ctx.moveTo(0, a.y);
      ctx.lineTo(this.w, a.y);
      ctx.stroke();
    }

    // Links.
    const drawn = new Set();
    for (const id of this.world.order) {
      const a = this.project(this.world.cities[id].lat, this.world.cities[id].lon);
      for (const link of this.world.adjacency[id]) {
        const key = id < link.to ? id + link.to : link.to + id;
        if (drawn.has(key)) continue;
        drawn.add(key);
        const b = this.project(this.world.cities[link.to].lat, this.world.cities[link.to].lon);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle =
          link.kind === 'air' ? 'rgba(120,180,255,0.16)' : link.kind === 'sea' ? 'rgba(90,200,210,0.13)' : 'rgba(150,170,190,0.12)';
        ctx.lineWidth = link.kind === 'air' ? 1 : 1.4;
        if (link.kind === 'air') ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Cosmetic travel sprites (between links, beneath the city nodes).
    this._updateParticles(now);
    this._drawParticles();

    // Cities.
    for (const id of this.world.order) {
      const c = this.world.cities[id];
      const p = this.project(c.lat, c.lon);
      const r = this._radius(c);
      const { leader, total, shares } = this._cityInfection(id);
      const dead = state.dead[id] || 0;
      const locked = (state.lockdowns[id] || 0) > 0;

      // Infection halo — soft glow in the dominant disease colour, sized by the
      // total infected fraction. A gentle pulse keeps active cities lively.
      if (total > 0.001) {
        const col = this._color(leader);
        const pulse = 1 + 0.06 * Math.sin(now / 380 + p.x);
        const haloR = (r + 5 + total * 14) * pulse;
        const grad = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, haloR);
        grad.addColorStop(0, hexA(col, 0.32 + total * 0.28));
        grad.addColorStop(1, hexA(col, 0));
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Base node. Greys (toward black) as the city dies off; if dominated by a
      // disease, tinted by its colour but still darkened by the dead fraction.
      const life = 1 - dead;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (leader && total > 0.02) {
        ctx.fillStyle = darken(this._color(leader), 0.35 + 0.65 * life);
      } else {
        ctx.fillStyle = `rgba(${110 * life + 40},${130 * life + 40},${150 * life + 40},0.9)`;
      }
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.selected === id ? '#ffe66d' : 'rgba(255,255,255,0.35)';
      ctx.stroke();

      // Multi-disease ring: each player's segment around the node, arc-length
      // proportional to their share of this city's infection. Reads at a glance
      // when several diseases contest a city.
      if (shares.length && total > 0.02) {
        const ringR = r + 3.5;
        ctx.lineWidth = 3;
        let start = -Math.PI / 2; // start at top
        const gap = shares.length > 1 ? 0.12 : 0; // small gaps between segments
        const span = Math.PI * 2 - gap * shares.length;
        for (const s of shares) {
          const frac = s.v / total;
          const end = start + span * frac;
          ctx.beginPath();
          ctx.arc(p.x, p.y, ringR, start, end);
          ctx.strokeStyle = this._color(s.pid);
          ctx.stroke();
          start = end + gap;
        }
      }

      // Lockdown ring.
      if (locked) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffcc44';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label for larger cities or on hover.
      if (r > 9 || (this.hover && this.hover.id === id)) {
        ctx.fillStyle = 'rgba(230,238,248,0.85)';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.name, p.x, p.y - r - 7);
      }
    }

    // DNA bubbles (collectible) — only the local player's are clickable, but
    // all are drawn faintly. The game screen wires bubble clicks separately.
    for (const b of state.bubbles) {
      const c = this.world.cities[b.cityId];
      if (!c) continue;
      const p = this.project(c.lat, c.lon);
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200 + b.id);
      ctx.beginPath();
      ctx.arc(p.x + 10, p.y - 10, 6, 0, Math.PI * 2);
      ctx.fillStyle = hexA(this._color(b.playerId), pulse);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Tooltip.
    if (this.hover && this._tooltipPos) {
      this._drawTooltip(this.hover);
    }
  }

  _drawTooltip(city) {
    const ctx = this.ctx;
    const { leader, total } = this._cityInfection(city.id);
    const dead = ((this.state.dead[city.id] || 0) * 100).toFixed(0);
    const lines = [
      `${city.name}, ${city.country}`,
      `Pop ${city.pop}M · ${city.climate} · ${city.wealth}`,
      `Infected ${(total * 100).toFixed(0)}% · Dead ${dead}%`,
    ];
    if (leader && total > 0.02) {
      const lp = this.state.players.find((x) => x.id === leader);
      if (lp) lines.push(`Dominant: ${lp.diseaseName}`);
    }
    if ((this.state.lockdowns[city.id] || 0) > 0) lines.push('🔒 Locked down');
    const p = this.project(city.lat, city.lon);
    const w = 168;
    const h = 16 * lines.length + 10;
    let tx = p.x + 14;
    let ty = p.y - h - 8;
    if (tx + w > this.w) tx = p.x - w - 14;
    if (ty < 0) ty = p.y + 14;
    ctx.fillStyle = 'rgba(10,18,32,0.95)';
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, tx, ty, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = '11px system-ui, sans-serif';
    lines.forEach((ln, i) => {
      ctx.fillStyle = i === 0 ? '#fff' : 'rgba(200,212,228,0.85)';
      ctx.font = i === 0 ? 'bold 12px system-ui, sans-serif' : '11px system-ui, sans-serif';
      ctx.fillText(ln, tx + 8, ty + 16 + i * 15);
    });
  }
}

function hexA(hex, a) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

// Multiply a hex colour toward black by factor f (1 = unchanged, 0 = black).
function darken(hex, f) {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * f);
  const g = Math.round(parseInt(c.substring(2, 4), 16) * f);
  const b = Math.round(parseInt(c.substring(4, 6), 16) * f);
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { WORLD };
