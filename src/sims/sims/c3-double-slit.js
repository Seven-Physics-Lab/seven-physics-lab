/* ============================================================================
 * C3-3  Young's Double Slit
 * IB Physics C.3 Wave phenomena
 *
 * Three panels, and they answer different questions.
 *
 * The first is THE WAVE ITSELF. A plane wave arrives at the barrier; every
 * point of every opening becomes a source of a secondary wavelet, by Huygens'
 * principle; the wavelets are summed and the result is drawn, frame by frame,
 * all the way to a screen. Nothing about the fringes is put in by hand — they
 * are what the sum does. A toggle swaps the instantaneous field for its time
 * average, which is what a screen or an eye actually records.
 *
 * The second is WHY, as a construction: the path difference between the two
 * slits, and the two waves it puts out of step, added up in front of you.
 *
 * The third is WHAT YOU SEE: the pattern on the screen at the real positions
 * in millimetres, with the intensity curve lined up underneath it.
 *
 * ---------------------------------------------------------------------------
 * A DIAGRAM THAT CANNOT BE DRAWN TO SCALE, AND SAYS SO
 *
 * D is metres and d is tenths of a millimetre, so the angle to the first
 * fringe is a few thousandths of a radian and the slits are some six hundred
 * wavelengths apart. No figure of this experiment is ever to scale, and one
 * that pretends to be teaches students to read the angle off the page.
 *
 * Each panel therefore declares the one liberty it takes, and takes no others.
 * The WAVE panel magnifies the wavelength — by a factor it prints — so that a
 * wave can be drawn between the slits at all; it leaves b/d exactly alone, so
 * the same orders survive and the same ones are killed, they merely come out
 * at larger angles. The CONSTRUCTION panel exaggerates the angle, prints the
 * true one beside it, and keeps every length and phase honest. The SCREEN
 * panel takes no liberty at all: the fringe positions are in millimetres and
 * a ruler held to it would agree.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * Path difference to a point at angle θ, for slits a distance d apart:
 *
 *     Δ = d sin θ
 *
 * constructive when Δ = mλ, destructive when Δ = (m + ½)λ. Writing the two
 * arriving waves as A sin(ωt) and A sin(ωt − 2πΔ/λ), their sum has amplitude
 *
 *     2A |cos(πΔ/λ)|      so     I = I₀ cos²(π d sin θ / λ)
 *
 * That is the two-slit factor. Real slits have a width b, and each one
 * diffracts on its own, which multiplies the whole pattern by the single-slit
 * envelope
 *
 *     sinc²(π b sin θ / λ),      sinc x = sin x / x
 *
 * so I = I₀ cos²(π d sinθ/λ) · sinc²(π b sinθ/λ). Where the envelope has a
 * zero on top of a two-slit maximum, that order is MISSING — it happens
 * whenever m·b/d is a whole number, so with b = d/3 orders 3, 6, 9 vanish.
 * Slide the slit width and watch them go.
 *
 * WHICH PEAKS ARE MARKED, AND A SMALL HONEST CAVEAT
 *
 * The orders are marked where d sin θ = mλ, because that is what "the m-th
 * maximum" means and it is what an experiment measures. It is not quite where
 * the drawn curve peaks: away from the centre the envelope is falling, so the
 * product of a flat-topped cos² and a falling envelope peaks slightly inside
 * the cos² peak. Measured across the whole slider, that pull is always
 * inward and grows as (b/d)² — a fifth of a millimetre at b = d/2, or about
 * a twentieth of a fringe. Small, real, and worth knowing rather than hiding;
 * the readout says so once the slits are wide enough for it to matter.
 *
 * WHERE THE FRINGES REALLY ARE
 *
 * The familiar s = λD/d is a small-angle result. Exactly,
 *
 *     sin θ_m = mλ/d      and      y_m = D tan θ_m
 *
 * so the fringes are NOT evenly spaced: they spread as you go out. With
 * d = 0.4 mm the error at the tenth order is a few micrometres and nobody
 * cares; with d = 0.1 mm and red light it is over a millimetre and an
 * experiment would see it. The readout gives the exact position, the
 * approximation, and the gap between them, so the approximation stops being
 * a formula and becomes a judgement.
 *
 * Everything here uses sin θ = y/√(y² + D²), never y/D, so the exact answer
 * is what is drawn and the approximation is the thing being compared to it.
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
const HA = 300, HB = 366;
/* the wave-field panel */
const HF = 448, HF_SM = 344;
const CELL = 2;
/* How many wavelengths apart the slits are drawn. The real ratio is between
 * 143 and 1000 — a wave drawn between slits that far apart would be a
 * thousandth of a pixel. So the wavelength is magnified, by a factor that is
 * printed on the panel, and the ratio b/d is left ALONE: the same orders
 * survive and the same ones are killed, they just come out at bigger angles. */
