// "Invisible man" figure: a skeleton driven by joint angles, drawn as hat,
// collar, gloves and shoes only (or as a stick body). Everything that is not a
// part stays pure black, so the face under the hat is always empty.
//
// Figure units: ground at y=0, y up, total height ~1. Limb angles are degrees
// from straight down, positive = outward (away from the body's centre line);
// the lower segment angle is relative to the upper one.

const SK = {
  hipY: 0.46, torso: 0.29, neck: 0.05, headR: 0.062,
  shX: 0.085, shDrop: 0.025, ua: 0.135, la: 0.125,
  hipX: 0.05, ul: 0.21, ll: 0.21, ankle: 0.03,
};

// Part sizes (figure units, before part scale k)
const PART = { hatW: 0.26, hatCrown: 0.095, gloveR: 0.038, shoeRx: 0.062, shoeRy: 0.03 };

export const FIG_H = 1.0;

export const DEFAULT_PALETTE = {
  hat: '#FFB627', band: '#E8590C', collar: '#FFE3A3',
  gloves: '#FFF0CC', shoes: '#FF9A1F', body: '#C98A2B',
};

const N = { rx: 0, ry: 0, torso: 0, head: 0, shrug: 0, la: [12, 8], ra: [12, 8], ll: [5, 0], rl: [5, 0] };
const P = (o) => ({ ...N, ...o });

export const POSES = {
  idle_a: P({}),
  idle_b: P({ ll: [10, -18], rl: [10, -18], la: [16, 20], ra: [16, 20], head: 3 }),
  arms_up: P({ la: [165, 8], ra: [165, 8] }),
  arms_v: P({ la: [135, 0], ra: [135, 0], ll: [12, 0], rl: [12, 0] }),
  step_l: P({ rx: -0.07, torso: -4, head: 4, ll: [22, -4], rl: [2, -10], la: [50, 40], ra: [18, 60] }),
  kick_l: P({ ll: [80, -10], rl: [4, -6], la: [25, 95], ra: [110, 20], torso: 4, head: -5 }),
  dip: P({ ll: [18, -36], rl: [18, -36], la: [30, 30], ra: [30, 30] }),
  jump: P({ ry: 0.12, ll: [28, -58], rl: [28, -58], la: [160, 10], ra: [160, 10] }),
  nod_a: P({ head: 9, shrug: 0.012, la: [20, 70], ra: [20, 70], ll: [8, -12], rl: [8, -12] }),
  nod_b: P({ head: -7, shrug: -0.006, la: [14, 55], ra: [14, 55] }),
  freeze: P({ la: [140, 0], ra: [38, -115], ll: [22, 0], rl: [10, -14], torso: -6, head: -10 }),
  bow: P({ ll: [8, -22], rl: [8, -22], head: 22, la: [25, -95], ra: [70, 10] }),
  hat_hold: P({ ra: [125, 100], la: [15, 10], head: -8, torso: -3 }),
  // Prabhu Deva-flavoured signatures
  rubber_a: P({ ll: [34, -62], rl: [34, -62], la: [45, 85], ra: [45, 85], shrug: 0.01 }),
  rubber_b: P({ ll: [-6, 16], rl: [-6, 16], la: [30, 70], ra: [30, 70] }),
  pop_l: P({ torso: -9, head: 12, shrug: 0.02, rx: -0.03, la: [110, 95], ra: [20, 30], ll: [14, -20], rl: [4, 0] }),
  slide_l: P({ rx: -0.12, ll: [6, 0], rl: [-4, -38], la: [30, 35], ra: [8, 25], torso: -3, head: -6 }),
};

export function mirrorPose(p) {
  return { ...p, rx: -p.rx, torso: -p.torso, head: -p.head, la: p.ra, ra: p.la, ll: p.rl, rl: p.ll };
}

POSES.step_r = mirrorPose(POSES.step_l);
POSES.kick_r = mirrorPose(POSES.kick_l);
POSES.pop_r = mirrorPose(POSES.pop_l);
POSES.slide_r = mirrorPose(POSES.slide_l);

export const POSE_GROUPS = {
  Basics: ['idle_a', 'idle_b', 'arms_up', 'arms_v', 'step_l', 'step_r', 'kick_l', 'kick_r', 'dip', 'jump', 'nod_a', 'nod_b', 'freeze', 'bow', 'hat_hold'],
  Signature: ['rubber_a', 'rubber_b', 'pop_l', 'pop_r', 'slide_l', 'slide_r'],
};

