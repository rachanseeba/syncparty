// Frame renderer shared by grid phones, the host preview and the authoring
// preview. A frame is a pure function of (timeline, show time, view), drawn in
// one pass inside a single rAF callback, so a cut never shows half-drawn.
import { applyView, canvasSize, visibleRect, rectsOverlap, figureBoxes } from './layout.js';
import { drawFigure, DEFAULT_PALETTE, getPose, fitScale, partScaleFor } from './figure.js';
import { drawEffects, DIWALI } from './effects.js';
import { segmentAt, poseAt, hatAt, scaleAt, figureLayout, rippleDelay, revealAt } from './timeline.js';

const FLASH_MS = 45; // "one frame" of black on a cut, robust to 30-120Hz screens

/**
 * R = {
 *   c: compiled timeline, t: show ms (may be negative), view: {rect, pxW, pxH, flipV, mirrorH},
 *   opts: {style, intensity, flashOnCut, palette},
 *   finale: null | {beatT, beat, diyaT}   (ms since finale anchor / since diya; diyaT null = not yet)
 *   test: null | {kind:'readability', scale} | {kind:'sync', now}
 * }
 */
export function renderFrame(ctx, R) {
  const { view } = R;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, view.pxW, view.pxH);
  const c = R.c;
  if (!c) return;
  const g = c.grid;
  const opts = R.opts || {};
  applyView(ctx, view, g);
  const vis = visibleRect(view, g);

  if (R.test?.kind === 'readability') drawReadabilityTest(ctx, c, R.test.scale || { mode: 'grid' }, opts);
  else if (R.test?.kind === 'sync') drawSyncTest(ctx, g, R.test.now);
  else if (R.finale) drawFinale(ctx, g, R.finale);
  else if (R.t >= 0) {
    const seg = segmentAt(c, R.t);
    if (seg) {
      if (seg.type === 'pattern') drawEffects(ctx, seg, R.t, g);
      else if (seg.type === 'transition') drawReveal(ctx, c, seg, R.t, opts);
      else if (seg.type === 'figure') drawFigureSegment(ctx, c, seg, R.t, opts, vis);
      else if (seg.type === 'finale') drawFinale(ctx, g, { beatT: R.t - seg.start_ms, beat: 60000 / (seg.bpm || c.tl.bpm || 100), diyaT: diyaFromSeg(seg, R.t, c) });
    }
  }

  // intensity cap: scale everything toward black
  const cap = opts.intensity ?? 0.8;
  if (cap < 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1 - cap;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, view.pxW, view.pxH);
    ctx.globalAlpha = 1;
  }
}

function diyaFromSeg(seg, t, c) {
  if (seg.diya_after_beats == null) return null;
  const at = seg.start_ms + seg.diya_after_beats * (60000 / (seg.bpm || c.tl.bpm || 100));
  return t >= at ? t - at : null;
}

function drawFigureSegment(ctx, c, seg, t, opts, vis) {
  const { kf, scale } = scaleAt(seg, t);
  if (opts.flashOnCut && kf && kf._cut && t - kf.t < FLASH_MS) return; // black flash on a cut
  const L = figureLayout(c, scale);
  const mirrorVar = scale.variation === 'mirror';
  for (const box of L.boxes) {
    // a tossed hat can rise above its box, so pad the cull rect upward
    if (!rectsOverlap({ x: box.x, y: box.y - box.h * 0.2, w: box.w, h: box.h * 1.2 }, vis)) continue;
    const te = t - rippleDelay(scale, box, L, c.beat);
    drawFigure(ctx, poseAt(seg, te), {
      box, S: L.S, k: L.k, style: opts.style, palette: opts.palette || DEFAULT_PALETTE,
      mirror: mirrorVar && box.j % 2 === 1,
      hat: hatAt(seg, te, L.maxToss),
    });
  }
}

function drawReveal(ctx, c, seg, t, opts) {
  const L = figureLayout(c, { mode: 'grid' });
  const rv = revealAt(seg, t, c.beat);
  if (rv.hat <= 0) return; // the black hold
  drawFigure(ctx, getPose(seg.pose || 'idle_a'), {
    box: L.boxes[0], S: L.S, k: L.k, style: opts.style === 'stick' && rv.shoes >= 1 ? 'stick' : 'invisible',
    palette: opts.palette || DEFAULT_PALETTE, reveal: rv, hatFloat: rv.float,
  });
}

// Static hat/gloves/shoes at a given scale, to judge readability through the glass.
function drawReadabilityTest(ctx, c, scale, opts) {
  const L = figureLayout(c, scale);
  for (const box of L.boxes) {
    drawFigure(ctx, getPose('arms_v'), { box, S: L.S, k: L.k, style: 'invisible', palette: opts.palette || DEFAULT_PALETTE });
  }
}

