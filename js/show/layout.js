// Shared canvas geometry for the floor-mat grid.
// Canvas units: one slot is 1 wide and `aspect` tall (portrait phones), so the
// whole canvas is cols x (rows*aspect). Slot 1 is top-left; the top row is the
// mat edge nearest the audience.

export const DEFAULT_GRID = { rows: 6, cols: 8, aspect: 2 };

export function normGrid(g) {
  const rows = Math.max(1, Math.min(20, parseInt(g?.rows) || DEFAULT_GRID.rows));
  const cols = Math.max(1, Math.min(20, parseInt(g?.cols) || DEFAULT_GRID.cols));
  const aspect = Math.max(1, Math.min(3, parseFloat(g?.aspect) || DEFAULT_GRID.aspect));
  return { rows, cols, aspect };
}

export function canvasSize(g) {
  return { w: g.cols, h: g.rows * g.aspect };
}

export function slotCount(g) {
  return g.rows * g.cols;
}

// slot is 1-based
export function slotRect(g, slot) {
  const i = slot - 1, r = Math.floor(i / g.cols), c = i % g.cols;
  return { x: c, y: r * g.aspect, w: 1, h: g.aspect, r, c };
}

// Split n slots into k contiguous integer runs, so section edges land on slot edges.
function splitInt(n, k) {
  k = Math.max(1, Math.min(n, k));
  const out = [];
  let acc = 0;
  for (let i = 0; i < k; i++) {
    const next = Math.round(((i + 1) * n) / k);
    out.push([acc, next - acc]);
    acc = next;
  }
  return out;
}

// rows x cols of sections
export const SECTION_PRESETS = {
  '2x2': { r: 2, c: 2, label: '2x2 quadrants' },
  '1x2': { r: 1, c: 2, label: '1x2 halves' },
  '1x3': { r: 1, c: 3, label: '1x3 thirds' },
  '2x3': { r: 2, c: 3, label: '2x3 sixths' },
  blocks2: { block: 2, label: '2x2-slot blocks' },
};

export const SCALE_MODES = ['grid', 'sections', 'cell'];
export const VARIATIONS = ['unison', 'ripple', 'mirror'];
export const RIPPLE_ORIGINS = { lr: 'left → right', rl: 'right → left', center: 'centre → out', diag: 'diagonal', tb: 'top → bottom' };

export function sectionGrid(scale, g) {
  const mode = scale?.mode || 'grid';
  if (mode === 'cell') return { r: g.rows, c: g.cols };
  if (mode !== 'sections') return { r: 1, c: 1 };
  if (scale.preset === 'custom') return { r: parseInt(scale.r) || 1, c: parseInt(scale.c) || 1 };
  const p = SECTION_PRESETS[scale.preset || '2x2'] || SECTION_PRESETS['2x2'];
  if (p.block) return { r: Math.ceil(g.rows / p.block), c: Math.ceil(g.cols / p.block) };
  return { r: p.r, c: p.c };
}

// One box per figure, in canvas units, aligned to slot boundaries.
export function figureBoxes(scale, g) {
  const sg = sectionGrid(scale, g);
  const rows = splitInt(g.rows, sg.r), cols = splitInt(g.cols, sg.c);
  const boxes = [];
  rows.forEach(([r0, rn], i) =>
    cols.forEach(([c0, cn], j) =>
      boxes.push({ x: c0, y: r0 * g.aspect, w: cn, h: rn * g.aspect, i, j, idx: boxes.length })
    )
  );
  return { boxes, sr: rows.length, sc: cols.length };
}

// Distance (in figure steps) of section (i,j) from the ripple origin.
export function rippleDistance(origin, i, j, sr, sc) {
  switch (origin) {
    case 'rl': return sc - 1 - j;
    case 'tb': return i;
    case 'diag': return i + j;
    case 'center': return Math.hypot(i - (sr - 1) / 2, j - (sc - 1) / 2);
    default: return j;
  }
}

// Maps canvas coordinates to device pixels for a view of `rect`, then applies
// the Pepper's-ghost calibration (flip/mirror the whole canvas).
export function applyView(ctx, view, g) {
  const { rect, pxW, pxH } = view;
  const sx = pxW / rect.w, sy = pxH / rect.h;
  ctx.setTransform(sx, 0, 0, sy, -rect.x * sx, -rect.y * sy);
  const { w, h } = canvasSize(g);
  if (view.mirrorH) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  if (view.flipV) { ctx.translate(0, h); ctx.scale(1, -1); }
}

// Logical-canvas rect visible on this view (after flip/mirror), for culling.
export function visibleRect(view, g) {
  const { w, h } = canvasSize(g);
  let { x, y, w: rw, h: rh } = view.rect;
  if (view.mirrorH) x = w - x - rw;
  if (view.flipV) y = h - y - rh;
  return { x, y, w: rw, h: rh };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