// Multi-pose moves, cycled one pose per beat mark by the authoring tools.
export const MOVES = {
  idle_bounce: { label: 'Idle bounce', poses: ['idle_a', 'idle_b'] },
  side_step: { label: 'Side step L/R', poses: ['step_l', 'step_r'] },
  groove: { label: 'Head-nod groove', poses: ['nod_a', 'nod_b'] },
  arms_up: { label: 'Arms up', poses: ['idle_b', 'arms_up'] },
  kick: { label: 'Kick', poses: ['kick_l', 'idle_a', 'kick_r', 'idle_a'] },
  jump: { label: 'Jump', poses: ['dip', 'jump', 'idle_b', 'idle_a'] },
  rubber_legs: { label: 'Rubber legs (signature)', poses: ['rubber_a', 'rubber_b'] },
  muqabla_pop: { label: 'Muqabla shoulder pop (signature)', poses: ['pop_l', 'pop_r'] },
  float_slide: { label: 'Invisible float slide (signature)', poses: ['slide_l', 'slide_r'] },
  freeze: { label: 'Freeze', poses: ['freeze'] },
  bow: { label: 'Bow', poses: ['bow'] },
};

export const HAT_ACTIONS = ['tip', 'spin', 'toss'];

export const EASINGS = {
  smooth: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  linear: (u) => u,
  // hold, then arrive fast on the beat
  hit: (u) => (u < 0.4 ? 0 : EASINGS.smooth((u - 0.4) / 0.6)),
  step: (u) => (u < 1 ? 0 : 1),
};

const lerp = (a, b, u) => a + (b - a) * u;
const lerp2 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];

export function lerpPose(a, b, u) {
  return {
    rx: lerp(a.rx, b.rx, u), ry: lerp(a.ry, b.ry, u), torso: lerp(a.torso, b.torso, u),
    head: lerp(a.head, b.head, u), shrug: lerp(a.shrug, b.shrug, u),
    la: lerp2(a.la, b.la, u), ra: lerp2(a.ra, b.ra, u), ll: lerp2(a.ll, b.ll, u), rl: lerp2(a.rl, b.rl, u),
  };
}

export function getPose(name) {
  return POSES[name] || POSES.idle_a;
}

const D2R = Math.PI / 180;
// rotate v clockwise by deg (y-up), so (0,1) leans toward +x
function rot(v, deg) {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c];
}
// unit vector `deg` outward from straight down, for side s (-1 = screen left)
function limbDir(s, deg) {
  return [s * Math.sin(deg * D2R), -Math.cos(deg * D2R)];
}
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

// Forward kinematics -> joint positions in figure units (ground y=0).
export function solve(p) {
  const pelvis = [p.rx, SK.hipY];
  const up = rot([0, 1], p.torso);
  const neck = add(pelvis, up, SK.torso);
  const headDir = rot([0, 1], p.torso + p.head);
  const head = add(neck, headDir, SK.neck + SK.headR);
  const out = { pelvis, neck, head, headAngle: p.torso + p.head, torso: p.torso };
  for (const [key, s, ang] of [['l', -1, p.la], ['r', 1, p.ra]]) {
    const sh = add(add(neck, rot([s * SK.shX, 0], p.torso)), up, -SK.shDrop + p.shrug);
    const elbow = add(sh, rot(limbDir(s, ang[0]), p.torso), SK.ua);
    const fdir = rot(limbDir(s, ang[0] + ang[1]), p.torso);
    const wrist = add(elbow, fdir, SK.la);
    out['sh' + key] = sh; out['el' + key] = elbow; out['wr' + key] = wrist; out['fd' + key] = fdir;
  }
  for (const [key, s, ang] of [['l', -1, p.ll], ['r', 1, p.rl]]) {
    const hip = [pelvis[0] + s * SK.hipX, pelvis[1]];
    const knee = add(hip, limbDir(s, ang[0]), SK.ul);
    const sdir = limbDir(s, ang[0] + ang[1]);
    const ankle = add(knee, sdir, SK.ll);
    out['hp' + key] = hip; out['kn' + key] = knee; out['an' + key] = ankle; out['sd' + key] = sdir;
  }
  // keep the lowest foot on the ground, then lift by ry (jumps)
  const dy = SK.ankle - Math.min(out.anl[1], out.anr[1]) + p.ry;
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (Array.isArray(v) && !k.startsWith('fd') && !k.startsWith('sd')) v[1] += dy;
  }
  return out;
}

