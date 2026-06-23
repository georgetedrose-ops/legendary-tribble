import { WORLD } from '../engine/constants.js';

// Canvas world map. Renders capitals as nodes (size ~ population), tinted by the
// disease that dominates them, with links, infection rings, DNA bubbles and
// lockdown markers. Handles hover (tooltip) and click (city selection, used by
// the cure faction to target cities). Pure view: it reads state, never mutates.

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

  // Which disease dominates a city, and the total infected fraction there.
  _cityInfection(id) {
    if (!this.state) return { leader: null, frac: 0, total: 0 };
    const inf = this.state.infections[id];
    let leader = null;
    let lead = 0;
    let total = 0;
    for (const pid in inf) {
      total += inf[pid];
      if (inf[pid] > lead) {
        lead = inf[pid];
        leader = pid;
      }
    }
    return { leader, frac: lead, total };
  }

  _color(playerId) {
    if (!this.state) return '#888';
    const p = this.state.players.find((x) => x.id === playerId);
    return p ? p.color : '#888';
  }

  draw(state) {
    this.state = state;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Ocean background gradient + subtle lat/long grid for a "world map" feel.
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0b1426');
    g.addColorStop(1, '#0a1b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.strokeStyle = 'rgba(120,160,200,0.06)';
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

    // Cities.
    for (const id of this.world.order) {
      const c = this.world.cities[id];
      const p = this.project(c.lat, c.lon);
      const r = this._radius(c);
      const { leader, total } = this._cityInfection(id);
      const dead = state.dead[id] || 0;
      const locked = (state.lockdowns[id] || 0) > 0;

      // Infection halo.
      if (total > 0.001) {
        const col = this._color(leader);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4 + total * 10, 0, Math.PI * 2);
        ctx.fillStyle = hexA(col, 0.18 + total * 0.25);
        ctx.fill();
      }

      // Base node (greys toward black as the city dies off).
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      const life = 1 - dead;
      ctx.fillStyle = leader && total > 0.02 ? this._color(leader) : `rgba(${110 * life + 40},${130 * life + 40},${150 * life + 40},0.9)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.selected === id ? '#ffe66d' : 'rgba(255,255,255,0.35)';
      ctx.stroke();

      // Lockdown ring.
      if (locked) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
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
        ctx.fillText(c.name, p.x, p.y - r - 5);
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
