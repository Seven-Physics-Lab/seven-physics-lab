/* ============================================================================
 * E2-2  The Photoelectric Effect
 * IB Physics E.2 Quantum physics
 *
 * Light falls on a metal plate in a vacuum tube, and sometimes electrons come
 * out of it and cross to a second plate. Whether they come out at all depends
 * on the colour of the light and not on how bright it is. How fast the
 * fastest of them is going depends on the colour too, and not on the
 * brightness. The brightness decides only how many. None of that makes sense
 * if light is a wave that pours energy steadily onto the metal, and all of it
 * makes sense if light arrives in lumps.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does not contain eV_s = hf − φ, or KE_max = hf − φ, or f₀ = φ/h,
 * or "the current is proportional to the intensity", or the shape of the
 * current–voltage curve. What it contains is:
 *
 *   · Planck: light of frequency f comes in photons of energy hf, and the
 *     intensity slider is how many of them arrive each second.
 *   · One photon, one electron: a photon that is absorbed gives all of its
 *     energy to a single electron, never shares it, never adds to another.
 *   · The books at the surface: an electron sitting a depth ε below the top
 *     of the metal's band needs φ + ε to get out, and leaves with whatever is
 *     left over. The electron that takes the photon is equally likely to be
 *     at any depth down the top 3 eV of the band.
 *   · Newton, between the plates: a uniform field, e V / d, pushing the
 *     electron towards whichever plate is positive. The electron leaves in a
 *     random direction, so only the part of its motion straight across the
 *     gap is fought by the field.
 *
 * The stopping potential is FOUND, by lowering the voltage on the collector
 * until the current reaching it falls to nothing. The straight line of the
 * Millikan graph comes out of doing that at several frequencies, and its
 * gradient is measured; that it is Planck's constant over e is a result.
 * The threshold is found by lowering the frequency until no electron escapes.
 *
 * WHAT IS DECLARED
 *
 *   · One photon in two is taken to be absorbed by an electron that could
 *     get out. In a real metal it is closer to one in ten thousand; that
 *     would leave the ammeter reading nanoamps and the picture empty.
 *   · The dots are a sample. At full brightness 2 × 10¹⁵ photons arrive each
 *     second; each photon drawn stands for a great many, and each electron
 *     drawn likewise. The ammeter reads the current of all of them.
 *   · The electrons are drawn slowed down forty million times. They cross
 *     the tube in a hundredth of a microsecond or so.
 *   · The two plates are taken to be the same material, so there is no
 *     contact potential between them, and the electrons in flight are too few
 *     to push on each other.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, ctext, croundRect,
} from '../sim-kit.js';
import { wavelengthCSS } from '../colour.js';

/* ---------------------------------------------------------------- constants */

export const H = 6.62607015e-34;          // J s — exact, by definition of the SI
export const QE = 1.602176634e-19;        // C — exact
export const ME = 9.1093837015e-31;       // kg
export const C0 = 299792458;              // m s⁻¹

/* typical clean-surface values; real ones vary with the surface by ~0.1 eV */
export const METALS = {
  sodium:   { name: 'sodium',   phi: 2.28 },
  calcium:  { name: 'calcium',  phi: 2.87 },
  zinc:     { name: 'zinc',     phi: 4.33 },
  copper:   { name: 'copper',   phi: 4.70 },
  platinum: { name: 'platinum', phi: 5.64 },
};
const METAL_KEYS = ['sodium', 'calcium', 'zinc', 'copper', 'platinum'];

export const BAND = 3.0;       // eV — how deep down the band the electrons are taken from
export const ETA = 0.5;        // chance a photon is taken by an electron (declared)
export const GAP = 0.01;       // m between emitter and collector
export const RC = 0.016;       // m, collector radius
export const RS = 0.004;       // m, radius of the lit spot on the emitter

const F_LO = 3.0e14, F_HI = 2.0e15;       // Hz
const N_HI = 2.0e15;                       // photons per second at full brightness
const V_HI = 6;                            // volts either way
const TSCALE = 2.5e-8;                     // physical seconds per second drawn

const MW = 1120, NARROW = 760;

/* --------------------------------------------------------------- the physics */

/** the fraction of a disc of radius rs, centred L from the middle of a disc
 *  of radius R, that lies inside it: where a spread-out bundle lands */
export function overlapFrac(L, rs, R) {
  if (L + rs <= R) return 1;
  if (L >= R + rs) return 0;
  if (L + R <= rs) return (R * R) / (rs * rs);
  const a = Math.acos(clamp((L * L + rs * rs - R * R) / (2 * L * rs), -1, 1));
  const b = Math.acos(clamp((L * L + R * R - rs * rs) / (2 * L * R), -1, 1));
  const area = rs * rs * (a - Math.sin(2 * a) / 2) + R * R * (b - Math.sin(2 * b) / 2);
  return area / (Math.PI * rs * rs);
}

/**
 * One electron leaving with kinetic energy K (joules) at angle θ to the
 * normal, into a field that accelerates it across the gap when Vc > 0 (the
 * collector positive) and holds it back when Vc < 0. Newton, and nothing else:
 *
 *     across:   x = v⊥ t + ½ a t²,   a = e Vc / (m d)
 *     along:    the sideways speed never changes
 *
 * Returns the time to reach the collector and how far it drifted sideways
 * on the way, or null if it was turned back.
 */
export function flight(K, c, Vc, d = GAP) {
  const v = Math.sqrt(2 * K / ME);
  const vn = v * c, vt = v * Math.sqrt(Math.max(0, 1 - c * c));
  const a = QE * Vc / (ME * d);
  let t;
  if (Math.abs(a) < 1e-6) {
    if (!(vn > 0)) return null;
    t = d / vn;
  } else {
    const disc = vn * vn + 2 * a * d;
    if (disc < 0) return null;
    t = (-vn + Math.sqrt(disc)) / a;
    if (!(t > 0)) return null;
  }
  return { t, L: vt * t, vn, vt, a };
}