// Fit a figure into a box (canvas units). Returns S (canvas units per figure unit)
export function fitScale(box, mode) {
  if (mode === 'cell') return Math.min((box.h * 0.8) / FIG_H, box.w / 0.72);
  return Math.min((box.h * 0.9) / FIG_H, box.w / 0.82);
}

// Part scale k that keeps grid-mode parts readable through the glass:
// hat >= 2 slot widths, gloves >= 0.6 slot width (slot width = 1 canvas unit).
export function partScaleFor(S, mode) {
  if (mode !== 'grid') return 1;
  const need = Math.max(1, 2 / (PART.hatW * S), 0.6 / (PART.gloveR * 2 * S));
  return Math.min(1.7, need);
}

// Part widths in slot widths for a given S and k.
export function readability(S, k) {
  return { hat: PART.hatW * k * S, glove: PART.gloveR * 2 * k * S, shoe: PART.shoeRx * 2 * k * S };
}

// Hat offset (figure units, head-local) for an action at progress u in [0,1].
export function hatActionOffset(action, u, maxToss) {
  const o = { x: 0, y: 0, r: 0, spin: 0, world: false };
  if (!action) return o;
  if (action === 'tip') {
    const s = Math.sin(Math.PI * u);
    o.y = 0.035 * s; o.r = 28 * s;
  } else if (action === 'spin') {
    o.spin = 720 * EASINGS.smooth(u);
    o.y = 0.02 * Math.sin(Math.PI * u);
  } else if (action === 'toss') {
    const h = Math.max(0.12, Math.min(0.34, maxToss));
    o.y = 4 * h * u * (1 - u); o.r = 540 * u; o.world = true;
  }
  return o;
}

function ellipse(ctx, x, y, rx, ry, r) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawHat(ctx, pal, k, alpha) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const bw = (PART.hatW / 2) * k, ch = PART.hatCrown * k;
  // crown
  ctx.fillStyle = pal.hat;
  ctx.beginPath();
  ctx.moveTo(-0.072 * k, 0);
  ctx.lineTo(-0.064 * k, ch);
  ctx.quadraticCurveTo(0, ch - 0.02 * k, 0.064 * k, ch);
  ctx.lineTo(0.072 * k, 0);
  ctx.closePath();
  ctx.fill();
  // band (solid, contrasting)
  ctx.fillStyle = pal.band;
  ctx.fillRect(-0.0715 * k, 0.006 * k, 0.143 * k, 0.026 * k);
  // brim
  ctx.fillStyle = pal.hat;
  ellipse(ctx, 0, 0, bw, 0.022 * k, 0);
  ctx.globalAlpha = 1;
}

function popScale(a) {
  // 0..1 reveal amount -> scale with a small overshoot "pop"
  if (a >= 1) return 1;
  return a < 0.7 ? (a / 0.7) * 1.15 : 1.15 - 0.15 * ((a - 0.7) / 0.3);
}

/**
 * Draw one figure.
 * opts: { box, S, k, mirror, style:'invisible'|'stick', palette, hat:{x,y,r,spin,world},
 *         reveal:{hat,gloves,shoes,collar} (0..1), hatFloat }
 */