const DF_MIN = 4.5, DF_MAX = 9.0;
/* On a phone there is no room beside the construction, so the two waves go
 * underneath it instead of being dropped: they are the mechanism, and a
 * mobile reader needs them more than a desktop one, not less. */
const HA_SM = 540;

const LAM_MIN = 400, LAM_MAX = 700;      // nm
const D_MIN = 0.10, D_MAX = 0.40;        // mm, slit separation
const L_MIN = 1.00, L_MAX = 2.50;        // m, slit-to-screen
const B_MAX = 0.50;                      // slit width, as a fraction of d
const YW = 35;                           // mm of screen shown each side
const NARROW = 720;

const sinc = x => (Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x);

/* An order counts as killed when the envelope has pushed it below a ten
 * thousandth of the central intensity. Demanding exact zero would be the
 * wrong test: a slider can only land on b = d/3 to the nearest step, and at
 * b/d = 0.3333 the third order still comes out at one part in a hundred
 * million - gone by any physical standard, but not zero to a computer. */
const KILLED = 1e-4;

/** relative intensity at a point y (m) on the screen */
export function intensity(y, { lam, d, D, b }) {
  const s = y / Math.hypot(y, D);                    // sin θ, exactly
  const two = Math.cos(Math.PI * d * s / lam);
  const env = b > 0 ? sinc(Math.PI * b * s / lam) : 1;
  return two * two * env * env;
}

