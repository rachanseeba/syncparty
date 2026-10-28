// Show timeline: segments of pattern / transition(reveal) / figure / finale.
// compile() resolves inherited scale modes and sorts everything once, so the
// per-frame lookups are cheap and identical on every phone.
import { figureBoxes, normGrid, rippleDistance, SECTION_PRESETS } from './layout.js';
import { EASINGS, getPose, lerpPose, hatActionOffset, fitScale, partScaleFor, readability, maxTossFor, MOVES } from './figure.js';
import { DIWALI, DIWALI_LIST } from './effects.js';

export const SEGMENT_TYPES = ['pattern', 'transition', 'figure', 'finale'];
export const DEFAULT_SCALE = { mode: 'grid', variation: 'unison' };

export function beatMsOf(tl) {
  return 60000 / (tl.bpm || 100);
}

export function emptyTimeline(grid) {
  return { version: 1, title: 'Untitled show', bpm: 100, grid: normGrid(grid), marks: [], hits: [], segments: [], settings: { flashOnCut: false } };
}

const scaleKey = (s) => [s.mode, s.preset || '', s.r || '', s.c || ''].join('|');

export function sameScaleLayout(a, b) {
  return scaleKey(a) === scaleKey(b);
}

export function compile(tl) {
  const grid = normGrid(tl.grid);
  const beat = beatMsOf(tl);
  const segments = (tl.segments || [])
    .map((s) => ({ ...s }))
    .sort((a, b) => a.start_ms - b.start_ms);
  for (const s of segments) {
    if (s.type === 'figure') {
      let cur = { ...DEFAULT_SCALE };
      s.kfs = (s.keyframes || [])
        .map((k) => ({ ...k }))
        .sort((a, b) => a.t - b.t)
        .map((k, i, arr) => {
          if (k.scale) cur = { ...DEFAULT_SCALE, ...k.scale };
          const prev = i > 0 ? arr[i - 1]._scale : null;
          k._scale = cur;
          k._cut = !!prev && !sameScaleLayout(prev, cur);
          k._pose = getPose(k.pose);
          return k;
        });
    }
    if (s.type === 'pattern') s.effects = (s.effects || []).slice().sort((a, b) => a.t - b.t);
  }
  const finale = segments.find((s) => s.type === 'finale') || null;
  return { tl, grid, beat, segments, finale, layouts: new Map() };
}

export function segmentAt(c, t) {
  const segs = c.segments;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (t >= s.start_ms && (s.end_ms == null || t < s.end_ms)) return s;
  }
  return null;
}