export function drawFigure(ctx, pose, opts) {
  const { box, S, k = 1, style = 'invisible' } = opts;
  const pal = opts.palette || DEFAULT_PALETTE;
  const rv = opts.reveal || { hat: 1, gloves: 1, shoes: 1, collar: 1 };
  const p = opts.mirror ? mirrorPose(pose) : pose;
  const J = solve(p);
  const cx = box.x + box.w / 2;
  const ground = Math.min(box.y + box.h, box.y + box.h / 2 + (S * FIG_H) / 2 + box.h * 0.02);

  ctx.save();
  ctx.translate(cx, ground);
  ctx.scale(S, -S); // y-up figure space

  if (style === 'stick') {
    ctx.strokeStyle = pal.body;
    ctx.fillStyle = pal.body;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.032;
    const line = (...pts) => { ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach((q) => ctx.lineTo(...q)); ctx.stroke(); };
    line(J.pelvis, J.neck);
    line(J.shl, J.shr);
    line(J.shl, J.ell, J.wrl);
    line(J.shr, J.elr, J.wrr);
    line(J.hpl, J.hpr);
    line(J.hpl, J.knl, J.anl);
    line(J.hpr, J.knr, J.anr);
    ellipse(ctx, J.head[0], J.head[1], SK.headR, SK.headR, 0);
  }

  // shoes: ovals at the ankles, toe pointing outward, following the shin
  if (rv.shoes > 0) {
    const sc = popScale(rv.shoes);
    ctx.fillStyle = pal.shoes;
    ctx.globalAlpha = Math.min(1, rv.shoes * 1.5);
    for (const [s, an, sd] of [[-1, J.anl, J.sdl], [1, J.anr, J.sdr]]) {
      const tilt = Math.atan2(sd[0], -sd[1]); // shin angle from vertical
      const rx = PART.shoeRx * k * sc, ry = PART.shoeRy * k * sc;
      const ox = s * rx * 0.45 * Math.cos(tilt), oy = s * rx * 0.45 * Math.sin(tilt);
      ellipse(ctx, an[0] + ox, an[1] - ry * 0.4 + oy, rx, ry, tilt);
    }
    ctx.globalAlpha = 1;
  }

  // collar: a small solid V at the neck, turning with the torso
  if (rv.collar > 0) {
    ctx.save();
    ctx.globalAlpha = rv.collar;
    ctx.translate(J.neck[0], J.neck[1]);
    ctx.rotate(-J.torso * D2R);
    ctx.scale(k, k);
    ctx.fillStyle = pal.collar;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -0.04);
      ctx.lineTo(s * 0.055, 0.008);
      ctx.lineTo(s * 0.014, 0.012);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // gloves: filled blobs at the wrists with a thumb
  if (rv.gloves > 0) {
    const sc = popScale(rv.gloves);
    ctx.fillStyle = pal.gloves;
    ctx.globalAlpha = Math.min(1, rv.gloves * 1.5);
    for (const [s, wr, fd] of [[-1, J.wrl, J.fdl], [1, J.wrr, J.fdr]]) {
      const r = PART.gloveR * k * sc;
      const c = add(wr, fd, r * 0.6);
      ellipse(ctx, c[0], c[1], r, r, 0);
      // thumb sits on the inner side of the hand
      const perp = [-fd[1] * -s, fd[0] * -s];
      ellipse(ctx, c[0] + perp[0] * r * 0.85 - fd[0] * r * 0.2, c[1] + perp[1] * r * 0.85 - fd[1] * r * 0.2, r * 0.45, r * 0.45, 0);
    }
    ctx.globalAlpha = 1;
  }

  // hat: brim just above head centre so the face area below stays black
  if (rv.hat > 0) {
    const h = opts.hat || { x: 0, y: 0, r: 0, spin: 0 };
    const ha = J.headAngle;
    const base = add(J.head, rot([0, 1], ha), SK.headR * 0.28);
    let pos, ang;
    if (h.world) {
      pos = [base[0] + h.x, base[1] + h.y];
      ang = ha + h.r;
    } else {
      const off = rot([h.x, h.y], ha);
      pos = [base[0] + off[0], base[1] + off[1]];
      ang = ha + (opts.mirror ? -h.r : h.r);
    }
    if (opts.hatFloat) pos[1] += opts.hatFloat;
    // keep a tossed hat inside the box
    const topLimit = (ground - box.y) / S - PART.hatCrown * k;
    if (pos[1] > topLimit) pos[1] = topLimit;
    ctx.save();
    ctx.translate(pos[0], pos[1]);
    ctx.rotate(-ang * D2R);
    const sx = Math.max(0.08, Math.abs(Math.cos((h.spin || 0) * D2R)));
    ctx.scale(sx, 1);
    drawHat(ctx, pal, k, Math.min(1, rv.hat));
    ctx.restore();
  }

  ctx.restore();
}

// Max toss height (figure units) that stays inside the box.
export function maxTossFor(box, S, k) {
  const ground = Math.min(box.y + box.h, box.y + box.h / 2 + (S * FIG_H) / 2 + box.h * 0.02);
  const room = (ground - box.y) / S;
  return room - 0.88 - PART.hatCrown * k - 0.02;
}
