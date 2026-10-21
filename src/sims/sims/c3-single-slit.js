/* ============================================================================
 * C3-4  Single Slit Diffraction
 * IB Physics C.3 Wave phenomena
 *
 * Three panels, as in C3-3, and the same discipline: each declares the one
 * liberty it takes and takes no others.
 *
 *   THE WAVE      one opening, every point of it a source of a Huygens
 *                 wavelet, the wavelets summed, the result drawn all the way
 *                 to a screen. The wavelength is magnified — by a printed
 *                 factor — because a slit four wavelengths wide cannot be
 *                 drawn if a wavelength is a thousandth of a pixel.
 *   THE ARGUMENT  the half-wavelength pairing that gives sin θ = mλ/b, with
 *                 the two paired waves drawn arriving and cancelling. The
 *                 angle is exaggerated and the true one printed beside it.
 *   THE SCREEN    the pattern at its real positions in millimetres. No
 *                 liberty at all.
 *
 * ---------------------------------------------------------------------------
 * WHY A SINGLE SLIT HAS DARK FRINGES AT ALL
 *
 * This is the part that gets asserted. A slit is one opening — what is there
 * to interfere with what? The answer is the slit with itself. Cut the opening
 * in half. Every point in the top half has a partner exactly b/2 below it, and
 * the path difference between a pair, in a direction θ, is
 *
 *     (b/2) sin θ
 *
 * When that reaches λ/2 the two members of every pair arrive exactly out of
 * step and cancel — and since every point of the slit belongs to a pair, the
 * whole slit cancels. That gives
 *
 *     (b/2) sin θ = λ/2      →      sin θ = λ / b
 *
 * Cut it into four strips instead and pair each strip with its neighbour, and
 * the same argument gives sin θ = 2λ/b; into 2m strips, sin θ = mλ/b. The
 * pairing panel does exactly this, and redraws the strips as you move to a
 * different order, so the argument is watched rather than recited.
 *
 * Note what the condition is NOT: it is a condition for DARKNESS. The most
 * common error in this topic is to write b sin θ = mλ as a maximum, by
 * analogy with the double slit, where it is one.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * Adding the wavelets from a uniformly illuminated opening of width b gives
 *
 *     I(θ) = I₀ sinc²(α),        α = π b sin θ / λ,   sinc x = sin x / x
 *
 * with zeros wherever α is a whole multiple of π, that is b sin θ = mλ, and
 * secondary maxima between them — NOT halfway between, which is the other
 * common slip. They sit where tan α = α, whose roots are 1.4303π, 2.4590π,
 * 3.4707π…, and the simulation finds them by Newton's method rather than
 * quoting them, so the intensities 4.72%, 1.65%, 0.83% come out of the model.
 *
 * The central maximum runs from the first minimum on one side to the first on
 * the other, so it is TWICE as wide as any of the others. That, and its
 * width 2λD/b, are the two results an examiner asks for.
 *
 * As always sin θ = y/√(y² + D²), never y/D, and the readouts compare the
 * exact width with the small-angle one so the approximation is a judgement
 * rather than a formula.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
} from '../sim-kit.js';
import { HuygensField } from '../huygens.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HF = 520, HF_SM = 360;          // the wave panel
const HA = 300, HA_SM = 540;          // the pairing argument
const HB = 366;                       // the screen
const CELL = 2;

const LAM_MIN = 400, LAM_MAX = 700;   // nm
const B_MIN = 0.04, B_MAX = 0.20;     // mm, slit width
const L_MIN = 1.00, L_MAX = 2.50;     // m, slit to screen
const YW = 55;                        // mm of screen shown each side
const NARROW = 720;

/* how wide the slit is drawn, in wavelengths */
const BF_MIN = 2.4, BF_MAX = 7.0;

const sinc = x => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x);

/** relative intensity at a point y (m) on the screen */
export function intensity(y, { lam, b, D }) {
  const s = y / Math.hypot(y, D);
  return sinc(Math.PI * b * s / lam) ** 2;
}

/** the exact position of the m-th minimum, or null if there is none */
export function minimumAt(m, { lam, b, D }) {
  const s = m * lam / b;
  if (Math.abs(s) >= 1) return null;
  return D * s / Math.sqrt(1 - s * s);
}

/**
 * The m-th secondary maximum sits where tan α = α, not halfway between the
 * zeros. Newton from just inside (m + ½)π converges in a handful of steps.
 */