/** the exact position on the screen of the m-th two-slit maximum, or null */
export function maximumAt(m, { lam, d, D }) {
  const s = m * lam / d;
  if (Math.abs(s) >= 1) return null;
  return D * s / Math.sqrt(1 - s * s);               // D tan θ
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c3-double-slit',
    title: 'Young’s double slit',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    lamNm: 550, dMm: 0.20, Dm: 1.50, bRatio: 0,
    yMm: 4.1,                 // where the point P is, mm from the centre
    avg: false,               // show |U|^2 rather than the field at one instant
    t: 0, playing: true, ann: false, dragging: false,
  };

  const lam = () => st.lamNm * 1e-9;
  const dd  = () => st.dMm * 1e-3;
  const DD  = () => st.Dm;
  const bb  = () => st.bRatio * dd();
  const par = () => ({ lam: lam(), d: dd(), D: DD(), b: bb() });

  const yP = () => st.yMm * 1e-3;
  const sinTh = y => y / Math.hypot(y, DD());
  /** path difference at P, in metres and in wavelengths */
  const delta = () => dd() * sinTh(yP());
  const orders = () => delta() / lam();
  /** the small-angle fringe spacing every textbook quotes */
  const sApprox = () => lam() * DD() / dd();

  /** the visible two-slit maxima, with the envelope's verdict on each */
  function maxima() {
    const out = [];
    for (let m = -60; m <= 60; m++) {
      const y = maximumAt(m, par());
      if (y === null || Math.abs(y) > YW * 1e-3) continue;
      const s = y / Math.hypot(y, DD());
      const env = bb() > 0 ? sinc(Math.PI * bb() * s / lam()) ** 2 : 1;
      out.push({ m, y, env, missing: env < KILLED });
    }
    return out;
  }

  /* ------------------------------------------------------- the wave field */

  const fv = surface(MW, HF, {
    label: 'A plane wave reaching two slits, the wavelets spreading from them, and the pattern they build on a screen',
  });
  const field = new HuygensField({ W: MW, H: HF, cell: CELL, maxSources: 20 });
  let profile = [];

  const GF = () => {
    const W = fv.w, sm = W < NARROW, H = sm ? HF_SM : HF;
    return { W, H, sm,
             lamPx: clamp(Math.round(W / 78), 11, 14),
             barX: Math.round(W * 0.115),
             scrX: Math.round(W * 0.875),
             midY: Math.round(H / 2) };
  };

  /** the real slit separation, in wavelengths — between 143 and 1000 */
  const dOverLam = () => dd() / lam();
  /** and what it is drawn as */
  function dFieldLam() {
    const lo = (D_MIN * 1e-3) / (LAM_MAX * 1e-9);
    const hi = (D_MAX * 1e-3) / (LAM_MIN * 1e-9);
    const t = clamp((dOverLam() - lo) / (hi - lo), 0, 1);
    return DF_MIN + (DF_MAX - DF_MIN) * t;
  }
  const magnification = () => dOverLam() / dFieldLam();

  function syncField() {
    const g = GF();
    field.W = g.W; field.H = g.H; field.lamPx = g.lamPx;
    field.barrierX = g.barX; field.screenX = g.scrX;
    const dpx = dFieldLam() * g.lamPx;
    const half = st.bRatio * dpx / 2;
    field.setApertures([{ y: g.midY - dpx / 2, half },
                        { y: g.midY + dpx / 2, half }]);
    if (field.compute()) profile = field.screenProfile(2);
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, { label: 'The path difference between the two slits, and the two waves it produces at P' });
  const bv = surface(MW, HB, { label: 'The fringe pattern on the screen, with its intensity curve' });

  const GA = () => {
    const W = av.w, sm = W < NARROW;
    return { W, sm, H: sm ? HA_SM : HA,
             sx: sm ? 54 : 92,
             split: sm ? W - 24 : Math.round(W * 0.46),
             /* where the two-wave half lives: beside, or beneath */
             wx0: sm ? 22 : Math.round(W * 0.46) + 16,
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
    { key: 'wl', label: 'Wavelength <i>λ</i>, slit separation <i>d</i>, screen distance <i>D</i>' },
    { key: 'sp', label: 'Fringe spacing, <i>s</i> = <i>λD</i>/<i>d</i>' },
    { key: 'pd', label: 'Path difference at P, <i>Δ</i> = <i>d</i>&thinsp;sin<i>θ</i>' },
    { key: 'io', label: 'In wavelengths, and what that makes P' },
    { key: 'an', label: 'Angle to P, and the intensity there' },
    { key: 'ex', label: 'Exact position of the nearest maximum, <i>y</i> = <i>D</i>&thinsp;tan<i>θ</i>' },
    { key: 'ap', label: 'What <i>mλD</i>/<i>d</i> gives, and the error in it' },
    { key: 'sw', label: 'Slit width <i>b</i>' },
    { key: 'ms', label: 'Orders killed by the single-slit envelope' },
    { key: 'nv', label: 'Bright fringes visible on this screen' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sLam = slider({ label: '<i>λ</i>', min: LAM_MIN, max: LAM_MAX, step: 5, value: st.lamNm,
    format: v => `${v.toFixed(0)} nm`, onInput: v => { st.lamNm = v; render(); } });
  const sD = slider({ label: '<i>d</i>', min: D_MIN, max: D_MAX, step: 0.01, value: st.dMm,
    format: v => `${v.toFixed(2)} mm`, onInput: v => { st.dMm = v; render(); } });
  const sL = slider({ label: '<i>D</i>', min: L_MIN, max: L_MAX, step: 0.05, value: st.Dm,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.Dm = v; render(); } });
  const sB = slider({ label: '<i>b</i>', min: 0, max: B_MAX, step: 0.005, value: 0,
    format: v => {
      if (v < 0.0025) return 'ideal, → 0';
      const k = 1 / v;
      const near = Math.round(k);
      const frac = Math.abs(k - near) < 0.04 && near <= 12 ? `  = d/${near}` : '';
      return `${(v * st.dMm).toFixed(3)} mm${frac}`;
    },
    onInput: v => { st.bRatio = v; render(); } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });
  const bAvg = button({ label: 'Time-average — what the screen records', pressed: false,
    onClick: b => {
      st.avg = !st.avg; b.setAttribute('aria-pressed', String(st.avg)); render();
    } });
  const bBright = button({ label: 'Snap P to the nearest bright fringe', onClick: () => {
    const ms = maxima().filter(x => !x.missing);
    if (!ms.length) return;
    const best = ms.reduce((a, x) => Math.abs(x.y - yP()) < Math.abs(a.y - yP()) ? x : a);
    st.yMm = best.y * 1e3; render();
  } });
  const bDark = button({ label: '…or the nearest dark one', onClick: () => {
    /* halfway between two neighbouring maxima, which is where Δ = (m+½)λ */
    const s = 0.5 * lam() / dd();
    const k = Math.round(sinTh(yP()) / (lam() / dd()) - 0.5);
    const sn = (k + 0.5) * lam() / dd();
    if (Math.abs(sn) >= 1) return;
    st.yMm = DD() * sn / Math.sqrt(1 - sn * sn) * 1e3;
    st.yMm = clamp(st.yMm, -YW, YW); render();
  } });
  const bThird = button({ label: 'b = d/3 — kill every third order', onClick: () => {
    st.bRatio = 1 / 3; sB.set(1 / 3); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Young’s Double Slit',
            'the path difference, the two waves it puts out of step, and the pattern that results'),
    panelBox('The wave itself — every point of each slit is a source, and this is their sum', fv.el),
    panelBox('The same thing as a construction — <b>angles exaggerated</b>, everything else exact', av.el),
    panelBox('What is on the screen — this one <b>is</b> to scale; drag to move P', bv.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bAvg.node, bBright.node, bDark.node, bThird.node, bAnn.node])]),
    controls([sLam.node, sD.node, sL.node, sB.node]),
    out.node,
    note('<b>Path difference.</b> The two slits send light to the same point by routes of ' +
         'different length. That difference is <i>Δ</i> = <i>d</i>&thinsp;sin<i>θ</i>, and it is ' +
         'the whole story: when it is a whole number of wavelengths the two waves arrive in step ' +
         'and add, when it is a half-integer they arrive exactly out of step and cancel. Watch ' +
         'the two waves in the top panel go into and out of step as you move P. That gives ' +
         '<i>I</i> = <i>I</i>₀cos²(<i>πd</i>&thinsp;sin<i>θ</i>/<i>λ</i>), and for small angles ' +
         'evenly spaced fringes <b><i>s</i> = <i>λD</i>/<i>d</i></b> — but only for small angles: ' +
         'the exact positions are <i>y</i> = <i>D</i>&thinsp;tan<i>θ</i> with sin<i>θ</i> = ' +
         '<i>mλ</i>/<i>d</i>, so the fringes spread slightly as you go out. Narrow <i>d</i> and ' +
         'the readout will show you an error you could measure. Finally, real slits have a ' +
         '<b>width</b>: each one diffracts on its own, multiplying the pattern by a ' +
         'single-slit envelope, and wherever that envelope has a zero on top of a maximum the ' +
         'order disappears. Press <b>b = d/3</b> and count which ones go.')
  );

  let P = palette(root);

  /* ================================================================== *
   * the wave field: plane wave, slits, wavelets, screen
   * ================================================================== */

  function drawF() {
    const ctx = fv.ctx, g = GF(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    field.draw(ctx, st.t * 0.55, hexish(P.accent),
               { mode: st.avg ? 'intensity' : 'wave' });

    const dpx = dFieldLam() * g.lamPx;
    const half = st.bRatio * dpx / 2;
    const s1 = g.midY - dpx / 2, s2 = g.midY + dpx / 2;

    /* the barrier: opaque everywhere except the two openings */
    ctx.fillStyle = P.text;
    /* an ideal slit has no width at all, so it would leave no gap to see. The
     * bar is notched by a couple of pixels either way so the openings are
     * findable; the sources themselves sit exactly on the slit positions. */
    const gap = Math.max(half, 2.5);
    const segs = [[0, s1 - gap], [s1 + gap, s2 - gap], [s2 + gap, H]];
    for (const [a, b] of segs) if (b > a) ctx.fillRect(g.barX - 4, a, 8, b - a);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    for (const yy of [s1, s2]) {
      ctx.beginPath();
      ctx.moveTo(g.barX - 11, yy - gap); ctx.lineTo(g.barX - 11, yy + gap);
      ctx.stroke();
    }

    /* where the plane wave comes from */
    ctx.save();
    ctx.globalAlpha = 0.9;
    carrow(ctx, 16, 26, 74, 26, { color: P.text, width: 2, head: 8 });
    ctext(ctx, 'plane wave in', 80, 30, { font: `600 11.5px ${P.font}`, color: P.text });
    ctx.restore();

    /* the far-field directions of the orders, as rays from the slits */
    const orders = field.ordersFor(dpx);
    const reach = g.scrX - g.barX;
    for (const o of orders) {
      const tn = Math.tan(o.th);
      const y = g.midY + reach * tn;
      if (y < 10 || y > H - 10) continue;
      ctx.save();
      ctx.setLineDash([5, 6]); ctx.globalAlpha = 0.55;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(g.barX, g.midY); ctx.lineTo(g.scrX, y); ctx.stroke();
      ctx.restore();
      ctext(ctx, `m = ${o.m}`, g.scrX - 8, y - 5,
        { font: `600 11px ${P.font}`, color: P.text, align: 'right', halo: P.bg,
          haloWidth: 4 });
    }

    /* the screen, and the pattern that has arrived on it */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(g.scrX, 6); ctx.lineTo(g.scrX, H - 6); ctx.stroke();
    /* The trace grows LEFTWARDS out of its baseline at the right, so a bright
     * fringe reaches back to the screen at the height the light actually
     * lands on it. Drawn the other way the peaks point away from the very
     * thing they belong to. */
    const px1 = W - 8;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    profile.forEach(([y, I], i) => {
      const x = px1 - I * (px1 - g.scrX);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctext(ctx, 'screen', g.scrX - 8, 20,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right', halo: P.bg,
        haloWidth: 4 });
    if (!g.sm) {
      ctext(ctx, st.avg ? 'what it records' : 'the wave arriving', W - 8, 20,
        { font: `500 11px ${P.font}`, color: P.muted, align: 'right', halo: P.bg,
          haloWidth: 4 });
    }

    /* the one thing that is not to scale, said plainly, on a ground of its own
     * so it is readable over a field of fringes */
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = P.bg;
    ctx.fillRect(0, H - 34, g.scrX, 34);      // never over the screen's own trace
    ctx.restore();
    ctext(ctx, g.sm
            ? `λ magnified ×${fmt(magnification(), 0)} — really ${fmt(dOverLam(), 0)} λ apart, ` +
              `drawn as ${fmt(dFieldLam(), 1)}`
            : `wavelength magnified ×${fmt(magnification(), 0)} so the waves can be seen — ` +
              `the slits are really ${fmt(dOverLam(), 0)} wavelengths apart, drawn as ` +
              `${fmt(dFieldLam(), 1)}`,
      10, H - 21, { font: `500 11px ${P.font}`, color: P.muted });
    ctext(ctx, g.sm
            ? 'b/d unchanged, so the same orders survive'
            : 'b/d is untouched, so the same orders survive and the same ones are killed. ' +
              'Contrast is held constant across the panel; the wave really does weaken with distance.',
      10, H - 7, { font: `500 11px ${P.font}`, color: P.muted });
  }

  /* ================================================================== *
   * panel A — the construction, and the two waves
   * ================================================================== */


  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    /* ---- the construction ---- */
    const sx = g.sx, midY = 130, dpix = 92;
    const s1 = [sx, midY - dpix / 2], s2 = [sx, midY + dpix / 2];

    /* The real angle is milliradians; drawn honestly the two rays would lie
     * on top of each other and there would be no triangle to look at. So it
     * is exaggerated, and the exaggeration is compressive rather than a
     * single factor: a linear blow-up that puts the edge of the screen at a
     * drawable angle leaves the FIRST fringe - the one anybody actually
     * studies - at about a tenth of that, and its triangle four pixels long.
     * A square-root map keeps every angle in the right order and the first
     * fringe visible. Since the factor is then not one number, none is
     * quoted: the true angle is printed instead, which is the number that
     * matters anyway. */
    const thTrue = Math.asin(clamp(sinTh(yP()), -1, 1));
    const thMax = Math.asin(clamp(YW * 1e-3 / Math.hypot(YW * 1e-3, DD()), -1, 1));
    const TH_DRAW = 34 / DEG;
    const frac = thMax > 1e-9 ? clamp(Math.abs(thTrue) / thMax, 0, 1) : 0;
    const thD = Math.sign(thTrue) * TH_DRAW * Math.pow(frac, 0.45);
    const u = [Math.cos(thD), Math.sin(thD)];

    /* the barrier */
    ctx.strokeStyle = P.text; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, 26); ctx.lineTo(sx, s1[1] - 7);
    ctx.moveTo(sx, s1[1] + 7); ctx.lineTo(sx, s2[1] - 7);
    ctx.moveTo(sx, s2[1] + 7); ctx.lineTo(sx, HA - 96);
    ctx.stroke();

    /* d, bracketed */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    const bx = sx - 26;
    ctx.beginPath();
    ctx.moveTo(sx - 4, s1[1]); ctx.lineTo(bx - 5, s1[1]);
    ctx.moveTo(sx - 4, s2[1]); ctx.lineTo(bx - 5, s2[1]);
    ctx.stroke();
    carrow(ctx, bx, s1[1], bx, s2[1], { color: P.accent, width: 1.2, head: 6 });
    carrow(ctx, bx, s2[1], bx, s1[1], { color: P.accent, width: 1.2, head: 6 });
    ctx.save();
    ctx.translate(bx - 9, midY); ctx.rotate(-Math.PI / 2);
    ctext(ctx, `d = ${fmt(st.dMm, 2)} mm`, 0, 0,
      { font: P.sym(12), color: P.accent, align: 'center' });
    ctx.restore();

    /* the two rays, to the far-off point P */
    const reach = g.split - sx - 74;
    for (const s of [s1, s2]) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s[0], s[1]); ctx.lineTo(s[0] + u[0] * reach, s[1] + u[1] * reach);
      ctx.stroke();
    }
    carrow(ctx, s1[0] + u[0] * (reach - 30), s1[1] + u[1] * (reach - 30),
           s1[0] + u[0] * reach, s1[1] + u[1] * reach,
      { color: P.accent, width: 2.2, head: 9 });
    ctext(ctx, 'to P', s1[0] + u[0] * reach + 8, s1[1] + u[1] * reach + 4,
      { font: `600 12px ${P.font}`, color: P.accent });

    /* the path-difference triangle: drop a perpendicular from the far slit
     * onto the near slit's ray; the piece cut off is d sin θ */
    const near = thD >= 0 ? s1 : s2, far = thD >= 0 ? s2 : s1;
    const proj = (far[0] - near[0]) * u[0] + (far[1] - near[1]) * u[1];
    const foot = [near[0] + u[0] * proj, near[1] + u[1] * proj];
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(far[0], far[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(near[0], near[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    const n0 = Math.abs(orders());
    ctext(ctx, `Δ = d sin θ = ${fmt(n0, 2)} λ`,
      (near[0] + foot[0]) / 2 + 4, (near[1] + foot[1]) / 2 - 14,
      { font: P.sym(12.5), color: P.text, halo: P.bg, haloWidth: 4 });

    /* the angle, and the fact that it is not the real one */
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(s1[0], s1[1], 54, Math.min(0, thD), Math.max(0, thD));
    ctx.stroke();
    ctx.restore();
    ctext(ctx, 'θ', s1[0] + 62, s1[1] + Math.sin(thD / 2) * 62 + (thD >= 0 ? 14 : -6),
      { font: P.sym(13), color: P.accent });
    ctext(ctx, `the angle is drawn far larger than it is — the true θ here is ` +
               `${fmt(thTrue * DEG, 3)}°`,
      sx - 30, g.sm ? 258 : 282, { font: `500 11px ${P.font}`, color: P.muted });

    /* ---- the two waves arriving at P, and their sum ---- */
    if (g.sm) {
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(14, 276); ctx.lineTo(W - 14, 276); ctx.stroke();
    }
    drawWaves(ctx, g);

    if (st.ann) {
      callout(ctx, ['The angle on this half is drawn far bigger',
                    'than it is; every length and every phase',
                    'is the real one.'],
        g.split - 320, 18, foot[0], foot[1], { palette: P });
    }
  }

  function drawWaves(ctx, g) {
    const x0 = g.wx0, x1 = g.wx1;
    const ph = st.playing ? TAU * 0.35 * st.t : 0;
    const off = TAU * orders();                     // how far out of step they are
    const A = g.wA;
    const yA = g.wyA, yB = g.wyB;

    const axis = (y, text, top) => {
      ctx.save();
      ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.35; ctx.strokeStyle = P.muted;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.restore();
      ctext(ctx, text, x0, y - top - 12, { font: `600 11.5px ${P.font}`, color: P.muted });
    };
    /* the second wave is dashed: at a whole number of wavelengths the two lie
     * exactly on top of each other, and two solid curves would look like one */
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

    axis(yA, 'the two waves arriving at P', A);
    wave(yA, A, 0, P.accent, 2.4, 1);
    wave(yA, A, off, P.text, 2.2, 0.85, [7, 5]);

    axis(yB, 'their sum', 2 * A);
    const res = 2 * Math.abs(Math.cos(Math.PI * orders()));
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.globalAlpha = 0.4; ctx.strokeStyle = P.accent;
    ctx.lineWidth = 1.2;
    for (const s of [1, -1]) {
      ctx.beginPath(); ctx.moveTo(x0, yB - s * 2 * A); ctx.lineTo(x1, yB - s * 2 * A);
      ctx.stroke();
    }
    ctx.restore();
    wave(yB, res * A, TAU * orders() / 2, P.accent, 3, 1, null);

    /* the amplitude, bracketed against the biggest it could be */
    const mx = x1 - 22;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    carrow(ctx, mx, yB, mx, yB - res * A, { color: P.accent, width: 1.2, head: 6, min: 4 });
    ctext(ctx, res < 0.04 ? 'nothing — they cancel' : `${fmt(res, 2)} A  of a possible 2 A`,
      x1, yB + 2 * A + 20,
      { font: `600 11.5px ${P.font}`, color: res > 1.9 ? P.accent : P.text, align: 'right' });

    const ordr = Math.abs(orders());
    const kind = Math.abs(ordr - Math.round(ordr)) < 0.02 ? 'in step — a bright fringe'
      : Math.abs(Math.abs(ordr - Math.round(ordr)) - 0.5) < 0.02 ? 'exactly out of step — dark'
      : 'partly out of step';
    ctext(ctx, `${fmt(ordr, 2)} λ apart: ${kind}`, x0, yA - A - 34,
      { font: `600 12px ${P.font}`, color: P.accent });
  }

  /* ================================================================== *
   * panel B — the screen
   * ================================================================== */

  function drawB() {
    const ctx = bv.ctx, g = GB(), W = g.W;
    ctx.clearRect(0, 0, W, HB);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HB);

    /* One position axis at the foot, shared by the strip and the curve, so
     * the two are read against the same millimetre scale and no ruler has to
     * be squeezed between them. */
    const p = par();
    const STRIP_T = 28, STRIP_B = 84;
    const PLOT_T = 96, PLOT_B = 286;
    const AX = 296;

    /* the pattern itself, one column of the screen per pixel */
    const rgb = hexish(P.accent);
    for (let px = g.x0; px <= g.x1; px++) {
      const y = g.yOf(px) * 1e-3;
      const I = intensity(y, p);
      ctx.fillStyle = `rgba(${rgb},${(0.06 + 0.94 * I).toFixed(3)})`;
      ctx.fillRect(px, STRIP_T, 1, STRIP_B - STRIP_T);
    }
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, STRIP_T + 0.5, g.x1 - g.x0, STRIP_B - STRIP_T);
    /* the position scale, in millimetres, because this panel is to scale */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, AX); ctx.lineTo(g.x1, AX); ctx.stroke();
    const stepMm = g.sm ? 10 : 5;
    for (let v = -YW; v <= YW + 1e-9; v += stepMm) {
      const px = g.xOf(v);
      ctx.beginPath(); ctx.moveTo(px, AX); ctx.lineTo(px, AX + 5); ctx.stroke();
      ctext(ctx, String(Math.round(v)), px, AX + 14,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, 'position on the screen / mm', g.x1, AX + 40,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* the envelope, when the slits have a width worth drawing */
    const IY = I => PLOT_B - I * (PLOT_B - PLOT_T);
    if (st.bRatio > 0.0025) {
      ctx.save();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let px = g.x0; px <= g.x1; px += 2) {
        const y = g.yOf(px) * 1e-3, s = y / Math.hypot(y, p.D);
        const e = sinc(Math.PI * p.b * s / p.lam) ** 2;
        px === g.x0 ? ctx.moveTo(px, IY(e)) : ctx.lineTo(px, IY(e));
      }
      ctx.stroke(); ctx.restore();
      ctext(ctx, 'single-slit envelope', g.x1 - 6, PLOT_T + 14,
        { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    }

    /* the intensity curve */
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, PLOT_T + 0.5, g.x1 - g.x0, PLOT_B - PLOT_T);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let px = g.x0; px <= g.x1; px++) {
      const I = intensity(g.yOf(px) * 1e-3, p);
      px === g.x0 ? ctx.moveTo(px, IY(I)) : ctx.lineTo(px, IY(I));
    }
    ctx.stroke();
    ctext(ctx, 'intensity', g.x0 + 6, PLOT_T + 14,
      { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the orders, numbered, with the missing ones said to be missing */
    const ms = maxima();
    const dense = ms.length > 26;
    for (const { m, y, missing } of ms) {
      const px = g.xOf(y * 1e3);
      if (missing) {
        ctx.save();
        ctx.strokeStyle = P.text; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(px - 4, PLOT_B - 10); ctx.lineTo(px + 4, PLOT_B - 2);
        ctx.moveTo(px + 4, PLOT_B - 10); ctx.lineTo(px - 4, PLOT_B - 2);
        ctx.stroke(); ctx.restore();
      }
      if (dense && m % 5 !== 0 && !missing) continue;
      ctext(ctx, String(m), px, STRIP_T - 7,
        { font: missing ? `500 10px ${P.font}` : `600 10.5px ${P.font}`,
          color: missing ? P.muted : P.text, align: 'center', halo: P.bg });
    }

    /* the fringe spacing, measured between two neighbours near the centre */
    const near0 = ms.filter(x => x.m === 0), near1 = ms.filter(x => x.m === 1);
    if (near0.length && near1.length) {
      const a = g.xOf(0), b2 = g.xOf(near1[0].y * 1e3), sy = AX + 38;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a, sy - 6); ctx.lineTo(a, sy + 6);
      ctx.moveTo(b2, sy - 6); ctx.lineTo(b2, sy + 6);
      ctx.stroke();
      carrow(ctx, a, sy, b2, sy, { color: P.accent, width: 1.2, head: 6, min: 4 });
      carrow(ctx, b2, sy, a, sy, { color: P.accent, width: 1.2, head: 6, min: 4 });
      ctext(ctx, `s = ${fmt(near1[0].y * 1e3, 3)} mm`, (a + b2) / 2, sy - 10,
        { font: P.sym(12), color: P.accent, align: 'center', halo: P.bg });
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

  /** the accent colour as "r,g,b", so the strip can vary its alpha */
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

    const ms = maxima(), nearest = ms.length
      ? ms.reduce((a, x) => Math.abs(x.y - yP()) < Math.abs(a.y - yP()) ? x : a) : null;
    const ordr = orders();
    const frac = Math.abs(ordr - Math.round(ordr));
    const missing = ms.filter(x => x.missing).map(x => x.m).filter(m => m > 0);
    const approx = nearest ? nearest.m * sApprox() : 0;
    const I = intensity(yP(), par());

    out.setAll({
      wl: `${st.lamNm} nm,  ${fmt(st.dMm, 2)} mm,  ${fmt(st.Dm, 2)} m`,
      sp: `${fmt(sApprox() * 1e3, 3)} mm`,
      pd: `${fmt(delta() * 1e9, 1)} nm`,
      io: `${fmt(ordr, 3)} λ — ` +
          (frac < 0.02 ? 'in step, so bright'
           : Math.abs(frac - 0.5) < 0.02 ? 'exactly out of step, so dark'
           : 'somewhere in between'),
      an: `${fmt(Math.asin(clamp(sinTh(yP()), -1, 1)) * DEG, 4)}°,  I/I₀ = ${fmt(I, 3)}`,
      ex: nearest ? `m = ${nearest.m}:  ${fmt(nearest.y * 1e3, 4)} mm` : '—',
      ap: nearest
        ? `${fmt(approx * 1e3, 4)} mm,  out by ${fmt(Math.abs(nearest.y - approx) * 1e6, 1)} µm`
        : '—',
      sw: st.bRatio < 0.0025 ? 'ideal narrow slits — no envelope'
        : `${fmt(bb() * 1e3, 3)} mm  =  d/${fmt(1 / st.bRatio, 2)}` +
          (st.bRatio > 0.25
            ? ' — wide enough that the envelope pulls each visible peak slightly inward '
              + 'of the order mark'
            : ''),
      ms: st.bRatio < 0.0025 ? 'none — narrow slits kill nothing'
        : missing.length ? `± ${missing.join(', ± ')}  (below 0.01% of the centre)`
                         : 'none within this screen',
      nv: `${ms.filter(x => !x.missing).length} of ${ms.length}`,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(fv.el.clientWidth || av.el.clientWidth || root.clientWidth || MW);
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
      sLam.set(st.lamNm); sD.set(st.dMm); sL.set(st.Dm); sB.set(st.bRatio);
      bAvg.setPressed(st.avg);
      render();
    },
    _state: () => ({
      lamNm: st.lamNm, dMm: st.dMm, Dm: st.Dm, bRatio: st.bRatio, yMm: st.yMm,
      lam: lam(), d: dd(), D: DD(), b: bb(),
      delta: delta(), orders: orders(), sApprox: sApprox(),
      sinTheta: sinTh(yP()), I: intensity(yP(), par()),
    }),
    _I: yMm => intensity(yMm * 1e-3, par()),
    _max: m => { const y = maximumAt(m, par()); return y === null ? null : y * 1e3; },
    _maxima: () => maxima().map(x => ({ m: x.m, yMm: x.y * 1e3, env: x.env, missing: x.missing })),
    _field: () => field,
    _fieldAt: (x, y) => field.at(x, y),
    _fieldProfile: () => profile,
    _sources: () => field.sources.map(x => [x.y, x.w]),
    _fieldGeom: () => {
      const g = GF();
      return { ...g, dLam: dFieldLam(), dPix: dFieldLam() * g.lamPx,
               bRatio: st.bRatio, magnification: magnification(),
               dOverLam: dOverLam(), sources: field.sources.length };
    },
    _consts: () => {
      const a = GA(), b = GB();
      return { MW, HA, HA_SM, HB, HF, HF_SM, CELL, DF_MIN, DF_MAX, KILLED,
               LAM_MIN, LAM_MAX, D_MIN, D_MAX, L_MIN, L_MAX, B_MAX, YW,
               W: b.W, sm: b.sm, x0: b.x0, x1: b.x1,
               sx: a.sx, split: a.split, aH: a.H,
               wx0: a.wx0, wx1: a.wx1, wyA: a.wyA, wyB: a.wyB, wA: a.wA };
    },
  };
}