// index of the last keyframe with kf.t <= t (or -1)
function kfIndex(kfs, t) {
  let lo = 0, hi = kfs.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (kfs[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

export function poseAt(seg, t) {
  const k = seg.kfs;
  if (!k.length) return getPose('idle_a');
  const i = kfIndex(k, t);
  if (i < 0) return k[0]._pose;
  if (i >= k.length - 1) return k[i]._pose;
  const a = k[i], b = k[i + 1];
  const u = (t - a.t) / Math.max(1, b.t - a.t);
  const ease = EASINGS[b.ease] || EASINGS.smooth;
  return lerpPose(a._pose, b._pose, ease(Math.min(1, Math.max(0, u))));
}

// Hat action runs from its keyframe to the next keyframe (the catch beat).
export function hatAt(seg, t, maxToss) {
  const k = seg.kfs;
  const i = kfIndex(k, t);
  if (i < 0 || !k[i].hat) return null;
  const end = i < k.length - 1 ? k[i + 1].t : Math.min(seg.end_ms, k[i].t + 1000);
  const u = (t - k[i].t) / Math.max(1, end - k[i].t);
  if (u >= 1) return null;
  return hatActionOffset(k[i].hat, u, maxToss);
}

export function scaleAt(seg, t) {
  const k = seg.kfs;
  if (!k.length) return { kf: null, scale: DEFAULT_SCALE };
  const i = Math.max(0, kfIndex(k, t));
  return { kf: k[i], scale: k[i]._scale };
}

// Figure boxes + uniform figure scale + part scale for a scale mode (cached).
export function figureLayout(c, scale) {
  const key = scaleKey(scale);
  let L = c.layouts.get(key);
  if (L) return L;
  const { boxes, sr, sc } = figureBoxes(scale, c.grid);
  const mode = scale.mode || 'grid';
  const S = Math.min(...boxes.map((b) => fitScale(b, mode)));
  const k = partScaleFor(S, mode);
  const read = readability(S, k);
  const maxToss = Math.min(...boxes.map((b) => maxTossFor(b, S, k)));
  L = { boxes, sr, sc, S, k, read, maxToss, mode };
  c.layouts.set(key, L);
  return L;
}

export function rippleDelay(scale, box, L, beat) {
  if (scale.variation !== 'ripple') return 0;
  const step = scale.step_ms != null ? scale.step_ms : (scale.step_beats ?? 0.25) * beat;
  return rippleDistance(scale.origin || 'lr', box.i, box.j, L.sr, L.sc) * step;
}

// Reveal: black hold -> hat fades in floating -> gloves pop -> shoes pop.
export function revealAt(seg, t, beat) {
  const hatMs = seg.hat_ms ?? seg.start_ms + beat;
  const glovesMs = seg.gloves_ms ?? hatMs + beat;
  const shoesMs = seg.shoes_ms ?? glovesMs + beat;
  const fade = seg.fade_ms ?? Math.min(beat * 0.9, 700);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const gloves = clamp((t - glovesMs) / 160);
  return {
    hat: clamp((t - hatMs) / fade),
    gloves,
    collar: gloves,
    shoes: clamp((t - shoesMs) / 160),
    float: t < shoesMs ? 0.025 * Math.sin(((t - hatMs) / (beat * 2)) * Math.PI * 2) : 0,
  };
}

// ── Readability checks for the authoring page ─────────────────────────────
export function readabilityWarnings(c) {
  const out = [];
  for (const s of c.segments) {
    if (s.type !== 'figure') continue;
    let last = null;
    for (const k of s.kfs) {
      if (last && sameScaleLayout(last, k._scale)) continue;
      last = k._scale;
      const L = figureLayout(c, k._scale);
      const at = (k.t / 1000).toFixed(2) + 's';
      if (L.mode === 'sections' && L.read.hat < 1) out.push({ t: k.t, level: 'warn', msg: `${at}: sections (${k._scale.preset || 'custom'}) hat is ${L.read.hat.toFixed(2)} slots wide — narrower than 1 slot` });
      if (L.mode === 'grid' && (L.read.hat < 2 || L.read.glove < 0.6)) out.push({ t: k.t, level: 'warn', msg: `${at}: grid hat ${L.read.hat.toFixed(2)} / glove ${L.read.glove.toFixed(2)} slots — below the 2 / 0.6 minimum even after auto-scale` });
    }
  }
  return out;
}

// ── Authoring helpers / presets ───────────────────────────────────────────
export function nextMarkIndex(marks, t) {
  const i = marks.findIndex((m) => m >= t - 1);
  return i < 0 ? marks.length : i;
}

// Assign a move (pose cycle) to `count` marks starting at mark index i0.
export function moveKeyframes(marks, i0, count, moveKey, scale) {
  const mv = MOVES[moveKey] || MOVES.idle_bounce;
  const out = [];
  for (let n = 0; n < count && i0 + n < marks.length; n++) {
    const kf = { t: marks[i0 + n], pose: mv.poses[n % mv.poses.length] };
    if (n === 0 && scale) kf.scale = scale;
    out.push(kf);
  }
  return out;
}

// "Shatter & Rebuild": grid -> shatter to cell (unison) -> ripple -> mirror ->
// build back (cell -> 2x2 blocks -> quadrants -> grid) on consecutive marks.
export function shatterRebuild(marks, i0, opts = {}) {
  const per = opts.perPhase || 4;
  const move = opts.move || 'muqabla_pop';
  const phases = [
    [{ mode: 'grid', variation: 'unison' }, per],
    [{ mode: 'cell', variation: 'unison' }, per],
    [{ mode: 'cell', variation: 'ripple', origin: opts.origin || 'lr', step_beats: 0.25 }, per],
    [{ mode: 'cell', variation: 'mirror' }, per],
    [{ mode: 'sections', preset: 'blocks2', variation: 'unison' }, 1],
    [{ mode: 'sections', preset: '2x2', variation: 'unison' }, 1],
    [{ mode: 'grid', variation: 'unison' }, 1],
  ];
  const mv = MOVES[move] || MOVES.muqabla_pop;
  const out = [];
  let i = i0, n = 0;
  for (const [scale, count] of phases) {
    for (let c = 0; c < count && i < marks.length; c++, i++, n++) {
      const kf = { t: marks[i], pose: mv.poses[n % mv.poses.length] };
      if (c === 0) kf.scale = scale;
      out.push(kf);
    }
  }
  return { keyframes: out, used: i - i0 };
}

// Auto-place Act 1 effects on beat marks, phrase by phrase (8 marks each).
export function autoPatternEffects(marks, hits, start, end, beat) {
  const ms = marks.filter((m) => m >= start && m < end);
  const fx = [];
  const P = DIWALI_LIST;
  let seed = 11;
  ms.forEach((m, n) => {
    const phrase = Math.floor(n / 8) % 6, inBar = n % 8;
    const col = P[n % P.length];
    switch (phrase) {
      case 0:
        fx.push({ t: m, dur: beat * 0.95, type: 'wash', color: inBar % 2 ? DIWALI.saffron : DIWALI.gold, level: 0.8 });
        break;
      case 1:
        if (inBar % 4 === 0) fx.push({ t: m, dur: beat * 4, type: 'chase', axis: 'row', colors: [DIWALI.gold, DIWALI.saffron], passes: 2 });
        if (inBar % 4 === 0) fx.push({ t: m, dur: beat * 0.8, type: 'wash', color: DIWALI.red, level: 0.5 });
        break;
      case 2:
        if (inBar % 2 === 0) fx.push({ t: m, dur: beat * 2, type: 'sweep', axis: 'col', dir: inBar % 4 ? -1 : 1, color: inBar % 4 ? DIWALI.magenta : DIWALI.gold, width: 2.5 });
        break;
      case 3:
        fx.push({ t: m, dur: beat * 1.6, type: 'ripple', color: col, colors: [col, P[(n + 1) % P.length]], rings: 2, thickness: 1.4 });
        break;
      case 4:
        if (inBar === 0) fx.push({ t: m, dur: beat * 8, type: 'sparkle', colors: [DIWALI.gold, DIWALI.saffron, DIWALI.magenta], seed: seed++ });
        if (inBar % 4 === 0) fx.push({ t: m, dur: beat * 1.2, type: 'wash', color: DIWALI.magenta, level: 0.55 });
        break;
      case 5:
        if (inBar < 6) fx.push({ t: m, dur: beat, type: 'chase', axis: 'col', colors: [DIWALI.saffron, DIWALI.gold], passes: 1, bounce: true, dir: inBar % 2 ? -1 : 1 });
        else fx.push({ t: m, dur: beat, type: 'strobe', colors: [DIWALI.warm, DIWALI.gold], count: 4, level: 0.8 });
        break;
    }
  });
  for (const h of hits.filter((x) => x >= start && x < end)) {
    fx.push({ t: h, dur: beat * 0.6, type: 'strobe', colors: [DIWALI.warm], count: 3, level: 0.8 });
    fx.push({ t: h, dur: beat * 1.5, type: 'sparkle', colors: [DIWALI.gold, DIWALI.warm], seed: seed++, rate: 18 });
  }
  return fx.sort((a, b) => a.t - b.t);
}

// ── Sample show (acceptance test): Act 1 ~30s, reveal, Act 2 ~60s, finale ──
export function sampleShow({ bpm = 100, grid, firstBeat = 500, act1Beats = 48, act2Beats = 100 } = {}) {
  const beat = 60000 / bpm;
  const total = act1Beats + 4 + act2Beats;
  const marks = Array.from({ length: total + 1 }, (_, i) => Math.round(firstBeat + i * beat));
  const hits = [8, 16, 24, 32, 40, 47].map((b) => marks[b]);
  const a1End = marks[act1Beats];
  const revEnd = marks[act1Beats + 4];
  const a2 = act1Beats + 4; // first Act 2 mark index
  const a2End = marks[a2 + act2Beats];

  const kfs = [];
  const at = (b) => marks[a2 + b];
  const put = (b0, count, move, scale) => kfs.push(...moveKeyframes(marks, a2 + b0, count, move, scale));
  // grid, full-size dancer
  put(0, 4, 'idle_bounce', { mode: 'grid', variation: 'unison' });
  put(4, 8, 'side_step');
  kfs.push({ t: at(12), pose: 'hat_hold', hat: 'tip' });
  put(13, 3, 'groove');
  put(16, 8, 'rubber_legs');
  kfs.push({ t: at(24), pose: 'arms_v', hat: 'toss' }); // toss...
  kfs.push({ t: at(26), pose: 'hat_hold' }); // ...and catch on the beat
  put(27, 5, 'muqabla_pop');
  // 2x2 quadrants, unison
  put(32, 8, 'side_step', { mode: 'sections', preset: '2x2', variation: 'unison' });
  // Shatter & Rebuild: grid -> cell unison -> cell ripple -> cell mirror -> build back
  const sr = shatterRebuild(marks, a2 + 40, { perPhase: 8, move: 'muqabla_pop' });
  kfs.push(...sr.keyframes); // 8+8+8+8+3 = 35 marks: b40..b74
  put(75, 5, 'rubber_legs');
  kfs.push({ t: at(80), pose: 'arms_v', hat: 'spin' });
  kfs.push({ t: at(82), pose: 'idle_b' });
  put(83, 5, 'jump');
  kfs.push({ t: at(88), pose: 'freeze', ease: 'hit' });
  kfs.push({ t: at(90), pose: 'arms_v', hat: 'toss' });
  kfs.push({ t: at(92), pose: 'hat_hold' });
  put(93, 3, 'float_slide');
  kfs.push({ t: at(96), pose: 'bow' });

  return {
    version: 1,
    title: 'Sample show (Mukkala Mukkabla stand-in)',
    bpm,
    grid: normGrid(grid),
    marks,
    hits,
    audio: { name: 'click-track', duration_ms: a2End + 4000 },
    settings: { flashOnCut: false },
    segments: [
      { id: 'act1', type: 'pattern', start_ms: 0, end_ms: a1End, effects: autoPatternEffects(marks, hits, firstBeat, a1End, beat) },
      { id: 'reveal', type: 'transition', kind: 'reveal', start_ms: a1End, end_ms: revEnd, hat_ms: marks[act1Beats + 1], gloves_ms: marks[act1Beats + 2], shoes_ms: marks[act1Beats + 3], pose: 'idle_a' },
      { id: 'act2', type: 'figure', start_ms: revEnd, end_ms: a2End, keyframes: kfs },
      { id: 'finale', type: 'finale', start_ms: a2End, end_ms: null, bpm, diya_after_beats: 16 },
    ],
  };
}

export { SECTION_PRESETS };