export function sideMaxAlpha(m) {
  let a = (m + 0.5) * Math.PI - 1 / ((m + 0.5) * Math.PI);
  for (let i = 0; i < 60; i++) {
    const t = Math.tan(a);
    const f = t - a, df = t * t;                 // d/da (tan a - a) = sec^2 - 1
    if (Math.abs(df) < 1e-30) break;
    const step = f / df;
    a -= step;
    if (Math.abs(step) < 1e-15) break;
  }
  return a;
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c3-single-slit',
    title: 'Single slit diffraction',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    lamNm: 550, bMm: 0.08, Dm: 1.50,
    yMm: 10.3,
    t: 0, playing: true, avg: false, ann: false, dragging: false,
  };

  const lam = () => st.lamNm * 1e-9;
  const bb  = () => st.bMm * 1e-3;
  const DD  = () => st.Dm;
  const par = () => ({ lam: lam(), b: bb(), D: DD() });

  const yP = () => st.yMm * 1e-3;
  const sinTh = y => y / Math.hypot(y, DD());
  /** path difference across the whole slit, in metres and in wavelengths */
  const spread = () => bb() * sinTh(yP());
  const alphaOf = () => Math.PI * spread() / lam();
  /** the small-angle half-width of the central maximum */
  const halfApprox = () => lam() * DD() / bb();

  function minima() {
    const out = [];
    for (let m = -80; m <= 80; m++) {
      if (m === 0) continue;
      const y = minimumAt(m, par());
      if (y === null || Math.abs(y) > YW * 1e-3) continue;
      out.push({ m, y });
    }
    return out;
  }

  /* ------------------------------------------------------- the wave field */

  const fv = surface(MW, HF, {
    label: 'A plane wave reaching a single slit, the wavelets spreading from it, and the pattern on a screen',
  });
  const field = new HuygensField({ W: MW, H: HF, cell: CELL, maxSources: 22 });
  let profile = [];

  const GF = () => {
    const W = fv.w, sm = W < NARROW, H = sm ? HF_SM : HF;
    return { W, H, sm,
             lamPx: clamp(Math.round(W / 78), 11, 14),
             barX: Math.round(W * 0.115),
             /* the screen sits closer than in the double slit: a single opening
              * throws its first minimum out to twenty degrees or more, and a
              * longer throw would push it off the panel altogether */
             scrX: Math.round(W * 0.72),
             midY: Math.round(H / 2) };
  };

  const bOverLam = () => bb() / lam();
  function bFieldLam() {
    const lo = (B_MIN * 1e-3) / (LAM_MAX * 1e-9);
    const hi = (B_MAX * 1e-3) / (LAM_MIN * 1e-9);
    const t = clamp((bOverLam() - lo) / (hi - lo), 0, 1);
    return BF_MIN + (BF_MAX - BF_MIN) * t;
  }
  const magnification = () => bOverLam() / bFieldLam();

  function syncField() {
    const g = GF();
    field.W = g.W; field.H = g.H; field.lamPx = g.lamPx;
    field.barrierX = g.barX; field.screenX = g.scrX;
    const bpx = bFieldLam() * g.lamPx;
    field.setApertures([{ y: g.midY, half: bpx / 2 }]);
    if (field.compute()) profile = field.screenProfile(2);
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, {
    label: 'The slit divided into strips, and the two waves from one pair of points',
  });
  const bv = surface(MW, HB, {
    label: 'The diffraction pattern on the screen, with its intensity curve',
  });

  const GA = () => {
    const W = av.w, sm = W < NARROW;
    return { W, sm, H: sm ? HA_SM : HA,
             sx: sm ? 62 : 104,
             split: sm ? W - 24 : Math.round(W * 0.44),
             wx0: sm ? 22 : Math.round(W * 0.44) + 16,
             wx1: W - (sm ? 22 : 30),
             wyA: sm ? 358 : 84, wyB: sm ? 458 : 212, wA: sm ? 22 : 27 };
  };
  const GB = () => {
    const W = bv.w, sm = W < NARROW;
    const x0 = sm ? 44 : 70, x1 = W - (sm ? 20 : 44);
    return { W, sm, x0, x1,
             xOf: yMm => x0 + (yMm + YW) / (2 * YW) * (x1 - x0),
             yOf: px => clamp((px - x0) / (x1 - x0) * 2 * YW - YW, -YW, YW) };
  };

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'pr', label: 'Wavelength <i>λ</i>, slit width <i>b</i>, screen distance <i>D</i>' },
    { key: 'm1', label: 'First minimum, sin<i>θ</i> = <i>λ</i>/<i>b</i>' },
    { key: 'cw', label: 'Width of the central maximum, first minimum to first minimum' },
    { key: 'ap', label: 'What 2<i>λD</i>/<i>b</i> gives, and the error in it' },
    { key: 'ow', label: 'Width of every other maximum' },
    { key: 'pd', label: 'Across the slit at P, <i>b</i>&thinsp;sin<i>θ</i>' },
    { key: 'st', label: 'Strips the slit divides into here, and what each pair does' },
    { key: 'ii', label: 'Angle to P, and the intensity there' },
    { key: 'sm', label: 'Secondary maxima, where tan<i>α</i> = <i>α</i>' },
    { key: 'nv', label: 'Dark fringes on this screen' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sLam = slider({ label: '<i>λ</i>', min: LAM_MIN, max: LAM_MAX, step: 5, value: st.lamNm,
    format: v => `${v.toFixed(0)} nm`, onInput: v => { st.lamNm = v; render(); } });
  const sB = slider({ label: '<i>b</i>', min: B_MIN, max: B_MAX, step: 0.005, value: st.bMm,
    format: v => `${v.toFixed(3)} mm`, onInput: v => { st.bMm = v; render(); } });
  const sD = slider({ label: '<i>D</i>', min: L_MIN, max: L_MAX, step: 0.05, value: st.Dm,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.Dm = v; render(); } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAvg = button({ label: 'Time-average — what the screen records', pressed: false,
    onClick: b => { st.avg = !st.avg; b.setAttribute('aria-pressed', String(st.avg)); render(); } });
  const bDark = button({ label: 'Sit on the nearest dark fringe', onClick: () => {
    const ms = minima();
    if (!ms.length) return;
    const best = ms.reduce((a, x) => Math.abs(x.y - yP()) < Math.abs(a.y - yP()) ? x : a);
    st.yMm = best.y * 1e3; render();
  } });
  const bSide = button({ label: '…or the brightest side maximum', onClick: () => {
    const a = sideMaxAlpha(1);
    const s = a / Math.PI * lam() / bb();
    if (Math.abs(s) >= 1) return;
    st.yMm = clamp(DD() * s / Math.sqrt(1 - s * s) * 1e3, -YW, YW);
    render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Single Slit Diffraction',
            'one opening, interfering with itself — and why that gives darkness at sin θ = λ/b'),
    panelBox('The wave itself — every point of the slit is a source, and this is their sum', fv.el),
    panelBox('Why it goes dark — the slit paired against itself, <b>angle exaggerated</b>', av.el),
    panelBox('What is on the screen — this one <b>is</b> to scale; drag to move P', bv.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bAvg.node, bDark.node, bSide.node, bAnn.node])]),
    controls([sLam.node, sB.node, sD.node]),
    out.node,
    note('<b>A slit interferes with itself.</b> Every point of the opening is a source of a new ' +
         'wavelet — that is Huygens’ principle, and the top panel does nothing but add them up. ' +
         'To see why some directions go dark, cut the opening in half: every point in the top ' +
         'half has a partner <i>b</i>/2 below it, and the two travel paths differing by ' +
         '(<i>b</i>/2)&thinsp;sin<i>θ</i>. When that reaches <i>λ</i>/2 the members of every ' +
         'pair arrive exactly out of step, and since every point is in a pair, <b>the whole slit ' +
         'cancels</b>: <b>sin<i>θ</i> = <i>λ</i>/<i>b</i></b>. Cut it into 2<i>m</i> strips ' +
         'instead and the same argument gives <i>b</i>&thinsp;sin<i>θ</i> = <i>mλ</i>. Note what ' +
         'that is: a condition for <b>darkness</b>, not for brightness — writing it as a maximum, ' +
         'by analogy with the double slit, is the single most common error here. The central ' +
         'maximum runs from the first minimum on one side to the first on the other, so it is ' +
         '<b>twice as wide</b> as every other one, and narrowing the slit makes it <b>wider</b>: ' +
         'squeeze the wave and it spreads.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /** the accent colour as "r,g,b", so the field can vary its alpha */
  function hexish(css) {
    const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
    if (m) {
      const v = parseInt(m[1], 16);
      return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
    }
    const r = /rgba?\(([^)]+)\)/.exec(css);
    if (r) return r[1].split(',').slice(0, 3).map(x => Math.round(+x)).join(',');
    return '0,95,106';
  }

  /* ------------------------------------------------------ the wave field */

  function drawF() {
    const ctx = fv.ctx, g = GF(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    field.draw(ctx, st.t * 0.55, hexish(P.accent),
               { mode: st.avg ? 'intensity' : 'wave' });

    const bpx = bFieldLam() * g.lamPx, half = bpx / 2;

    /* the barrier, open only across the slit */
    ctx.fillStyle = P.text;
    ctx.fillRect(g.barX - 4, 0, 8, g.midY - half);
    ctx.fillRect(g.barX - 4, g.midY + half, 8, H - (g.midY + half));
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.barX - 11, g.midY - half); ctx.lineTo(g.barX - 11, g.midY + half);
    ctx.stroke();
    ctext(ctx, `b = ${fmt(bFieldLam(), 1)} λ`, g.barX - 20, g.midY - half - 10,
      { font: P.sym(12), color: P.accent, align: 'right', halo: P.bg, haloWidth: 4 });

    carrow(ctx, 16, 26, 74, 26, { color: P.text, width: 2, head: 8 });
    ctext(ctx, 'plane wave in', 80, 30, { font: `600 11.5px ${P.font}`, color: P.text });

    /* the directions the minima go, straight from sin θ = m λ / b */
    const reach = g.scrX - g.barX;
    for (let m = -6; m <= 6; m++) {
      if (m === 0) continue;
      const s = m * g.lamPx / bpx;
      if (Math.abs(s) > 0.999) continue;
      const y = g.midY + reach * Math.tan(Math.asin(s));
      if (y < 30 || y > H - 46) continue;
      ctx.save();
      ctx.setLineDash([5, 6]); ctx.globalAlpha = 0.6;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(g.barX, g.midY); ctx.lineTo(g.scrX, y); ctx.stroke();
      ctx.restore();
      ctext(ctx, `dark, m = ${m}`, g.scrX - 8, y - 5,
        { font: `600 11px ${P.font}`, color: P.text, align: 'right', halo: P.bg,
          haloWidth: 4 });
    }

    /* the screen and what has arrived on it, growing back towards the screen */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(g.scrX, 6); ctx.lineTo(g.scrX, H - 6); ctx.stroke();
    const px1 = W - 8;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    profile.forEach(([y, I], i) => {
      const x = px1 - I * (px1 - g.scrX);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctext(ctx, 'screen', g.scrX - 8, 20,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right', halo: P.bg, haloWidth: 4 });
    if (!g.sm) {
      ctext(ctx, st.avg ? 'what it records' : 'the wave arriving', W - 8, 20,
        { font: `500 11px ${P.font}`, color: P.muted, align: 'right', halo: P.bg, haloWidth: 4 });
    }

    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = P.bg;
    ctx.fillRect(0, H - 34, g.scrX, 34);
    ctx.restore();
    ctext(ctx, g.sm
            ? `λ magnified ×${fmt(magnification(), 0)} — the slit is really ` +
              `${fmt(bOverLam(), 0)} λ wide, drawn as ${fmt(bFieldLam(), 1)}`
            : `wavelength magnified ×${fmt(magnification(), 0)} so the waves can be seen — the ` +
              `slit is really ${fmt(bOverLam(), 0)} wavelengths wide, drawn as ` +
              `${fmt(bFieldLam(), 1)}`,
      10, H - 21, { font: `500 11px ${P.font}`, color: P.muted });
    ctext(ctx, g.sm
            ? 'narrow the slit and the spread grows'
            : 'Narrow the slit and watch the spread grow — that relation is the whole of ' +
              'diffraction. Contrast is held constant across the panel; the wave really does ' +
              'weaken with distance.',
      10, H - 7, { font: `500 11px ${P.font}`, color: P.muted });
  }

  /* ------------------------------------------- the pairing argument */

  /** how many strips the slit divides into for the nearest dark fringe */
  function stripOrder() {
    const a = Math.abs(spread()) / lam();
    return Math.max(1, Math.round(a) || 1);
  }

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    const sx = g.sx, midY = 130, bpix = 150;
    const top = midY - bpix / 2, bot = midY + bpix / 2;
    const m = stripOrder(), strips = 2 * m;
    const sep = bpix / strips;                 // the pairing separation, b/2m

    /* the angle, exaggerated the same compressive way as in C3-3 */
    const thTrue = Math.asin(clamp(sinTh(yP()), -1, 1));
    const thMax = Math.asin(clamp(YW * 1e-3 / Math.hypot(YW * 1e-3, DD()), -1, 1));
    const TH_DRAW = 30 / DEG;
    const frac = thMax > 1e-9 ? clamp(Math.abs(thTrue) / thMax, 0, 1) : 0;
    const thD = Math.sign(thTrue || 1) * TH_DRAW * Math.pow(frac, 0.45);
    const u = [Math.cos(thD), Math.sin(thD)];

    /* the barrier, and the slit divided into its strips */
    ctx.strokeStyle = P.text; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, 22); ctx.lineTo(sx, top);
    ctx.moveTo(sx, bot); ctx.lineTo(sx, 236);
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
    for (let i = 1; i < strips; i++) {
      const y = top + i * sep;
      ctx.beginPath(); ctx.moveTo(sx - 7, y); ctx.lineTo(sx + 7, y); ctx.stroke();
    }
    ctx.restore();

    /* b, bracketed */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    const bx = sx - 30;
    ctx.beginPath();
    ctx.moveTo(sx - 5, top); ctx.lineTo(bx - 5, top);
    ctx.moveTo(sx - 5, bot); ctx.lineTo(bx - 5, bot);
    ctx.stroke();
    carrow(ctx, bx, top, bx, bot, { color: P.accent, width: 1.2, head: 6 });
    carrow(ctx, bx, bot, bx, top, { color: P.accent, width: 1.2, head: 6 });
    ctx.save();
    ctx.translate(bx - 9, midY); ctx.rotate(-Math.PI / 2);
    ctext(ctx, `b = ${fmt(st.bMm, 3)} mm`, 0, 0,
      { font: P.sym(12), color: P.accent, align: 'center' });
    ctx.restore();

    /* the pairs: a handful of links between a point and its partner */
    const reach = g.split - sx - 86;
    const nLink = 4;
    for (let i = 0; i < nLink; i++) {
      const ya = top + sep * (i + 0.5) / nLink;
      const yb = ya + sep;
      ctx.save();
      ctx.globalAlpha = 0.55; ctx.strokeStyle = P.accent; ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(sx + 12, ya); ctx.lineTo(sx + 12, yb); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.accent;
      for (const y of [ya, yb]) { ctx.beginPath(); ctx.arc(sx, y, 2.4, 0, TAU); ctx.fill(); }
    }

    /* one pair, drawn out: two parallel rays and the path difference */
    const pa = [sx, top + sep * 0.5], pb = [sx, top + sep * 1.5];
    for (const p of [pa, pb]) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + u[0] * reach, p[1] + u[1] * reach);
      ctx.stroke();
    }
    carrow(ctx, pa[0] + u[0] * (reach - 28), pa[1] + u[1] * (reach - 28),
           pa[0] + u[0] * reach, pa[1] + u[1] * reach,
      { color: P.accent, width: 2.2, head: 9 });
    ctext(ctx, 'to P', pa[0] + u[0] * reach + 8, pa[1] + u[1] * reach + 4,
      { font: `600 12px ${P.font}`, color: P.accent });

    const near = thD >= 0 ? pa : pb, far = thD >= 0 ? pb : pa;
    const proj = (far[0] - near[0]) * u[0] + (far[1] - near[1]) * u[1];
    const foot = [near[0] + u[0] * proj, near[1] + u[1] * proj];
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(far[0], far[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(near[0], near[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();

    const pairDelta = Math.abs(spread()) / strips / lam();      // in wavelengths
    ctext(ctx, `(b/${strips}) sin θ = ${fmt(pairDelta, 2)} λ`,
      (near[0] + foot[0]) / 2 + 8, (near[1] + foot[1]) / 2 - 14,
      { font: P.sym(12.5), color: P.text, halo: P.bg, haloWidth: 4 });

    ctext(ctx, `${strips} strips — each point paired with the one b/${strips} below it`,
      sx - 34, 254, { font: `500 11px ${P.font}`, color: P.muted });
    ctext(ctx, `the angle is drawn far larger than it is — the true θ here is ` +
               `${fmt(thTrue * DEG, 3)}°`,
      sx - 34, g.sm ? 268 : 282, { font: `500 11px ${P.font}`, color: P.muted });

    if (g.sm) {
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(14, 290); ctx.lineTo(W - 14, 290); ctx.stroke();
    }
    drawWaves(ctx, g, pairDelta);

    if (st.ann) {
      callout(ctx, ['Every point of the top strip has a partner',
                    'in the next one down. When their paths differ',
                    'by half a wavelength, the pair cancels —',
                    'and every point is in a pair.'],
        g.split - 340, 16, foot[0], foot[1], { palette: P });
    }
  }

  function drawWaves(ctx, g, pairDelta) {
    const x0 = g.wx0, x1 = g.wx1;
    const ph = st.playing ? TAU * 0.35 * st.t : 0;
    const off = TAU * pairDelta;
    const A = g.wA, yA = g.wyA, yB = g.wyB;

    const axis = (y, text, topGap) => {
      ctx.save();
      ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.35; ctx.strokeStyle = P.muted;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.restore();
      ctext(ctx, text, x0, y - topGap - 12, { font: `600 11.5px ${P.font}`, color: P.muted });
    };
    const wave = (y, amp, phase, color, width, alpha, dash) => {
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let px = x0; px <= x1; px += 2) {
        const k = (px - x0) / 44;
        const yy = y - amp * Math.sin(TAU * k - ph - phase);
        px === x0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
      }
      ctx.stroke(); ctx.restore();
    };

    axis(yA, 'the waves from one pair of points', A);
    wave(yA, A, 0, P.accent, 2.4, 1);
    wave(yA, A, off, P.text, 2.2, 0.85, [7, 5]);

    axis(yB, 'their sum', 2 * A);
    const res = 2 * Math.abs(Math.cos(Math.PI * pairDelta));
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.globalAlpha = 0.4; ctx.strokeStyle = P.accent;
    ctx.lineWidth = 1.2;
    for (const s of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(x0, yB - s * 2 * A); ctx.lineTo(x1, yB - s * 2 * A);
      ctx.stroke();
    }
    ctx.restore();
    wave(yB, res * A, TAU * pairDelta / 2, P.accent, 3, 1, null);

    const mx = x1 - 22;
    carrow(ctx, mx, yB, mx, yB - res * A, { color: P.accent, width: 1.2, head: 6, min: 4 });
    ctext(ctx, res < 0.05 ? 'nothing — every pair cancels, so the slit goes dark'
                          : `${fmt(res, 2)} A  of a possible 2 A`,
      x1, yB + 2 * A + 20,
      { font: `600 11.5px ${P.font}`, color: res < 0.05 ? P.accent : P.text, align: 'right' });

    const near = Math.abs(pairDelta - 0.5) < 0.02;
    ctext(ctx, `${fmt(pairDelta, 2)} λ apart: ` +
               (near ? 'exactly out of step — this is a dark fringe'
                     : pairDelta < 0.02 ? 'in step — the middle of the pattern'
                     : 'partly out of step'),
      x0, yA - A - 34, { font: `600 12px ${P.font}`, color: P.accent });
  }

  /* ----------------------------------------------------- the screen */

  function drawB() {
    const ctx = bv.ctx, g = GB(), W = g.W;
    ctx.clearRect(0, 0, W, HB);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HB);

    const p = par();
    const STRIP_T = 28, STRIP_B = 84;
    const PLOT_T = 96, PLOT_B = 286;
    const AX = 296;
    const rgb = hexish(P.accent);

    for (let px = g.x0; px <= g.x1; px++) {
      const I = intensity(g.yOf(px) * 1e-3, p);
      ctx.fillStyle = `rgba(${rgb},${(0.06 + 0.94 * I).toFixed(3)})`;
      ctx.fillRect(px, STRIP_T, 1, STRIP_B - STRIP_T);
    }
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, STRIP_T + 0.5, g.x1 - g.x0, STRIP_B - STRIP_T);

    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, AX); ctx.lineTo(g.x1, AX); ctx.stroke();
    const stepMm = g.sm ? 20 : 10;
    for (let v = -YW + 5; v <= YW; v += stepMm) {
      const px = g.xOf(v);
      ctx.beginPath(); ctx.moveTo(px, AX); ctx.lineTo(px, AX + 5); ctx.stroke();
      ctext(ctx, String(Math.round(v)), px, AX + 14,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, 'position on the screen / mm', g.x1, AX + 40,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    const IY = I => PLOT_B - I * (PLOT_B - PLOT_T);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, PLOT_T + 0.5, g.x1 - g.x0, PLOT_B - PLOT_T);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let px = g.x0; px <= g.x1; px++) {
      const I = intensity(g.yOf(px) * 1e-3, p);
      px === g.x0 ? ctx.moveTo(px, IY(I)) : ctx.lineTo(px, IY(I));
    }
    ctx.stroke();
    ctext(ctx, 'intensity', g.x0 + 6, PLOT_T + 14,
      { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the minima, numbered */
    const ms = minima();
    const dense = ms.length > 20;
    for (const { m, y } of ms) {
      const px = g.xOf(y * 1e3);
      ctx.save();
      ctx.setLineDash([3, 4]); ctx.globalAlpha = 0.4; ctx.strokeStyle = P.text;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, PLOT_T); ctx.lineTo(px, PLOT_B); ctx.stroke();
      ctx.restore();
      if (dense && Math.abs(m) % 5 !== 0) continue;
      ctext(ctx, String(m), px, STRIP_T - 7,
        { font: `600 10.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
    }

    /* the central maximum, bracketed — twice as wide as any other */
    const first = ms.filter(x => x.m === 1)[0], second = ms.filter(x => x.m === 2)[0];
    if (first) {
      const a = g.xOf(-first.y * 1e3), b2 = g.xOf(first.y * 1e3), sy = AX + 38;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a, sy - 6); ctx.lineTo(a, sy + 6);
      ctx.moveTo(b2, sy - 6); ctx.lineTo(b2, sy + 6);
      ctx.stroke();
      carrow(ctx, a, sy, b2, sy, { color: P.accent, width: 1.2, head: 6, min: 4 });
      carrow(ctx, b2, sy, a, sy, { color: P.accent, width: 1.2, head: 6, min: 4 });
      ctext(ctx, `central maximum, ${fmt(2 * first.y * 1e3, 2)} mm`, (a + b2) / 2, sy - 10,
        { font: P.sym(12), color: P.accent, align: 'center', halo: P.bg });
    }
    if (first && second) {
      const a = g.xOf(first.y * 1e3), b2 = g.xOf(second.y * 1e3), sy = AX + 38;
      ctx.save();
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.8;
      carrow(ctx, a, sy, b2, sy, { color: P.text, width: 1.1, head: 5, min: 4 });
      carrow(ctx, b2, sy, a, sy, { color: P.text, width: 1.1, head: 5, min: 4 });
      ctx.restore();
      ctext(ctx, `half that`, (a + b2) / 2, sy - 10,
        { font: `500 11px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
    }

    /* P */
    const pxp = g.xOf(st.yMm);
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pxp, STRIP_T); ctx.lineTo(pxp, AX); ctx.stroke();
    ctx.restore();
    const I = intensity(yP(), p);
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(pxp, IY(I), 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
    ctext(ctx, 'P', pxp + 7, STRIP_B - 6,
      { font: `700 12px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });
  }

  /* ================================================================== *
   * dragging P
   * ================================================================== */

  const fromPointer = e => { st.yMm = GB().yOf(bv.at(e).x); };
  const onDown = e => {
    st.dragging = true; fromPointer(e);
    bv.el.setPointerCapture(e.pointerId); e.preventDefault(); render();
  };
  const onMove = e => {
    if (!st.dragging) { bv.el.style.cursor = 'ew-resize'; return; }
    fromPointer(e); e.preventDefault(); render();
  };
  const onUp = e => {
    if (!st.dragging) return;
    st.dragging = false;
    try { bv.el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  bv.el.addEventListener('pointerdown', onDown);
  bv.el.addEventListener('pointermove', onMove);
  bv.el.addEventListener('pointerup', onUp);
  bv.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    bv.el.removeEventListener('pointerdown', onDown);
    bv.el.removeEventListener('pointermove', onMove);
    bv.el.removeEventListener('pointerup', onUp);
    bv.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) { st.t += Math.min(dt, 0.1); drawF(); drawA(); }
  }

  function render() {
    syncField();
    drawF(); drawA(); drawB();

    const ms = minima(), first = ms.filter(x => x.m === 1)[0];
    const second = ms.filter(x => x.m === 2)[0];
    const strips = 2 * stripOrder();
    const pairDelta = Math.abs(spread()) / strips / lam();
    const s1 = lam() / bb();
    const I = intensity(yP(), par());
    const approx = 2 * halfApprox();
    const sm = [1, 2, 3].map(k => {
      const a = sideMaxAlpha(k);
      return { k, a, I: (Math.sin(a) / a) ** 2 };
    });

    out.setAll({
      pr: `${st.lamNm} nm,  ${fmt(st.bMm, 3)} mm,  ${fmt(st.Dm, 2)} m`,
      m1: s1 >= 1 ? 'none — the slit is narrower than a wavelength'
        : `sin θ = ${fmt(s1, 4)},  θ = ${fmt(Math.asin(s1) * DEG, 3)}°` +
          (first ? `,  y = ${fmt(first.y * 1e3, 3)} mm` : ''),
      cw: first ? `${fmt(2 * first.y * 1e3, 3)} mm` : 'wider than this screen',
      ap: first
        ? `${fmt(approx * 1e3, 3)} mm,  out by ${fmt(Math.abs(2 * first.y - approx) * 1e6, 1)} µm`
        : '—',
      ow: second ? `${fmt((second.y - first.y) * 1e3, 3)} mm — exactly half the central one`
                 : 'needs two minima on the screen',
      pd: `${fmt(Math.abs(spread()) * 1e9, 1)} nm  =  ${fmt(Math.abs(spread()) / lam(), 3)} λ`,
      st: `${strips} strips,  each pair ${fmt(pairDelta, 3)} λ apart — ` +
          (Math.abs(pairDelta - 0.5) < 0.02 ? 'they cancel' : 'they do not quite cancel'),
      ii: `${fmt(Math.asin(clamp(sinTh(yP()), -1, 1)) * DEG, 4)}°,  I/I₀ = ${fmt(I, 4)}`,
      sm: sm.map(x => `${fmt(100 * x.I, 2)}%`).join(',  ') + '  of the centre',
      nv: `${ms.length}`,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(fv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      fv.setLogical(w, w < NARROW ? HF_SM : HF);
      av.setLogical(w, w < NARROW ? HA_SM : HA);
      bv.setLogical(w, HB);
    }
    fv.fit(); av.fit(); bv.fit();
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

  const anim = loop(frame, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      Object.assign(st, p);
      sLam.set(st.lamNm); sB.set(st.bMm); sD.set(st.Dm);
      bAvg.setPressed(st.avg);
      render();
    },
    _state: () => ({
      lamNm: st.lamNm, bMm: st.bMm, Dm: st.Dm, yMm: st.yMm,
      lam: lam(), b: bb(), D: DD(),
      spread: spread(), alpha: alphaOf(), halfApprox: halfApprox(),
      sinTheta: sinTh(yP()), I: intensity(yP(), par()), strips: 2 * stripOrder(),
    }),
    _I: yMm => intensity(yMm * 1e-3, par()),
    _min: m => { const y = minimumAt(m, par()); return y === null ? null : y * 1e3; },
    _minima: () => minima().map(x => ({ m: x.m, yMm: x.y * 1e3 })),
    _sideMax: k => { const a = sideMaxAlpha(k); return { alpha: a, I: (Math.sin(a) / a) ** 2 }; },
    _field: () => field,
    _fieldAt: (x, y) => field.at(x, y),
    _fieldProfile: () => profile,
    _sources: () => field.sources.map(x => [x.y, x.w]),
    _fieldGeom: () => {
      const g = GF();
      return { ...g, bLam: bFieldLam(), bPix: bFieldLam() * g.lamPx,
               magnification: magnification(), bOverLam: bOverLam(),
               sources: field.sources.length };
    },
    _consts: () => {
      const a = GA(), b = GB();
      return { MW, HF, HF_SM, HA, HA_SM, HB, CELL, BF_MIN, BF_MAX,
               LAM_MIN, LAM_MAX, B_MIN, B_MAX, L_MIN, L_MAX, YW,
               W: b.W, sm: b.sm, x0: b.x0, x1: b.x1,
               sx: a.sx, split: a.split, aH: a.H,
               wx0: a.wx0, wx1: a.wx1, wyA: a.wyA, wyB: a.wyB, wA: a.wA };
    },
  };
}