/* Gauss–Legendre nodes on [0, 1] */
function gl(n) {
  const x = [], w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), z1, pp;
    do {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2; p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      pp = n * (z * p1 - p2) / (z * z - 1);
      z1 = z; z = z1 - p1 / pp;
    } while (Math.abs(z - z1) > 1e-15);
    x.push(0.5 * (1 - z)); w.push(1 / ((1 - z * z) * pp * pp));
  }
  return { x, w };
}
const GE = gl(24), GC = gl(24);

/**
 * The current reaching the collector, in amperes, averaged over everything
 * the model allows: every depth an electron could have started from, every
 * direction it could have left in, every point of the lit spot. Nothing in
 * here knows where the current will stop — the limits of the integral are
 * just the places where an electron would not get out, or would be turned
 * back.
 */
export function current(f, N, Vc, phi, opts = {}) {
  const band = opts.band ?? BAND, eta = opts.eta ?? ETA;
  const d = opts.d ?? GAP, rc = opts.rc ?? RC, rs = opts.rs ?? RS;
  const hf = H * f / QE;                        // eV
  const spare = hf - phi;                       // what the least-bound one keeps
  if (!(spare > 0) || !(N > 0)) return 0;
  const ret = Vc < 0 ? -Vc : 0;                 // volts it has to climb
  const eMax = Math.min(band, spare - ret);     // deepest electron that can still arrive
  if (!(eMax > 0)) return 0;
  let s = 0;
  for (let i = 0; i < GE.x.length; i++) {
    const eps = GE.x[i] * eMax;
    const K = (spare - eps) * QE;               // J
    /* straight across it must carry more than the climb: c² K > e·ret */
    const cMin = ret > 0 ? Math.sqrt(ret * QE / K) : 0;
    if (cMin >= 1) continue;
    /* the sideways drift only shrinks as the electron leaves straighter, so
     * the directions split into three runs: all of the spot misses, some of
     * it lands, all of it lands. Integrating each run separately keeps the
     * corners between them out of the quadrature. */
    const drift = c => { const fl = flight(K, c, Vc, d); return fl ? fl.L : Infinity; };
    const cross = Ltarget => {
      if (!(drift(cMin + 1e-15) > Ltarget)) return cMin;
      let lo = cMin, hi = 1;
      for (let k = 0; k < 60; k++) {
        const mid = 0.5 * (lo + hi);
        if (drift(mid) > Ltarget) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    };
    const c1 = cross(rc + rs), c2 = Math.max(c1, cross(rc - rs));
    let sc = 1 - c2;
    for (let j = 0; j < GC.x.length && c2 > c1; j++) {
      const c = c1 + GC.x[j] * (c2 - c1);
      const fl = flight(K, c, Vc, d);
      if (fl) sc += GC.w[j] * (c2 - c1) * overlapFrac(fl.L, rs, rc);
    }
    s += GE.w[i] * sc;
  }
  /* electrons per second out of the metal per unit depth, times the depths */
  const perSecond = N * eta * (s * eMax / band);
  return QE * perSecond;
}

/** how many electrons leave the metal each second, wherever they go after */
export function emitted(f, N, phi, band = BAND, eta = ETA) {
  const spare = H * f / QE - phi;
  if (!(spare > 0)) return 0;
  return N * eta * Math.min(1, spare / band);
}

/** the stopping potential, FOUND: the least collector voltage at which
 *  nothing arrives, by bisection on the current */
export function stoppingPotential(f, phi, opts = {}) {
  const N = 1e15;
  if (!(current(f, N, 0, phi, opts) > 0)) return 0;
  let lo = 0, hi = 12;                  // volts of holding back
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (current(f, N, -mid, phi, opts) > 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** the threshold, FOUND: the lowest frequency that frees anything */
export function thresholdFreq(phi) {
  let lo = 1e13, hi = 5e15;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (emitted(mid, 1e15, phi) > 0) hi = mid; else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** the Millikan line for a metal: stopping potentials at several
 *  frequencies, and the straight line through them by least squares */
export function millikan(phi) {
  const f0 = thresholdFreq(phi);
  const pts = [];
  const lo = Math.max(F_LO, f0 * 1.06), hi = F_HI;
  if (hi <= lo) return { pts, slope: NaN, f0 };
  for (let k = 0; k < 7; k++) {
    const f = lo + (hi - lo) * k / 6;
    pts.push({ f, KE: stoppingPotential(f, phi) });    // eV, numerically
  }
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.f, 0) / n;
  const my = pts.reduce((a, p) => a + p.KE, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of pts) { sxy += (p.f - mx) * (p.KE - my); sxx += (p.f - mx) ** 2; }
  const slope = sxy / sxx;                             // eV per Hz
  const icpt = my - slope * mx;
  return { pts, slope, icpt, f0, fx: -icpt / slope };
}

/** wavelength band names, for the readouts */
function bandName(nm) {
  if (nm < 380) return 'ultraviolet';
  if (nm > 750) return 'infrared';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  return 'red';
}

/* ================================================================== mount */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'e2-photoelectric', title: 'The Photoelectric Effect',
    theme: options.theme || 'auto', shadow: !!options.shadow,
  });

  const st = {
    setup: 'reverse',            // 'reverse': collector to −, 'forward': to +
    metal: 'zinc',
    f: 1.5e15, N: 1.0e15, V: 0.0,
    wave: false,
    photons: [], electrons: [], flashes: [],
    emitted: 0, arrived: 0, fastest: 0, hist: new Array(28).fill(0),
    acc: 0, clock: 0, wireDot: 0,
  };
  const phi = () => METALS[st.metal].phi;
  const Vc = () => (st.setup === 'forward' ? st.V : -st.V);
  const hfEV = (f = st.f) => H * f / QE;
  const Inow = () => current(st.f, st.N, Vc(), phi());

  const MCACHE = {};
  const mill = k => (MCACHE[k] || (MCACHE[k] = millikan(METALS[k].phi)));

  /* seeded random numbers, so a run can be repeated exactly */
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };

  function clearCounts() {
    st.emitted = 0; st.arrived = 0; st.fastest = 0;
    st.hist = new Array(28).fill(0);
    st.electrons = []; st.flashes = [];
  }

  /* ------------------------------------------------------------------ UI */

  const bSetup = [
    button({ label: 'Collector to the − terminal', pressed: true,
             onClick: () => setSetup('reverse') }),
    button({ label: 'Collector to the + terminal', pressed: false,
             onClick: () => setSetup('forward') }),
  ];
  function setSetup(k) {
    st.setup = k;
    bSetup[0].setPressed(k === 'reverse'); bSetup[1].setPressed(k === 'forward');
    clearCounts(); render();
  }
  const bMetal = METAL_KEYS.map(k => button({
    label: METALS[k].name, pressed: k === st.metal,
    onClick: () => { st.metal = k; bMetal.forEach((b, i) => b.setPressed(METAL_KEYS[i] === k));
                     clearCounts(); render(); },
  }));
  const bWave = button({ label: 'What wave theory predicts', pressed: false,
    onClick: () => { st.wave = !st.wave; bWave.setPressed(st.wave); render(); } });
  const bClear = button({ label: 'Clear the counts', onClick: () => { clearCounts(); render(); } });

  const sF = slider({
    label: '<i>f</i>', min: F_LO, max: F_HI, step: 1e12, value: st.f,
    format: v => `${fmt(v / 1e15, 2)} × 10¹⁵ Hz — ${fmt(C0 / v * 1e9, 0)} nm, ${bandName(C0 / v * 1e9)}`,
    onInput: v => { st.f = v; clearCounts(); render(); },
  });
  const sN = slider({
    label: 'photons', min: 0, max: N_HI, step: 1e13, value: st.N, word: true,
    format: v => `${fmt(v / 1e15, 2)} × 10¹⁵ each second`,
    onInput: v => { st.N = v; render(); },
  });
  const sV = slider({
    label: '<i>V</i>', min: 0, max: V_HI, step: 0.01, value: st.V,
    format: v => `${fmt(v, 2)} V across the tube`,
    onInput: v => { st.V = v; clearCounts(); render(); },
  });

  const out = readouts([
    { key: 'hf',    label: 'Each photon\'s energy, <i>hf</i>' },
    { key: 'metal', label: 'The metal, and the least energy that frees one of its electrons' },
    { key: 'f0',    label: 'The threshold, found by lowering the frequency until nothing escapes' },
    { key: 'fast',  label: 'The fastest electron seen leaving the plate' },
    { key: 'vs',    label: 'The stopping potential, read off the current–voltage curve' },
    { key: 'I',     label: 'The ammeter' },
    { key: 'count', label: 'Counted on the picture: electrons out, and how many arrived' },
    { key: 'wave',  label: 'What a wave would do' },
  ]);

  const bv = surface(MW, 470, { label: 'the photocell' });
  const gv = surface(MW, 520, { label: 'the graphs' });

  root.append(
    heading('The Photoelectric Effect',
            'light arrives in photons of energy <i>hf</i>; each one can free one '
            + 'electron — or none'),
    controls([el('div', { class: 'ibs-btns' }, bSetup.map(b => b.node))],
             { label: 'the circuit:' }),
    controls([el('div', { class: 'ibs-btns' }, bMetal.map(b => b.node))],
             { label: 'the emitter:' }),
    panelBox('The photocell — light on the emitter, electrons across to the collector', bv.el),
    panelBox('What the measurements say', gv.el),
    controls([el('div', { class: 'ibs-btns' }, [bWave.node, bClear.node])]),
    controls([sF.node, sN.node, sV.node]),
    out.node,
    note('<b>The colour decides whether, the brightness decides how many.</b> '
      + 'Every photon carries <i>hf</i>, and a photon is taken whole by one electron '
      + 'or not at all. If <i>hf</i> is less than what it costs the best-placed '
      + 'electron to get out, no electron ever escapes — however bright the light, '
      + 'because a brighter light is only more photons, each still too weak. Push the '
      + 'frequency past the threshold and electrons come out at once, the moment the '
      + 'first photon lands; a wave would have to pour energy in for seconds or '
      + 'minutes before any one electron had enough. <b>Why they leave with a spread '
      + 'of speeds.</b> The photon gives every electron the same <i>hf</i>, but the '
      + 'electrons sit at different depths in the metal, and a deeper one spends more '
      + 'getting out. Only the shallowest leave with the whole of <i>hf</i> − φ, and '
      + 'that is the most any can have. <b>The two circuits.</b> With the collector on '
      + 'the + terminal the field helps the electrons across, and turning it up gathers '
      + 'in the ones that were heading off sideways, until every electron that '
      + 'escapes is caught and the current stops rising. With the collector on the − '
      + 'terminal the field turns them back; raise the voltage and the slower ones '
      + 'fail first, and when even the fastest cannot climb it the current is zero. '
      + 'That voltage is the stopping potential, and <i>e</i> times it is the greatest '
      + 'kinetic energy. <b>Plot it against frequency</b> for any metal and the line '
      + 'is straight, with the same gradient for every metal: that gradient is '
      + 'measured here, and it is Planck\'s constant divided by <i>e</i>.'));

  /* ============================================================= drawing */

  let P = palette(root);
  const neg = s => String(s).replace(/-/g, '−');
  let TEXTS = [], BOXES = [], PAN = 'b';

  function colText(ctx, str, x, y, maxW, size, weight, color, maxLines = 2, align = 'left') {
    let px = size;
    ctx.font = `${weight} ${px}px ${P.font}`;
    while (px > size - 1.5 && ctx.measureText(str).width > maxW) {
      px -= 0.5; ctx.font = `${weight} ${px}px ${P.font}`;
    }
    const lines = [];
    let cur = '';
    for (const w of str.split(' ')) {
      const trial = cur ? cur + ' ' + w : w;
      if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
      else { lines.push(cur); cur = w; }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines) lines.push(cur);
    while (lines.length > maxLines) lines.pop();
    let last = lines[lines.length - 1];
    if (ctx.measureText(last).width > maxW) {
      while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[lines.length - 1] = last + '…';
    }
    lines.forEach((ln, i) => {
      const yy = y + i * (px + 3);
      const w = ctx.measureText(ln).width;
      const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ctext(ctx, ln, x, yy, { font: `${weight} ${px}px ${P.font}`, color, align });
      TEXTS.push({ p: PAN, str: ln, x: x0, y: yy - px * 0.8, w, h: px * 1.05 });
    });
    return lines.length * (px + 3);
  }

  function arrowHead(ctx, x, y, ux, uy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + ux * s, y + uy * s);
    ctx.lineTo(x - ux * s * 0.6 - uy * s * 0.55, y - uy * s * 0.6 + ux * s * 0.55);
    ctx.lineTo(x - ux * s * 0.6 + uy * s * 0.55, y - uy * s * 0.6 - ux * s * 0.55);
    ctx.closePath(); ctx.fill();
  }

  /** the photocell's layout, in panel pixels; the tube is to scale */
  function layout(W) {
    const sm = W < NARROW;
    const sc = sm ? 5600 : 8800;                       // px per metre
    const plateH = RC * sc, gapPx = GAP * sc;
    const lampY = 30, gy0 = 74;
    const cy = gy0 + 22 + plateH;
    const gy1 = cy + plateH + 22;
    const rail = gy1 + (sm ? 34 : 40);
    const vY = rail + (sm ? 40 : 46);
    const H_ = vY + (sm ? 50 : 54);
    return { sm, sc, plateH, gapPx, lampY, gy0, cy, gy1, rail, vY, H: Math.round(H_) };
  }
  function GB() {
    const W = bv.w, L = layout(W);
    const ex = Math.round(W / 2 - L.gapPx / 2), cx = ex + L.gapPx;
    return { W, H: bv.h, ...L, s: L.sc, ex, cx,
             lampX: ex + L.gapPx * 0.62 };
  }
  const benchH = W => layout(W).H;

  function photonColour() {
    const nm = C0 / st.f * 1e9;
    if (nm < 380 || nm > 740) return null;
    return wavelengthCSS(nm);
  }

  function drawBench() {
    const g = GB(), ctx = bv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = TEXTS.filter(q => q.p !== 'b'); BOXES = BOXES.filter(q => q.p !== 'b');
    PAN = 'b';
    const plateH = g.plateH;
    /* the glass */
    ctx.strokeStyle = P.muted; ctx.lineWidth = 2;
    ctx.fillStyle = P.soft || 'rgba(0,95,106,.06)';
    const gx0 = g.ex - 34, gx1 = g.cx + 34, gy0 = g.gy0, gy1 = g.gy1;
    croundRect(ctx, gx0, gy0, gx1 - gx0, gy1 - gy0, 26); ctx.fill(); ctx.stroke();

    /* the plates */
    ctx.fillStyle = P.muted;
    ctx.fillRect(g.ex - 10, g.cy - plateH, 10, 2 * plateH);
    ctx.fillStyle = P.text;
    ctx.fillRect(g.cx, g.cy - plateH, 10, 2 * plateH);
    const lw = g.sm ? 0.32 * g.W : 240;
    colText(ctx, 'emitter', gx0 - 12, g.cy - plateH + 12, lw, 12, 700, P.text, 1, 'right');
    colText(ctx, METALS[st.metal].name, gx0 - 12, g.cy - plateH + 28, lw, 11, 500, P.muted, 1, 'right');
    colText(ctx, 'collector', gx1 + 12, g.cy - plateH + 12, lw, 12, 700, P.text, 1);
    colText(ctx, 'in a vacuum', gx1 + 12, g.cy - plateH + 28, lw, 11, 500, P.muted, 1);

    /* the lamp and its beam */
    const col = photonColour();
    const beamCol = col || P.muted;
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.lampX, g.lampY, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = beamCol;
    ctx.beginPath(); ctx.arc(g.lampX, g.lampY, 7, 0, Math.PI * 2); ctx.fill();
    colText(ctx, col ? 'the lamp' : `the lamp — ${bandName(C0 / st.f * 1e9)}: invisible, so drawn grey`,
            g.lampX + 22, g.lampY + 4, g.W - g.lampX - 34, 11, 500, P.muted, 1);
    const tx = g.ex, ty = g.cy;
    if (st.N > 0) {
      ctx.save();
      ctx.globalAlpha = 0.1; ctx.fillStyle = beamCol;
      const w0 = 6, w1 = RS * g.s;
      const dx = tx - g.lampX, dy = ty - g.lampY, L = Math.hypot(dx, dy);
      const nx = -dy / L, ny = dx / L;
      ctx.beginPath();
      ctx.moveTo(g.lampX + nx * w0, g.lampY + ny * w0); ctx.lineTo(tx + nx * w1, ty + ny * w1);
      ctx.lineTo(tx - nx * w1, ty - ny * w1); ctx.lineTo(g.lampX - nx * w0, g.lampY - ny * w0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    /* photons: short wave packets whose wiggle is their wavelength, to scale
     * with each other though not with the tube */
    const lamPx = 4 + 12 * (C0 / st.f * 1e9 - 150) / 850;
    for (const ph of st.photons) {
      const x = ph.x0 + (ph.x1 - ph.x0) * ph.u, y = ph.y0 + (ph.y1 - ph.y0) * ph.u;
      const dx = ph.x1 - ph.x0, dy = ph.y1 - ph.y0, L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      ctx.strokeStyle = beamCol; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const sx = (k / 20 - 0.5) * 18;
        const a = Math.sin(TAU_ * sx / lamPx) * 3.2 * Math.cos(Math.PI * (k / 20 - 0.5));
        const px = x + ux * sx - uy * a, py = y + uy * sx + ux * a;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    /* where a photon landed and freed nothing */
    for (const fl of st.flashes) {
      ctx.globalAlpha = 0.5 * Math.max(0, 1 - fl.age / 0.3);
      ctx.fillStyle = beamCol;
      ctx.beginPath(); ctx.arc(g.ex + 2, g.cy + fl.y * g.s, 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    /* electrons in flight */
    for (const e of st.electrons) {
      const t = e.t;
      const xn = e.vn * t + 0.5 * e.a * t * t;
      const ly = e.y0 + e.vy * t;
      const x = g.ex + xn * g.s, y = g.cy + ly * g.s;
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
    }

    /* the circuit: out of each plate sideways, down, and along the bottom
     * through the battery; the ammeter on the left, the voltmeter across the
     * battery */
    const rail = g.rail;
    const leftX = g.sm ? 44 : Math.max(70, gx0 - 250);
    const rightX = g.sm ? g.W - 24 : Math.min(g.W - 60, gx1 + 250);
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.ex - 10, g.cy); ctx.lineTo(leftX, g.cy); ctx.lineTo(leftX, rail);
    ctx.lineTo(rightX, rail); ctx.lineTo(rightX, g.cy); ctx.lineTo(g.cx + 10, g.cy);
    ctx.stroke();
    const bx = (leftX + rightX) / 2;
    const plusRight = st.setup === 'forward';       // the collector is on the right
    const lx = plusRight ? bx + 7 : bx - 7, sx2 = plusRight ? bx - 7 : bx + 7;
    ctx.fillStyle = P.bg; ctx.fillRect(bx - 13, rail - 20, 26, 40);
    ctx.strokeStyle = P.text;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, rail - 18); ctx.lineTo(lx, rail + 18); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx2, rail - 9); ctx.lineTo(sx2, rail + 9); ctx.stroke();
    ctext(ctx, '+', lx + (plusRight ? 10 : -10), rail - 12, { font: `700 14px ${P.font}`,
          color: P.accent, align: 'center' });
    ctext(ctx, '−', sx2 + (plusRight ? -10 : 10), rail - 12, { font: `700 14px ${P.font}`,
          color: P.text, align: 'center' });
    /* the voltmeter hangs below the battery */
    ctx.lineWidth = 1.6; ctx.strokeStyle = P.muted;
    ctx.beginPath();
    ctx.moveTo(bx - 40, rail); ctx.lineTo(bx - 40, g.vY); ctx.lineTo(bx + 40, g.vY);
    ctx.lineTo(bx + 40, rail); ctx.stroke();
    ctx.fillStyle = P.text;
    for (const x of [bx - 40, bx + 40]) { ctx.beginPath(); ctx.arc(x, rail, 3, 0, Math.PI * 2); ctx.fill(); }
    const aY = (g.cy + rail) / 2;
    const Iu = Inow() * 1e6;
    meter(ctx, leftX, aY, 'A', `${fmt(Iu, Iu >= 10 ? 1 : 2)} μA`, g.sm ? 17 : 22);
    meter(ctx, bx, g.vY, 'V', `${fmt(st.V, 2)} V`, g.sm ? 15 : 19);
    /* electrons in the wires: out of the collector, round, back into the
     * emitter, at a speed that follows the current */
    const Iamp = Inow();
    if (Iamp > 1e-12) {
      const path = [[g.cx + 10, g.cy], [rightX, g.cy], [rightX, rail], [leftX, rail],
                    [leftX, g.cy], [g.ex - 10, g.cy]];
      let Ltot = 0;
      for (let i = 1; i < path.length; i++) {
        Ltot += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      }
      const gap = 18, off = ((st.wireDot % gap) + gap) % gap;
      for (let sPos = off; sPos < Ltot; sPos += gap) {
        let rem = sPos, i = 1;
        while (i < path.length) {
          const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
          if (rem <= L) break;
          rem -= L; i++;
        }
        if (i >= path.length) break;
        const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        const t = L > 0 ? rem / L : 0;
        const x = path[i - 1][0] + t * (path[i][0] - path[i - 1][0]);
        const y = path[i - 1][1] + t * (path[i][1] - path[i - 1][1]);
        if (Math.abs(x - leftX) < 52 && Math.abs(y - aY) < 22) continue;
        if (Math.abs(x - bx) < 16 && Math.abs(y - rail) < 22) continue;
        if (x > gx0 && x < gx1) continue;
        ctx.fillStyle = P.accent;
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    colText(ctx, st.setup === 'forward'
      ? 'collector on the + terminal: the field pulls the electrons across'
      : 'collector on the − terminal: the field pushes the electrons back',
      g.W / 2, g.H - 12, g.W - 30, g.sm ? 10.5 : 12, 600, P.accent, 2, 'center');
  }

  /** a digital meter: its reading is what a meter is for, so it is shown */
  function meter(ctx, x, y, letter, val, r) {
    const w = r * 4.4, h = r * 1.9;
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    croundRect(ctx, x - w / 2, y - h / 2, w, h, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.soft || 'rgba(0,95,106,.1)';
    croundRect(ctx, x - w / 2 + 22, y - h / 2 + 6, w - 28, h - 12, 4); ctx.fill();
    ctext(ctx, letter, x - w / 2 + 11, y + 6, { font: `700 ${Math.round(r * 0.7)}px ${P.font}`,
          color: P.accent, align: 'center' });
    ctext(ctx, val, x + w / 2 - 10, y + 5, { font: `700 ${Math.round(r * 0.62)}px ${P.mono}`,
          color: P.text, align: 'right' });
    BOXES.push({ p: 'b', x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
    return w;
  }

  /* ------------------------------------------------------------- graphs */

  const LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const nice = v => {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (LADDER.find(q => m <= q + 1e-9) ?? 10) * p;
  };

  function GG() {
    const W = gv.w, sm = W < NARROW, H_ = gv.h;
    const cells = [];
    if (sm) {
      const h = (H_ - 16) / 4;
      for (let k = 0; k < 4; k++) cells.push({ x0: 10, y0: 8 + k * h, x1: W - 10, y1: 8 + (k + 1) * h - 8 });
    } else {
      const w = (W - 30) / 2, h = (H_ - 24) / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          cells.push({ x0: 10 + c * (w + 10), y0: 8 + r * (h + 8),
                       x1: 10 + c * (w + 10) + w, y1: 8 + r * (h + 8) + h });
        }
      }
    }
    return { W, H: H_, sm, cells };
  }

  /** one small plot: title above, axes inside, curve and marks */
  function plotFrame(ctx, cell, title, sub) {
    colText(ctx, title, cell.x0 + 4, cell.y0 + 14, cell.x1 - cell.x0 - 8, 12, 700, P.accent, 1);
    if (sub) colText(ctx, sub, cell.x0 + 4, cell.y0 + 29, cell.x1 - cell.x0 - 8, 10.5, 500, P.muted, 1);
    const box = { x0: cell.x0 + 44, y0: cell.y0 + 38, x1: cell.x1 - 10, y1: cell.y1 - 26 };
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    croundRect(ctx, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 5); ctx.fill(); ctx.stroke();
    BOXES.push({ p: 'g', ...box });
    return box;
  }
  const small = `500 10px`;
  function axisLabels(ctx, box, xl, xr, xUnit, yTop, yUnit, xMid) {
    ctext(ctx, xl, box.x0, box.y1 + 13, { font: `${small} ${P.font}`, color: P.muted, align: 'left' });
    ctext(ctx, xr, box.x1, box.y1 + 13, { font: `${small} ${P.font}`, color: P.muted, align: 'right' });
    if (xMid) ctext(ctx, xMid[0], xMid[1], box.y1 + 13, { font: `${small} ${P.font}`,
                    color: P.muted, align: 'center' });
    ctext(ctx, xUnit, (box.x0 + box.x1) / 2 + (xMid ? 70 : 0), box.y1 + 13,
          { font: `600 10px ${P.font}`, color: P.text, align: 'center' });
    ctext(ctx, yTop, box.x0 - 4, box.y0 + 9, { font: `${small} ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, '0', box.x0 - 4, box.y1, { font: `${small} ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, yUnit, box.x0 - 4, (box.y0 + box.y1) / 2 + 3,
          { font: `600 10px ${P.font}`, color: P.text, align: 'right' });
  }
  function line(ctx, pts, color, w, dash) {
    ctx.strokeStyle = color; ctx.lineWidth = w;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke(); ctx.setLineDash([]);
  }
  const dot = (ctx, x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

  /* one current scale per metal: the most it can give, bluest light, full
   * brightness, collector well positive — so the axes do not jump about */
  const TOPS = {};
  function scaleTop() {
    if (!TOPS[st.metal]) TOPS[st.metal] = nice(current(F_HI, N_HI, V_HI, phi()) * 1.05 * 1e6) / 1e6;
    return TOPS[st.metal];
  }

  let IVcache = null;
  function ivCurve() {
    const key = `${st.metal}|${st.f}|${st.N}`;
    if (IVcache && IVcache.key === key) return IVcache;
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const v = -V_HI + 2 * V_HI * i / 120;
      pts.push({ v, I: current(st.f, st.N, v, phi()) });
    }
    IVcache = { key, pts, Vs: stoppingPotential(st.f, phi()) };
    return IVcache;
  }

  function drawGraphs() {
    const g = GG(), ctx = gv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = TEXTS.filter(q => q.p !== 'g'); BOXES = BOXES.filter(q => q.p !== 'g');
    PAN = 'g';
    const [c1, c2, c3, c4] = g.cells;

    /* 1. current against voltage, both circuits on one axis */
    {
      const iv = ivCurve();
      const top = scaleTop();
      const b = plotFrame(ctx, c1, 'Current against voltage',
        'left of zero the collector is negative, right of zero positive');
      const X = v => b.x0 + (v + V_HI) / (2 * V_HI) * (b.x1 - b.x0);
      const Y = I => b.y1 - I / top * (b.y1 - b.y0);
      ctx.strokeStyle = P.frame; ctx.beginPath(); ctx.moveTo(X(0), b.y0); ctx.lineTo(X(0), b.y1); ctx.stroke();
      line(ctx, iv.pts.map(p => [X(p.v), Y(p.I)]), P.accent, 2.4);
      if (iv.Vs > 0) {
        ctx.strokeStyle = P.text; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(X(-iv.Vs), b.y1); ctx.lineTo(X(-iv.Vs), b.y1 - 16); ctx.stroke();
        ctx.setLineDash([]);
        ctext(ctx, '−Vs', X(-iv.Vs), b.y1 - 20, { font: P.sym(11), color: P.text, align: 'center' });
      }
      dot(ctx, X(Vc()), Y(Inow()), 4.5, P.text);
      axisLabels(ctx, b, `−${V_HI}`, `+${V_HI}`, 'V (collector)', `${fmt(top * 1e6, top * 1e6 < 10 ? 1 : 0)}`, 'μA', ['0', X(0)]);
    }

    /* 2. the greatest kinetic energy against frequency — Millikan */
    {
      const b = plotFrame(ctx, c2, 'Greatest kinetic energy against frequency',
        st.wave ? 'dashed: wave theory — the colour should not matter'
                : 'eVs for each frequency: every metal gives a line of the same slope');
      const fMax = 2.0e15, kTop = 7;
      const X = f => b.x0 + f / fMax * (b.x1 - b.x0);
      const Y = k => b.y1 - k / kTop * (b.y1 - b.y0);
      ctx.save();
      croundRect(ctx, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 5); ctx.clip();
      for (const k of METAL_KEYS) {
        const m = mill(k);
        if (!(m.slope > 0)) continue;
        const cur = k === st.metal;
        line(ctx, [[X(m.fx), Y(0)], [X(fMax), Y(m.slope * fMax + m.icpt)]],
             cur ? P.accent : P.frame, cur ? 2.4 : 1.4);
        if (cur) for (const p of m.pts) dot(ctx, X(p.f), Y(p.KE), 3.2, P.accent);
      }
      const spare = hfEV() - phi();
      if (st.wave) {
        const lvl = Math.max(0, spare);
        line(ctx, [[b.x0, Y(lvl)], [b.x1, Y(lvl)]], P.text, 1.4, [6, 4]);
      }
      ctx.restore();
      dot(ctx, X(st.f), Y(Math.max(0, ivCurve().Vs)), 4.5, P.text);
      axisLabels(ctx, b, '0', '2.0', 'f / 10¹⁵ Hz', `${kTop}`, 'eV');

    }

    /* 3. current against the number of photons */
    {
      const below = !(current(st.f, N_HI, Vc(), phi()) > 0);
      const b = plotFrame(ctx, c3, 'Current against brightness',
        st.wave && below ? 'dashed: the shape wave theory predicts — bright enough should do it'
                         : 'photons arriving each second, at this frequency and voltage');
      const Imax = current(st.f, N_HI, Vc(), phi());
      const top = scaleTop();
      const X = n => b.x0 + n / N_HI * (b.x1 - b.x0);
      const Y = I => b.y1 - I / top * (b.y1 - b.y0);
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const n = N_HI * i / 10;
        pts.push([X(n), Y(current(st.f, n, Vc(), phi()))]);
      }
      line(ctx, pts, P.accent, 2.4);
      if (st.wave && !(Imax > 0)) {
        /* the shape a wave predicts, not a number: more light, more electrons,
         * whatever the colour */
        line(ctx, [[X(0), Y(0)], [X(N_HI), Y(top * 0.6)]], P.text, 1.4, [6, 4]);
      }
      dot(ctx, X(st.N), Y(Inow()), 4.5, P.text);
      axisLabels(ctx, b, '0', '2.0', 'photons / 10¹⁵ s⁻¹', `${fmt(top * 1e6, top * 1e6 < 10 ? 1 : 0)}`, 'μA');
    }

    /* 4. the energies the electrons leave with, counted off the picture */
    {
      const b = plotFrame(ctx, c4, 'The energies the electrons leave with',
        'counted as they leave the plate — the line is the most any can have');
      const kTop = 7, n = st.hist.length;
      const peak = Math.max(1, ...st.hist);
      const bw = (b.x1 - b.x0) / n;
      for (let i = 0; i < n; i++) {
        const h = st.hist[i] / peak * (b.y1 - b.y0 - 6);
        ctx.fillStyle = P.soft || 'rgba(0,95,106,.2)';
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1;
        ctx.fillRect(b.x0 + i * bw + 1, b.y1 - h, bw - 2, h);
        if (h > 0) ctx.strokeRect(b.x0 + i * bw + 1, b.y1 - h, bw - 2, h);
      }
      const spare = hfEV() - phi();
      if (spare > 0) {
        const x = b.x0 + Math.min(spare, kTop) / kTop * (b.x1 - b.x0);
        ctx.strokeStyle = P.text; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y1); ctx.stroke(); ctx.setLineDash([]);
      }
      axisLabels(ctx, b, '0', `${kTop}`, 'kinetic energy / eV', '', 'count');
    }
  }

  /* ---------------------------------------------------------- the numbers */

  function fillReadouts() {
    const nm = C0 / st.f * 1e9;
    const f0 = thresholdFreq(phi());
    const iv = ivCurve();
    const I = Inow();
    const ePerS = I / QE;
    const spare = hfEV() - phi();
    /* a wave's time delay: the energy falling on one atom's worth of area */
    const Pw = st.N * H * st.f, Iw = Pw / (Math.PI * RS * RS);
    const sigma = Math.PI * (1e-10) ** 2;
    const tWave = Iw > 0 ? phi() * QE / (Iw * sigma) : Infinity;
    out.setAll({
      hf: `${fmt(hfEV(), 2)} eV (${neg(sci(H * st.f, 3))} J) · ${fmt(nm, 0)} nm, ${bandName(nm)}`,
      metal: `${METALS[st.metal].name} · ${fmt(phi(), 2)} eV`,
      f0: `${fmt(f0 / 1e15, 3)} × 10¹⁵ Hz — ${fmt(C0 / f0 * 1e9, 0)} nm`,
      fast: st.emitted ? `${fmt(st.fastest, 3)} eV${spare > 0 ? ` — and none can beat hf − φ = ${fmt(spare, 3)} eV` : ''}`
                       : (spare > 0 ? 'none yet' : 'none: every photon is too weak'),
      vs: spare > 0 ? `${fmt(iv.Vs, 3)} V, so the fastest carry ${fmt(iv.Vs, 3)} eV`
                    : 'none — no electrons to stop',
      I: `${fmt(I * 1e6, 3)} μA — ${sci(ePerS, 3)} electrons a second`,
      count: st.emitted ? `${st.emitted} out, ${st.arrived} arrived (${fmt(100 * st.arrived / st.emitted, 1)}%) — `
                          + `the model expects ${fmt(100 * I / Math.max(1e-30, QE * emitted(st.f, st.N, phi())), 1)}%`
                        : 'nothing has come out yet',
      wave: !st.wave ? 'switch on the comparison to see'
        : spare > 0
          ? `a wave would take about ${fmtTime(tWave)} to give one electron enough; the photons do it at once`
          : `a wave would free an electron after about ${fmtTime(tWave)}; with photons this weak, none ever comes`,
    });
  }
  function fmtTime(t) {
    if (!isFinite(t)) return 'forever';
    if (t < 1) return `${fmt(t * 1000, 0)} ms`;
    if (t < 120) return `${fmt(t, 1)} s`;
    if (t < 7200) return `${fmt(t / 60, 1)} minutes`;
    return `${fmt(t / 3600, 1)} hours`;
  }

  const render = () => { drawBench(); drawGraphs(); fillReadouts(); };

  /* -------------------------------------------------------- the animation */

  /** a photon lands: one electron takes it all, or nothing happens */
  function land(ph) {
    if (rnd() >= ETA) { st.flashes.push({ y: ph.ly, age: 0 }); return; }
    const eps = rnd() * BAND;
    const Kev = hfEV() - phi() - eps;
    if (!(Kev > 0)) { st.flashes.push({ y: ph.ly, age: 0 }); return; }
    /* leaves in a random direction out of the surface: equal chance per
     * solid angle, so cos θ is spread evenly between 0 and 1 */
    const c = rnd(), az = rnd() * Math.PI * 2;
    const K = Kev * QE, v = Math.sqrt(2 * K / ME);
    const vn = v * c, vt = v * Math.sqrt(1 - c * c);
    const a = QE * Vc() / (ME * GAP);
    st.emitted++;
    st.fastest = Math.max(st.fastest, Kev);
    const bin = Math.floor(Kev / 7 * st.hist.length);
    if (bin >= 0 && bin < st.hist.length) st.hist[bin]++;
    /* the lit spot is a disc; the drawing shows the up-down part of where it
     * starts and where it drifts */
    const r = RS * Math.sqrt(rnd()), al = rnd() * Math.PI * 2;
    const y0 = r * Math.cos(al), z0 = r * Math.sin(al);
    st.electrons.push({ t: 0, vn, a, y0, z0, vy: vt * Math.cos(az), vz: vt * Math.sin(az) });
  }

  function step(dt) {
    const g = GB();
    /* photons: drawn at a rate that follows the real rate, each one a sample */
    const rate = st.N > 0 ? 4 + 40 * st.N / N_HI : 0;
    st.acc += rate * dt;
    while (st.acc >= 1) {
      st.acc -= 1;
      const r = RS * Math.sqrt(rnd()), al = rnd() * Math.PI * 2;
      const ly = r * Math.cos(al);
      st.photons.push({ u: 0, x0: g.lampX + (rnd() - 0.5) * 6, y0: g.lampY + 8,
                        x1: g.ex, y1: g.cy + ly * g.s, ly });
    }
    const keep = [];
    for (const ph of st.photons) {
      ph.u += dt / 0.55;
      if (ph.u >= 1) land(ph); else keep.push(ph);
    }
    st.photons = keep;
    for (const fl of st.flashes) fl.age += dt;
    st.flashes = st.flashes.filter(f => f.age < 0.3);
    const tp = dt * TSCALE;
    const alive = [];
    for (const e of st.electrons) {
      e.t += tp;
      const xn = e.vn * e.t + 0.5 * e.a * e.t * e.t;
      if (xn <= 0 && e.t > 0) continue;                 // turned back into the emitter
      if (xn >= GAP) {
        const ly = e.y0 + e.vy * e.t, lz = e.z0 + e.vz * e.t;
        if (Math.hypot(ly, lz) < RC) st.arrived++;
        continue;
      }
      alive.push(e);
    }
    st.electrons = alive;
    st.wireDot -= Inow() / (current(st.f, N_HI, V_HI, phi()) || 1e-9) * 60 * dt;
    st.clock += dt;
  }

  let frame = 0;
  const anim = loop(dt => {
    const d = Math.min(dt, 0.05);
    if (d > 0) step(d);
    drawBench(); if ((frame % 3) === 0) drawGraphs();
    if ((frame++ % 8) === 0) fillReadouts();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  function fitAll() {
    P = palette(root);
    const cw = Math.round(bv.el.clientWidth || root.clientWidth || MW);
    const w = clamp(cw > 0 ? cw : MW, 340, MW);
    bv.setLogical(w, benchH(w));
    gv.setLogical(w, w < NARROW ? 900 : 520);
    bv.fit(); gv.fit();
    render();
  }
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = 0;
    const ro = new ResizeObserver(ev => {
      const nw = Math.round(ev[0].contentRect.width);
      if (nw && nw !== lastW) { lastW = nw; fitAll(); }
    });
    ro.observe(root);
    onDestroy(() => ro.disconnect());
  }
  fitAll();

  /* ------------------------------------------------------- test surface */

  return {
    destroy,
    _set: q => {
      Object.assign(st, q);
      sF.set(st.f); sN.set(st.N); sV.set(st.V);
      bSetup[0].setPressed(st.setup === 'reverse'); bSetup[1].setPressed(st.setup === 'forward');
      bMetal.forEach((b, i) => b.setPressed(METAL_KEYS[i] === st.metal));
      bWave.setPressed(st.wave);
      if ('seed' in q) seed = q.seed;
      clearCounts(); IVcache = null; render();
    },
    _run: secs => {
      const n = Math.round(secs * 60);
      for (let i = 0; i < n; i++) step(1 / 60);
      render();
      return { emitted: st.emitted, arrived: st.arrived };
    },
    _state: () => ({ setup: st.setup, metal: st.metal, f: st.f, N: st.N, V: st.V,
                     Vc: Vc(), I: Inow(), emitted: st.emitted, arrived: st.arrived,
                     fastest: st.fastest, hist: st.hist.slice(), phi: phi(),
                     Vs: ivCurve().Vs, f0: thresholdFreq(phi()),
                     inFlight: st.electrons.length, photons: st.photons.length }),
    _current: (f, N, Vc_, ph) => current(f, N, Vc_, ph),
    _Vs: (f, ph) => stoppingPotential(f, ph),
    _mill: k => { const m = mill(k); return { pts: m.pts, slope: m.slope, icpt: m.icpt, f0: m.f0, fx: m.fx }; },
    _f0: ph => thresholdFreq(ph),
    _emitted: (f, N, ph) => emitted(f, N, ph),
    _flight: (K, c, V) => flight(K, c, V),
    _overlap: (L, a, b) => overlapFrac(L, a, b),
    /** many electrons, launched by the same code as the picture, counted headless */
    _mc: n => {
      clearCounts();
      const g = GB();
      for (let i = 0; i < n; i++) {
        land({ ly: 0, x1: g.ex, y1: g.cy });
        /* fly each to the end at once, by the same kinematics */
        const e = st.electrons.pop();
        if (!e) continue;
        const fl = { vn: e.vn, a: e.a };
        let T;
        if (Math.abs(fl.a) < 1e-6) T = GAP / fl.vn;
        else {
          const disc = fl.vn * fl.vn + 2 * fl.a * GAP;
          T = disc < 0 ? null : (-fl.vn + Math.sqrt(disc)) / fl.a;
        }
        if (T == null || !(T > 0)) continue;
        const ly = e.y0 + e.vy * T, lz = e.z0 + e.vz * T;
        if (Math.hypot(ly, lz) < RC) st.arrived++;
      }
      return { emitted: st.emitted, arrived: st.arrived, fastest: st.fastest,
               hist: st.hist.slice() };
    },
    _texts: () => TEXTS.map(q => ({ ...q })),
    _boxes: () => BOXES.map(q => ({ ...q })),
    _geomB: () => ({ W: bv.w, H: bv.h }),
    _consts: () => ({ H, QE, ME, BAND, ETA, GAP, RC, RS, F_LO, F_HI, N_HI, V_HI,
                      METALS, TSCALE }),
  };
}

const TAU_ = Math.PI * 2;
