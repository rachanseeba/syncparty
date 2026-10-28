// Act 1 grid effects, drawn in shared-canvas units and blended additively.
// Every effect is a pure function of show time, so all phones agree.
import { canvasSize } from './layout.js';

export const DIWALI = { gold: '#FFC300', saffron: '#FF8F00', red: '#C1121F', magenta: '#E0218A', warm: '#FFF3D6' };
export const DIWALI_LIST = [DIWALI.gold, DIWALI.saffron, DIWALI.red, DIWALI.magenta];

export const EFFECT_TYPES = {
  wash: 'Colour wash',
  chase: 'Row/column chase',
  sweep: 'Soft sweep',
  ripple: 'Ripple from centre',
  strobe: 'Strobe (big hits)',
  sparkle: 'Sparkle burst',
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const colorOf = (e, i = 0) => (e.colors && e.colors.length ? e.colors[i % e.colors.length] : e.color || DIWALI.gold);

const DRAW = {
  wash(ctx, e, u, g) {
    const { w, h } = canvasSize(g);
    const attack = Math.min(1, (u * e.dur) / 40);
    const env = e.hold ? attack : attack * Math.pow(1 - u, 1.6);
    ctx.globalAlpha = env * (e.level ?? 0.9);
    ctx.fillStyle = colorOf(e);
    ctx.fillRect(0, 0, w, h);
  },
  chase(ctx, e, u, g) {
    const n = e.axis === 'col' ? g.cols : g.rows;
    const passes = e.passes || 1;
    const pos = u * n * passes;
    const step = Math.floor(pos);
    for (let k = 0; k < 3; k++) {
      const s = step - k;
      if (s < 0) break;
      let idx = s % n;
      if ((e.dir || 1) < 0) idx = n - 1 - idx;
      if (e.bounce && Math.floor(s / n) % 2 === 1) idx = n - 1 - idx;
      ctx.globalAlpha = (e.level ?? 0.9) * [1, 0.35, 0.12][k];
      ctx.fillStyle = colorOf(e, s);
      if (e.axis === 'col') ctx.fillRect(idx, 0, 1, g.rows * g.aspect);
      else ctx.fillRect(0, idx * g.aspect, g.cols, g.aspect);
    }
  },
  sweep(ctx, e, u, g) {
    const { w, h } = canvasSize(g);
    const horiz = e.axis !== 'row';
    const span = horiz ? w : h;
    const band = (e.width || 2) * (horiz ? 1 : g.aspect);
    let c = -band + u * (span + 2 * band);
    if ((e.dir || 1) < 0) c = span - c;
    const grad = horiz ? ctx.createLinearGradient(c - band, 0, c + band, 0) : ctx.createLinearGradient(0, c - band, 0, c + band);
    const col = colorOf(e);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = e.level ?? 0.9;
    ctx.fillStyle = grad;
    if (horiz) ctx.fillRect(c - band, 0, band * 2, h);
    else ctx.fillRect(0, c - band, w, band * 2);
  },
  ripple(ctx, e, u, g) {
    const { w, h } = canvasSize(g);
    const cx = e.x ?? w / 2, cy = e.y ?? h / 2;
    const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 1;
    const r = u * maxR;
    const th = e.thickness || 1.3;
    ctx.globalAlpha = (e.level ?? 0.95) * (1 - u * 0.7);
    ctx.strokeStyle = colorOf(e);
    ctx.lineWidth = th;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.01, r), 0, Math.PI * 2);
    ctx.stroke();
    if (e.rings > 1 && r > th * 2.2) {
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = colorOf(e, 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r - th * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  strobe(ctx, e, u, g) {
    const { w, h } = canvasSize(g);
    const count = e.count || 4;
    if ((u * count) % 1 > 0.35) return;
    ctx.globalAlpha = e.level ?? 0.85;
    ctx.fillStyle = colorOf(e, Math.floor(u * count));
    ctx.fillRect(0, 0, w, h);
  },
  sparkle(ctx, e, u, g, t) {
    // glow is allowed on bursts (never on figure parts)
    const rate = e.rate || 14; // ticks per second
    const tick = Math.floor(((t - e.t) * rate) / 1000);
    const tu = (((t - e.t) * rate) / 1000) % 1;
    const n = e.count || Math.max(3, Math.round((g.rows * g.cols) / 6));
    for (let back = 0; back < 2; back++) {
      const rng = mulberry32((e.seed || 7) * 1000 + tick - back);
      const fade = back === 0 ? 1 - tu * 0.5 : 0.5 - tu * 0.5;
      for (let i = 0; i < n; i++) {
        const c = Math.floor(rng() * g.cols), r = Math.floor(rng() * g.rows);
        const x = c + 0.5, y = r * g.aspect + g.aspect / 2;
        const rad = 0.9 + rng() * 0.6;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const col = colorOf(e, i);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.25, col);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.max(0, fade) * (e.level ?? 1) * (1 - u * 0.3);
        ctx.fillStyle = grad;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  },
};

export function drawEffects(ctx, seg, t, g) {
  const list = seg.effects || [];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of list) {
    if (t < e.t || t >= e.t + e.dur) continue;
    const fn = DRAW[e.type];
    if (fn) fn(ctx, e, (t - e.t) / e.dur, g, t);
  }
  ctx.restore();
}