// Sync test: a bar sweeping across the whole canvas once per second plus a
// full flash on each whole second. Film it in slow motion to see drift.
function drawSyncTest(ctx, g, now) {
  const { w, h } = canvasSize(g);
  const ms = ((now % 1000) + 1000) % 1000;
  if (ms < 80) {
    ctx.fillStyle = '#FFF3D6';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const x = (ms / 1000) * (w + 1) - 0.5;
  ctx.fillStyle = DIWALI.gold;
  ctx.fillRect(x - 0.15, 0, 0.3, h);
  const sec = Math.floor(now / 1000) % 10;
  ctx.save();
  ctx.scale(0.01, 0.01);
  ctx.fillStyle = DIWALI.saffron;
  ctx.font = `900 ${Math.round(g.aspect * 60)}px Outfit, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < g.rows; r++) for (let col = 0; col < g.cols; col++) ctx.fillText(String(sec), (col + 0.5) * 100, (r + 0.5) * g.aspect * 100);
  ctx.restore();
}

// Finale on the grid: warm pulse + ripple on every beat; then a diya and
// "HAPPY DIWALI" across the grid.
export function drawFinale(ctx, g, F) {
  const { w, h } = canvasSize(g);
  const phase = ((F.beatT / F.beat) % 1 + 1) % 1;
  const pulse = Math.exp(-phase * 4);
  const diya = F.diyaT != null ? Math.min(1, F.diyaT / 1500) : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, DIWALI.saffron);
  grad.addColorStop(0.6, DIWALI.red);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = (0.2 + 0.6 * pulse) * (1 - diya * 0.75);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = (1 - phase) * 0.9 * (1 - diya * 0.6);
  ctx.strokeStyle = DIWALI.gold;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.01 + phase * R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (diya > 0) drawDiya(ctx, g, F.diyaT, diya);
}

function drawDiya(ctx, g, t, a) {
  const { w, h } = canvasSize(g);
  const cx = w / 2, cy = h * 0.52;
  const s = Math.min(w * 0.42, h * 0.2);
  ctx.save();
  ctx.globalAlpha = a;
  // flame glow (an effect, so glow is allowed)
  const flick = 1 + 0.08 * Math.sin(t / 90) + 0.05 * Math.sin(t / 37 + 1.3);
  const fy = cy - s * 0.55;
  const glow = ctx.createRadialGradient(cx, fy, 0, cx, fy, s * 1.6 * flick);
  glow.addColorStop(0, 'rgba(255,200,80,0.55)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(cx - s * 2, fy - s * 2, s * 4, s * 4);
  ctx.globalCompositeOperation = 'source-over';
  // lamp bowl
  ctx.fillStyle = DIWALI.saffron;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.12);
  ctx.quadraticCurveTo(cx, cy + s * 0.9, cx + s, cy - s * 0.12);
  ctx.quadraticCurveTo(cx + s * 1.15, cy - s * 0.3, cx + s * 1.25, cy - s * 0.32);
  ctx.lineTo(cx + s * 0.8, cy - s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = DIWALI.red;
  ctx.fillRect(cx - s * 0.75, cy - s * 0.02, s * 1.5, s * 0.12);
  // flame
  const fh = s * 0.75 * flick, fw = s * 0.28;
  ctx.fillStyle = DIWALI.gold;
  ctx.beginPath();
  ctx.moveTo(cx, fy - fh * 0.75);
  ctx.quadraticCurveTo(cx + fw, fy + fh * 0.05, cx, fy + fh * 0.35);
  ctx.quadraticCurveTo(cx - fw, fy + fh * 0.05, cx, fy - fh * 0.75);
  ctx.fill();
  ctx.fillStyle = '#FFF6DE';
  ctx.beginPath();
  ctx.ellipse(cx, fy + fh * 0.12, fw * 0.32, fh * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // text: HAPPY above, DIWALI below, fitted to the canvas width
  ctx.fillStyle = DIWALI.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.scale(0.01, 0.01);
  for (const [txt, y] of [['HAPPY', h * 0.17], ['DIWALI', h * 0.86]]) {
    ctx.font = '900 100px Outfit, sans-serif';
    const mw = ctx.measureText(txt).width;
    const size = Math.min((w * 0.94 * 100 * 100) / mw, h * 0.16 * 100);
    ctx.font = `900 ${Math.round(size)}px Outfit, sans-serif`;
    ctx.fillText(txt, cx * 100, y * 100);
  }
  ctx.restore();
}

// Crowd phone colour for the finale: warm pulse on the beat, steady glow after the diya.
export function crowdFrame(F) {
  const phase = ((F.beatT / F.beat) % 1 + 1) % 1;
  if (F.diyaT != null) {
    const flick = 0.85 + 0.1 * Math.sin(F.diyaT / 110) + 0.05 * Math.sin(F.diyaT / 41);
    return { color: `rgb(${Math.round(255 * flick)},${Math.round(150 * flick)},${Math.round(40 * flick)})`, diya: true };
  }
  const pulse = Math.exp(-phase * 4);
  const beatN = Math.floor(F.beatT / F.beat);
  const [r, g, b] = beatN % 2 ? [255, 143, 0] : [255, 195, 0];
  const k = 0.12 + 0.88 * pulse;
  return { color: `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`, diya: false };
}

// Sizing helpers for UI readouts
export function layoutInfo(c, scale) {
  const L = figureLayout(c, scale);
  return { figures: L.boxes.length, hatSlots: L.read.hat, gloveSlots: L.read.glove, shoeSlots: L.read.shoe, partScale: L.k };
}

export { figureBoxes, fitScale, partScaleFor };
