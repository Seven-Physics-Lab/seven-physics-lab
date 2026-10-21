/* ============================================================================
 * C3-5  The Diffraction Grating
 * IB Physics C.3 Wave phenomena
 *
 * Same three panels, same discipline, and one new idea: N slits instead of two
 * put the maxima in exactly the same places and make them N times sharper.
 * That is the whole reason a grating, and not a double slit, is what you put
 * in a spectrometer.
 *
 *   THE WAVE      N openings, every one a Huygens source, the wavelets summed
 *                 and drawn. The wavelength is magnified by a printed factor.
 *   THE ARGUMENT  the path difference d sin θ between NEIGHBOURING slits, and
 *                 the phasor chain — one arrow per slit, each turned a little
 *                 further than the last. Straight when they all agree, curled
 *                 into a closed circle when the grating goes dark.
 *   THE SPECTRUM  intensity against sin θ, which is the variable the grating
 *                 equation is linear in, so the orders come out evenly spaced.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * Neighbouring slits differ in path by d sin θ, so in phase by
 *
 *     δ = 2π d sin θ / λ
 *
 * Adding N equal arrows each turned δ from the last is a geometric series, and
 * its length gives
 *
 *     I(θ) / I₀ = [ sin(Nδ/2) / (N sin(δ/2)) ]²
 *
 * When δ is a whole number of turns every slit agrees, the arrows lie in a
 * straight line, the amplitude is N and the intensity N² — that is
 *
 *     d sin θ = mλ
 *
 * the same condition as for two slits. What changes is the SHARPNESS. The
 * first zero after a principal maximum comes when the chain of arrows first
 * closes on itself, Nδ/2 = π, which is a phase step of one N-th of a turn, so
 * the peak half-width in sin θ is λ/(Nd). Twenty slits give a peak ten times
 * narrower than two do, and the sim measures that rather than asserting it.
 *
 * RESOLVING POWER
 *
 * Two wavelengths are just resolved when one's peak falls on the other's first
 * zero: mΔλ/d = λ/(Nd), that is
 *
 *     λ/Δλ = mN
 *
 * This is why real gratings have thousands of lines. The sodium doublet needs
 * λ/Δλ = 982; with the twenty slits this simulation can draw you would need
 * order fifty. The readouts work that number out for the grating on screen and
 * for a real one, so "gratings are better" becomes a quantity.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE WAVE PANEL DOES AND DOES NOT SHOW
 *
 * A grating is a far bigger aperture than a single slit, so its beams need a
 * far longer run before they separate. Inside a panel a few dozen wavelengths
 * deep they have not finished forming, and that is the truth about the wave,
 * not a defect of the drawing. So the panel shows the field honestly, marks
 * the directions the orders are heading in, and reads its profile off an arc
 * twenty thousand pixels out — which is what a spectrometer, focused at
 * infinity, actually measures — drawn at the heights those rays point to.
 *
 * Slits above and below the visible strip are still in the sum. A real grating
 * runs past the edge of anything you can look at, and so does this one.
 *
 * One consequence worth noticing. The far-field trace does NOT agree with the
 * N-slit formula plotted underneath it: the high orders come out fainter. That
 * is not an error in either. Huygens–Fresnel carries an obliquity factor
 * (1 + cos χ)/2, so a wavelet does not radiate equally in all directions,
 * while the textbook N-slit factor assumes it does. The wave panel is the more
 * complete of the two; the graph is the one the syllabus asks for. Where they
 * must agree, and do exactly, is on WHERE the orders are.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
} from '../sim-kit.js';
import { spectrumToXYZ, xyzToSRGB, samplesEvery, luminous } from '../colour.js';
import { HuygensField } from '../huygens.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HF = 520, HF_SM = 380;
const HA = 300, HA_SM = 470;
const HC = 372;
const CELL = 2;

const LAM_MIN = 400, LAM_MAX = 700;      // nm
const DL_MAX = 40;                       // nm, the second line's offset
const LPM_MIN = 100, LPM_MAX = 600;      // lines per millimetre
const N_MIN = 2, N_MAX = 20;
const NARROW = 720;

/* The most a slit spacing is ever drawn as, in wavelengths. A grating's lines
 * are only a few wavelengths apart — that is WHY it works — so for most of the
 * range this panel needs no magnification at all and is simply to scale. */
const DF_CAP = 6.0;

/**
 * The N-slit interference factor. Written as the limit when the denominator
 * vanishes, because that is exactly where the principal maxima are and a
 * 0/0 there would punch a hole in every peak.
 */
export function gratingI(sinTh, { lam, d, N }) {
  const half = Math.PI * d * sinTh / lam;            // delta / 2
  const s = Math.sin(half);
  if (Math.abs(s) < 1e-12) return 1;
  const r = Math.sin(N * half) / (N * s);
  return r * r;
}

/** sin θ of the m-th principal maximum, or null if it does not exist */
export function orderSin(m, { lam, d }) {
  const s = m * lam / d;
  return Math.abs(s) > 1 ? null : s;
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c3-grating',
    title: 'The diffraction grating',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    lamNm: 550, dLamNm: 0, lpm: 300, N: 8,
    sP: 0.165,                    // where the probe sits, in sin θ
    white: false,                 // a flat spectrum instead of a line
    t: 0, playing: true, avg: false, ann: false, dragging: false,
  };

  const lam = () => st.lamNm * 1e-9;
  const lam2 = () => (st.lamNm + st.dLamNm) * 1e-9;
  const dd = () => 1e-3 / st.lpm;                    // metres per line
  const par = (l = lam()) => ({ lam: l, d: dd(), N: st.N });

  const dOverLam = () => dd() / lam();
  const maxOrder = () => Math.floor(dOverLam());
  const deltaAt = s => TAU * dd() * s / lam();       // phase step between slits
  /** half-width of a principal maximum, in sin θ */
  const halfWidth = () => lam() / (st.N * dd());

  function orders(l = lam()) {
    const out = [];
    for (let m = -40; m <= 40; m++) {
      const s = orderSin(m, { lam: l, d: dd() });
      if (s === null) continue;
      out.push({ m, s, th: Math.asin(s) });
    }
    return out;
  }

  /* --------------------------------------------------------- white light */

  /*
   * A grating is not usually shown a single wavelength. Point it at a filament
   * lamp and every order but the zeroth opens into a spectrum, because
   * d sin θ = mλ puts each wavelength at its own angle — and by the second
   * order the red of one has reached the blue of the next, which is order
   * overlap, and is why a spectrometer works in the first order.
   *
   * So this panel can be given a flat spectrum instead of a line. The colour
   * of each column is then the real thing: the grating's intensity at that
   * angle, wavelength by wavelength, put through the CIE colour matching
   * functions and out to the screen. Nothing is painted from a rainbow bitmap.
   */
  /* The wavelength sampling has to resolve the structure it is integrating.
   * At order m with N slits a principal maximum is λ/(mN) wide in wavelength,
   * which for the highest orders here is about ten nanometres, so a 5 nm step
   * would alias it into stripes that are not there. Two is comfortable. */
  const WHITE_SAMPLES = samplesEvery(2, 390, 720);
  const COL_GAIN = 1;

  /** the spectrum a grating sends to one angle, as a colour */
  function columnColour(sinTh, gain = COL_GAIN) {
    const xyz = spectrumToXYZ(
      l => gratingI(sinTh, { lam: l * 1e-9, d: dd(), N: st.N }), WHITE_SAMPLES);
    return xyzToSRGB(xyz, { scale: gain });
  }

  /** and how bright the eye would call it */
  function columnLuminance(sinTh) {
    let num = 0, den = 0;
    for (const l of WHITE_SAMPLES) {
      const v = luminous(l);
      num += gratingI(sinTh, { lam: l * 1e-9, d: dd(), N: st.N }) * v;
      den += v;
    }
    return den > 0 ? num / den : 0;
  }

  /** where the first and last visible wavelengths of an order land */
  function orderBand(m) {
    const lo = orderSin(m, { lam: 400e-9, d: dd() });
    const hi = orderSin(m, { lam: 700e-9, d: dd() });
    return lo === null || hi === null ? null : { m, lo, hi };
  }

  /* ------------------------------------------------------- the wave field */

  const fv = surface(MW, HF, {
    label: 'A plane wave reaching a grating of many slits, and the beams it sends out',
  });
  const field = new HuygensField({ W: MW, H: HF, cell: CELL, maxSources: 1 });
  let farProfile = [];

  const GF = () => {
    const W = fv.w, sm = W < NARROW, H = sm ? HF_SM : HF;
    return { W, H, sm,
             lamPx: clamp(Math.round(W / 78), 11, 14),
             barX: Math.round(W * 0.115),
             scrX: Math.round(W * 0.74),
             midY: Math.round(H / 2) };
  };

  /**
   * The drawn spacing is the REAL one wherever it can be — a grating's lines
   * are a handful of wavelengths apart, unlike a double slit's six hundred —
   * and is only compressed when a coarse grating would run off the panel.
   */
  function dFieldLam() { return Math.min(dOverLam(), DF_CAP); }
  const magnification = () => dOverLam() / dFieldLam();
  /* Three bands, because "magnified ×1.0" is a worse thing to print than
   * either of the honest statements either side of it: exactly to scale when
   * nothing is compressed at all, nearly so when the compression is slight
   * (and then the two spacings are quoted rather than a factor), and a plain
   * factor once it is large enough to be worth a number. */
  const toScale = () => dOverLam() <= DF_CAP + 1e-12;
  const nearlyToScale = () => !toScale() && magnification() < 1.25;

  function syncField() {
    const g = GF();
    field.W = g.W; field.H = g.H; field.lamPx = g.lamPx;
    field.barrierX = g.barX; field.screenX = g.scrX;
    const dpx = dFieldLam() * g.lamPx;
    const ap = [];
    for (let j = 0; j < st.N; j++) {
      ap.push({ y: g.midY + (j - (st.N - 1) / 2) * dpx, half: 0 });
    }
    field.setApertures(ap);
    if (field.compute()) farProfile = farField(g);
  }

  /**
   * The angular pattern, read off an arc far enough out that the beams have
   * finished forming — which is what a spectrometer measures — then placed at
   * the heights the order rays point to inside the panel.
   */
  function farField(g) {
    const R = 20000, out = [];
    const reach = g.scrX - g.barX;
    let mx = 0;
    for (let y = 0; y <= g.H; y += 2) {
      const th = Math.atan2(y - g.midY, reach);
      const [re, im] = field.at(g.barX + R * Math.cos(th), g.midY + R * Math.sin(th));
      const I = re * re + im * im;
      if (I > mx) mx = I;
      out.push([y, I]);
    }
    return out.map(([y, I]) => [y, mx > 0 ? I / mx : 0]);
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, {
    label: 'The path difference between neighbouring slits, and the chain of arrows it produces',
  });
  const cv = surface(MW, HC, {
    label: 'The spectrum: intensity against the sine of the diffraction angle',
  });

  const GA = () => {
    const W = av.w, sm = W < NARROW;
    return { W, sm, H: sm ? HA_SM : HA,
             sx: sm ? 60 : 100,
             split: sm ? W - 20 : Math.round(W * 0.44),
             cx0: sm ? 20 : Math.round(W * 0.44) + 20,
             cx1: W - 20,
             cy0: sm ? 250 : 30, cy1: sm ? HA_SM - 26 : HA - 28 };
  };
  const GC = () => {
    const W = cv.w, sm = W < NARROW;
    const x0 = sm ? 40 : 64, x1 = W - (sm ? 18 : 40);
    return { W, sm, x0, x1,
             xOf: s => x0 + (s + 1) / 2 * (x1 - x0),
             sOf: px => clamp((px - x0) / (x1 - x0) * 2 - 1, -1, 1) };
  };

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'li', label: 'The light — and the second line, if there is one' },
    { key: 'gr', label: 'The grating: lines per mm, and the spacing <i>d</i>' },
    { key: 'no', label: 'Orders that exist at all, |<i>m</i>| ≤ <i>d</i>/<i>λ</i>' },
    { key: 'an', label: 'Where they are, <i>d</i>&thinsp;sin<i>θ</i> = <i>mλ</i>' },
    { key: 'pp', label: 'At the probe: sin<i>θ</i>, angle, and what sits there' },
    { key: 'ph', label: 'Phase step between neighbours, <i>δ</i>/2π — and the chain' },
    { key: 'ii', label: 'Intensity there, relative to a principal maximum' },
    { key: 'wd', label: 'Half-width of a principal maximum, <i>λ</i>/<i>Nd</i>' },
    { key: 'rp', label: 'Resolving power: <i>mN</i> you have, <i>λ</i>/Δ<i>λ</i> you need' },
    { key: 'rl', label: 'A real grating, 25 mm of it' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sLam = slider({ label: '<i>λ</i>', min: LAM_MIN, max: LAM_MAX, step: 5, value: st.lamNm,
    format: v => `${v.toFixed(0)} nm`, onInput: v => { st.lamNm = v; render(); } });
  const sDl = slider({ label: 'Δ<i>λ</i>', min: 0, max: DL_MAX, step: 0.5, value: 0,
    format: v => v === 0 ? 'one line only' : `+${v.toFixed(1)} nm`,
    onInput: v => { st.dLamNm = v; render(); } });
  const sLpm = slider({ label: 'lines/mm', word: true, min: LPM_MIN, max: LPM_MAX, step: 10,
    value: st.lpm, format: v => `${v.toFixed(0)}`, onInput: v => { st.lpm = v; render(); } });
  const sN = slider({ label: '<i>N</i>', min: N_MIN, max: N_MAX, step: 1, value: st.N,
    format: v => `${v.toFixed(0)} slits`, onInput: v => { st.N = Math.round(v); render(); } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAvg = button({ label: 'Time-average — what a detector records', pressed: false,
    onClick: b => { st.avg = !st.avg; b.setAttribute('aria-pressed', String(st.avg)); render(); } });
  const bOrd = button({ label: 'Sit on the first order', onClick: () => {
    const s = orderSin(1, { lam: lam(), d: dd() });
    if (s === null) return;
    st.sP = s; render();
  } });
  const bZero = button({ label: '…or on the first zero beside it', onClick: () => {
    const s = orderSin(1, { lam: lam(), d: dd() });
    if (s === null) return;
    st.sP = clamp(s + halfWidth(), -1, 1); render();
  } });
  const bNa = button({ label: 'The sodium doublet, 589.0 and 589.6 nm', onClick: () => {
    st.lamNm = 589; st.dLamNm = 0.5; sLam.set(589); sDl.set(0.5); render();
  } });
  const bWhite = button({ label: 'Shine white light through it', pressed: false, onClick: b => {
    st.white = !st.white;
    b.textContent = st.white ? 'Back to one wavelength' : 'Shine white light through it';
    b.setAttribute('aria-pressed', String(st.white));
    render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('The Diffraction Grating',
            'N slits put the maxima in the same places as two — and make them N times sharper'),
    panelBox('The wave itself — every slit a source, and this is their sum', fv.el),
    panelBox('Why, and why it is sharp — this one is drawn at the true angle', av.el),
    panelBox('The spectrum — intensity against sin<i>θ</i>; drag to move the probe', cv.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bWhite.node, bAvg.node, bOrd.node, bZero.node, bNa.node, bAnn.node])]),
    controls([sLam.node, sDl.node, sLpm.node, sN.node]),
    out.node,
    note('<b>Why a grating and not a double slit.</b> Neighbouring slits differ in path by ' +
         '<i>d</i>&thinsp;sin<i>θ</i>, exactly as for two, so the maxima are in exactly the same ' +
         'places: <b><i>d</i>&thinsp;sin<i>θ</i> = <i>mλ</i></b>. What changes is how sharp they ' +
         'are. Watch the chain of arrows: one per slit, each turned <i>δ</i> further than the ' +
         'last. When every slit agrees they lie straight and the amplitude is <i>N</i>. Turn the ' +
         'probe a little and the chain curls; the moment it closes into a circle the light is ' +
         'gone — and with <i>N</i> arrows that takes only one <i>N</i>-th of a turn each, so the ' +
         'peak is <b><i>N</i> times narrower</b>. That sharpness is the whole point: two ' +
         'wavelengths are just separated when one peak sits on the other’s first zero, which ' +
         'works out as <b><i>λ</i>/Δ<i>λ</i> = <i>mN</i></b>. Press <b>the sodium doublet</b> and ' +
         'the readouts will tell you how far short twenty slits fall, and why a real grating has ' +
         'fifteen thousand. <b>Then shine white light through it.</b> Every order but the zeroth ' +
         'opens into a spectrum, because <i>d</i>&thinsp;sin<i>θ</i> = <i>mλ</i> sends each ' +
         'wavelength somewhere different — violet nearest the middle, red furthest out, which is ' +
         'the opposite way round to a prism. The colours in that strip are not painted on: the ' +
         'spectrum arriving at each angle is computed and then put through the eye\u2019s own ' +
         'response curves. Two things are worth looking for. The zeroth order is white, because ' +
         'there every wavelength is in step and the grating has sorted nothing. And the second ' +
         'and third orders run into each other — the red end of the second reaches further out ' +
         'than the violet start of the third, since 700 × 2 is more than 400 × 3. That is true ' +
         'of <b>every</b> grating, whatever its spacing, and it is why a spectrometer is read in ' +
         'the first order.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

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

  /* --------------------------------------------------- the wave field */

  function drawF() {
    const ctx = fv.ctx, g = GF(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    field.draw(ctx, st.t * 0.55, hexish(P.accent),
               { mode: st.avg ? 'intensity' : 'wave' });

    const dpx = dFieldLam() * g.lamPx;
    const ys = [];
    for (let j = 0; j < st.N; j++) ys.push(g.midY + (j - (st.N - 1) / 2) * dpx);

    /* the barrier, notched wherever a slit falls inside the view */
    ctx.fillStyle = P.text;
    ctx.fillRect(g.barX - 4, 0, 8, H);
    ctx.fillStyle = P.bg;
    let shown = 0;
    for (const y of ys) {
      if (y < -3 || y > H + 3) continue;
      shown++;
      ctx.fillRect(g.barX - 4, y - 2, 8, 4);
    }
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    for (const y of ys) {
      if (y < 0 || y > H) continue;
      ctx.beginPath(); ctx.moveTo(g.barX - 11, y - 2); ctx.lineTo(g.barX - 11, y + 2); ctx.stroke();
    }

    carrow(ctx, 16, 26, 74, 26, { color: P.text, width: 2, head: 8 });
    ctext(ctx, 'plane wave in', 80, 30, { font: `600 11.5px ${P.font}`, color: P.text });

    /* the directions of the orders, from d sin θ = m λ on the DRAWN spacing */
    const reach = g.scrX - g.barX;
    for (let m = -20; m <= 20; m++) {
      const s = m * g.lamPx / dpx;
      if (Math.abs(s) > 0.999) continue;
      const y = g.midY + reach * Math.tan(Math.asin(s));
      if (y < 26 || y > H - 40) continue;
      ctx.save();
      ctx.setLineDash([5, 6]); ctx.globalAlpha = 0.6;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(g.barX, g.midY); ctx.lineTo(g.scrX, y); ctx.stroke();
      ctx.restore();
      ctext(ctx, `m = ${m}`, g.scrX - 8, y - 5,
        { font: `600 11px ${P.font}`, color: P.text, align: 'right', halo: P.bg, haloWidth: 4 });
    }

    /* the far-field profile, on the same headings as those rays */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(g.scrX, 6); ctx.lineTo(g.scrX, H - 6); ctx.stroke();
    const px1 = W - 8;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    farProfile.forEach(([y, I], i) => {
      const x = px1 - I * (px1 - g.scrX);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    if (!g.sm) {
      ctext(ctx, 'measured far away — what a spectrometer sees', px1, 20,
        { font: `500 11px ${P.font}`, color: P.muted, align: 'right', halo: P.bg, haloWidth: 4 });
      ctext(ctx, 'the far orders come out fainter here than the formula below says:',
        px1, H - 50,
        { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right', halo: P.bg, haloWidth: 4 });
      ctext(ctx, 'a wavelet does not radiate equally in every direction',
        px1, H - 37,
        { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right', halo: P.bg, haloWidth: 4 });
    }

    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = P.bg;
    ctx.fillRect(0, H - 34, g.scrX, 34);
    ctx.restore();
    const tail = g.sm ? `${shown} of ${st.N} in view`
                      : `${shown} of the ${st.N} slits fit in view; all ${st.N} are in the sum.`;
    ctext(ctx, toScale()
            ? (g.sm
               ? `to scale — the lines really are ${fmt(dOverLam(), 1)} λ apart. ${tail}`
               : `Drawn to scale — no magnification at all. A grating's lines really are only ` +
                 `${fmt(dOverLam(), 1)} wavelengths apart, which is exactly why it works. ${tail}`)
            : nearlyToScale()
            ? (g.sm
               ? `nearly to scale — ${fmt(dOverLam(), 1)} λ apart, drawn as ` +
                 `${fmt(dFieldLam(), 1)}. ${tail}`
               : `Very nearly to scale: the lines are really ${fmt(dOverLam(), 2)} wavelengths ` +
                 `apart and are drawn ${fmt(dFieldLam(), 2)} apart, to keep the grating on the ` +
                 `panel. ${tail}`)
            : (g.sm
               ? `λ magnified ×${fmt(magnification(), magnification() < 10 ? 1 : 0)} — ${tail}`
               : `Wavelength magnified ×${fmt(magnification(), magnification() < 10 ? 1 : 0)} to ` +
                 `keep this coarse grating on the panel — the lines are really ` +
                 `${fmt(dOverLam(), 1)} wavelengths apart, drawn as ${fmt(dFieldLam(), 1)}. ` +
                 `${tail}`),
      10, H - 21, { font: `500 11px ${P.font}`, color: P.muted });
    ctext(ctx, g.sm
            ? 'the beams need a longer run than this to separate'
            : 'A grating is a big aperture, so its beams need a far longer run than this panel to ' +
              'separate — what you see here is the wave genuinely still sorting itself out.',
      10, H - 7, { font: `500 11px ${P.font}`, color: P.muted });
  }

  /* ------------------------------- the construction and the phasor chain */

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    const sx = g.sx, midY = 128, dpix = 46;
    const nDraw = 5;
    const ys = [];
    for (let j = 0; j < nDraw; j++) ys.push(midY + (j - (nDraw - 1) / 2) * dpix);

    /* No exaggeration here, and none needed: a grating diffracts through tens
     * of degrees, not thousandths of one, so the true angle is drawable. The
     * rays are clipped to the panel instead of being shortened, so their
     * direction stays honest right up to grazing. */
    const thTrue = Math.asin(clamp(st.sP, -1, 1));
    const thD = clamp(thTrue, -80 / DEG, 80 / DEG);
    const u = [Math.cos(thD), Math.sin(thD)];

    /* the grating */
    ctx.strokeStyle = P.text; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, 18); ctx.lineTo(sx, 238);
    ctx.stroke();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 5;
    for (const y of ys) { ctx.beginPath(); ctx.moveTo(sx, y - 2); ctx.lineTo(sx, y + 2); ctx.stroke(); }
    ctx.fillStyle = P.accent;
    for (const y of ys) { ctx.beginPath(); ctx.arc(sx, y, 2.6, 0, TAU); ctx.fill(); }
    ctext(ctx, '…', sx, 14, { font: `700 13px ${P.font}`, color: P.muted, align: 'center' });
    ctext(ctx, '…', sx, 252, { font: `700 13px ${P.font}`, color: P.muted, align: 'center' });

    /* d, between two neighbours */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    const bx = sx - 26;
    ctx.beginPath();
    ctx.moveTo(sx - 5, ys[1]); ctx.lineTo(bx - 5, ys[1]);
    ctx.moveTo(sx - 5, ys[2]); ctx.lineTo(bx - 5, ys[2]);
    ctx.stroke();
    carrow(ctx, bx, ys[1], bx, ys[2], { color: P.accent, width: 1.2, head: 6 });
    carrow(ctx, bx, ys[2], bx, ys[1], { color: P.accent, width: 1.2, head: 6 });
    ctx.save();
    ctx.translate(bx - 9, (ys[1] + ys[2]) / 2); ctx.rotate(-Math.PI / 2);
    ctext(ctx, `d = ${fmt(dd() * 1e6, 2)} µm`, 0, 0,
      { font: P.sym(12), color: P.accent, align: 'center' });
    ctx.restore();

    /* rays from each drawn slit, and the path difference between one pair */
    const reach = 1400;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 8, g.split - 26, (g.sm ? 244 : 262) - 8); ctx.clip();
    for (const y of ys) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + u[0] * reach, y + u[1] * reach);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const arrowT = Math.min(g.split - 60 - sx, 200) / Math.max(u[0], 0.2);
    carrow(ctx, sx + u[0] * (arrowT - 26), ys[0] + u[1] * (arrowT - 26),
           sx + u[0] * arrowT, ys[0] + u[1] * arrowT,
      { color: P.accent, width: 1.8, head: 8 });
    ctx.restore();

    const pa = [sx, ys[1]], pb = [sx, ys[2]];
    const near = thD >= 0 ? pa : pb, far = thD >= 0 ? pb : pa;
    const proj = (far[0] - near[0]) * u[0] + (far[1] - near[1]) * u[1];
    const foot = [near[0] + u[0] * proj, near[1] + u[1] * proj];
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(far[0], far[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(near[0], near[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    const nlam = Math.abs(dd() * st.sP / lam());
    ctext(ctx, `d sin θ = ${fmt(nlam, 3)} λ`,
      (near[0] + foot[0]) / 2 + 8, (near[1] + foot[1]) / 2 - 13,
      { font: P.sym(12.5), color: P.text, halo: P.bg, haloWidth: 4 });

    ctext(ctx, Math.abs(thTrue) <= 80 / DEG
            ? `drawn to scale — θ = ${fmt(thTrue * DEG, 2)}°, and a grating's angles are big ` +
              `enough to draw honestly`
            : `θ = ${fmt(thTrue * DEG, 2)}° — beyond 80° the rays are laid down at 80° so the ` +
              `geometry stays legible`,
      sx - 28, g.sm ? 236 : 276, { font: `500 11px ${P.font}`, color: P.muted });

    drawChain(ctx, g);

    if (st.ann) {
      callout(ctx, ['Every slit is one step further behind',
                    'than the one before it. That is the only',
                    'thing a grating does.'],
        g.split - 330, 16, foot[0], foot[1], { palette: P });
    }
  }

  /**
   * The chain of arrows: one per slit, each turned δ further than the last,
   * laid tip to tail. Straight when the slits agree, a closed circle when the
   * grating goes dark. It is rescaled to its own bounding box every frame, so
   * a chain of two arrows and a chain of twenty are both legible.
   */
  function drawChain(ctx, g) {
    const x0 = g.cx0, x1 = g.cx1, y0 = g.cy0, y1 = g.cy1;
    const d = deltaAt(st.sP);
    const pts = [[0, 0]];
    for (let j = 0; j < st.N; j++) {
      const a = j * d;
      const p = pts[pts.length - 1];
      pts.push([p[0] + Math.cos(a), p[1] + Math.sin(a)]);
    }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pad = 34;
    const sc = Math.min((x1 - x0 - 2 * pad) / Math.max(maxX - minX, 1e-6),
                        (y1 - y0 - 2 * pad) / Math.max(maxY - minY, 1e-6));
    const ox = x0 + pad + ((x1 - x0 - 2 * pad) - (maxX - minX) * sc) / 2 - minX * sc;
    const oy = y0 + pad + ((y1 - y0 - 2 * pad) - (maxY - minY) * sc) / 2 - minY * sc;
    const X = p => ox + p[0] * sc, Y = p => oy + p[1] * sc;

    ctx.save();
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    ctx.restore();

    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let j = 1; j < pts.length; j++) {
      carrow(ctx, X(pts[j - 1]), Y(pts[j - 1]), X(pts[j]), Y(pts[j]),
        { color: P.text, width: 1.8, head: Math.min(8, sc * 0.45), min: 3 });
    }
    /* the resultant: start to finish */
    const last = pts[pts.length - 1];
    carrow(ctx, X(pts[0]), Y(pts[0]), X(last), Y(last),
      { color: P.accent, width: 3, head: 11, min: 3 });
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(X(pts[0]), Y(pts[0]), 3.4, 0, TAU); ctx.fill();

    const res = Math.hypot(last[0], last[1]) / st.N;
    ctext(ctx, `${st.N} arrows, each turned ${fmt((d / TAU) % 1, 3)} of a turn`,
      x0 + 10, y0 + 16, { font: `600 11.5px ${P.font}`, color: P.muted });
    ctext(ctx, res < 0.02 ? 'the chain has closed — no light in this direction'
                          : `resultant ${fmt(res, 3)} of the ${st.N} it could be`,
      x1 - 10, y1 - 10,
      { font: `600 11.5px ${P.font}`, color: res > 0.98 ? P.accent : P.text, align: 'right' });
  }

  /* --------------------------------------------------- the spectrum */

  function drawC() {
    const ctx = cv.ctx, g = GC(), W = g.W;
    ctx.clearRect(0, 0, W, HC);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HC);

    const STRIP_T = 26, STRIP_B = 76;
    const PLOT_T = 92, PLOT_B = 292, AX = 302;
    const IY = I => PLOT_B - I * (PLOT_B - PLOT_T);
    const rgb = hexish(P.accent);
    const two = st.dLamNm > 0.01;

    /**
     * A grating's peaks can be thinner than a pixel, so each column is the
     * LARGEST intensity inside it rather than a single sample at its centre:
     * a spectrum drawn by point-sampling loses whole lines between pixels.
     */
    const SUB = 12;
    const colI = (px, l) => {
      let mx = 0;
      for (let k = 0; k < SUB; k++) {
        const s = g.sOf(px + (k + 0.5) / SUB - 0.5);
        mx = Math.max(mx, gratingI(s, par(l)));
      }
      return mx;
    };

    if (st.white) {
      /* every column is the whole spectrum the grating sends that way, put
       * through the eye — so the orders come out as the spectra they are */
      const STEP = 2;
      for (let px = g.x0; px <= g.x1; px += STEP) {
        ctx.fillStyle = columnColour(g.sOf(px + STEP / 2)).css;
        ctx.fillRect(px, STRIP_T, STEP + 1, STRIP_B - STRIP_T);
      }
    } else {
      for (let px = g.x0; px <= g.x1; px++) {
        const I = Math.max(colI(px, lam()), two ? colI(px, lam2()) : 0);
        ctx.fillStyle = `rgba(${rgb},${(0.05 + 0.95 * I).toFixed(3)})`;
        ctx.fillRect(px, STRIP_T, 1, STRIP_B - STRIP_T);
      }
    }
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, STRIP_T + 0.5, g.x1 - g.x0, STRIP_B - STRIP_T);

    /* a double slit, for comparison, faint — but only when the light is one
     * wavelength, since a monochromatic comparison under white light would be
     * comparing two different things */
    if (!st.white) {
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.45; ctx.strokeStyle = P.text;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let px = g.x0; px <= g.x1; px++) {
      const I = gratingI(g.sOf(px), { lam: lam(), d: dd(), N: 2 });
      px === g.x0 ? ctx.moveTo(px, IY(I)) : ctx.lineTo(px, IY(I));
    }
    ctx.stroke(); ctx.restore();
    ctext(ctx, 'the same slits, only two of them', g.x1 - 6, PLOT_T + 14,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    }

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, PLOT_T + 0.5, g.x1 - g.x0, PLOT_B - PLOT_T);
    const curve = (l, color, width, dash) => {
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let px = g.x0; px <= g.x1; px++) {
        const I = colI(px, l);
        px === g.x0 ? ctx.moveTo(px, IY(I)) : ctx.lineTo(px, IY(I));
      }
      ctx.stroke(); ctx.restore();
    };
    if (st.white) {
      /* in white light the curve is what the eye would call brightness: the
       * grating's intensity weighted by the photopic curve */
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let px = g.x0; px <= g.x1; px++) {
        const I = columnLuminance(g.sOf(px));
        px === g.x0 ? ctx.moveTo(px, IY(I)) : ctx.lineTo(px, IY(I));
      }
      ctx.stroke(); ctx.restore();
      /* and the single wavelength on the dial, so you can find it in the band */
      curve(lam(), P.text, 1.4, [5, 4]);
    } else {
      curve(lam(), P.accent, 2);
      if (two) curve(lam2(), P.text, 1.8, [6, 4]);
    }
    ctext(ctx, st.white ? `brightness in white light — dashed is ${st.lamNm} nm alone`
                        : 'intensity',
      g.x0 + 6, PLOT_T - 6,
      { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the orders */
    const os = orders();
    for (const { m, s, th } of os) {
      const px = g.xOf(s);
      if (px < g.x0 || px > g.x1) continue;
      ctext(ctx, String(m), px, STRIP_T - 7,
        { font: `600 10.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
      if (!g.sm && Math.abs(m) <= 6) {
        ctext(ctx, `${fmt(th * DEG, 1)}°`, px, PLOT_B + 14,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'center', halo: P.bg });
      }
    }

    /* the sin θ axis, with the angles it corresponds to */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, AX); ctx.lineTo(g.x1, AX); ctx.stroke();
    /* seven ticks is one every 130 px on a laptop and one every 50 on a phone,
     * where the labels then sit on top of each other */
    for (const s of (g.sm ? [-1, -0.5, 0, 0.5, 1] : [-1, -0.866, -0.5, 0, 0.5, 0.866, 1])) {
      const px = g.xOf(s);
      ctx.beginPath(); ctx.moveTo(px, AX); ctx.lineTo(px, AX + 5); ctx.stroke();
      ctext(ctx, fmt(s, s === 0 ? 0 : 1), px, AX + 15,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
      ctext(ctx, `${Math.round(Math.asin(clamp(s, -1, 1)) * DEG)}°`, px, AX + 28,
        { font: `500 9.5px ${P.font}`, color: P.muted, align: 'center' });
    }
    if (!g.sm) {
      ctext(ctx, 'sin θ, and the angle it means', g.x1, AX + 28,
        { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    }

    /* the probe */
    const pxp = g.xOf(st.sP);
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pxp, STRIP_T); ctx.lineTo(pxp, AX); ctx.stroke();
    ctx.restore();
    const I = gratingI(st.sP, par());
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(pxp, IY(I), 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
  }

  /* ================================================================== *
   * dragging the probe
   * ================================================================== */

  const fromPointer = e => { st.sP = GC().sOf(cv.at(e).x); };
  const onDown = e => {
    st.dragging = true; fromPointer(e);
    cv.el.setPointerCapture(e.pointerId); e.preventDefault(); render();
  };
  const onMove = e => {
    if (!st.dragging) { cv.el.style.cursor = 'ew-resize'; return; }
    fromPointer(e); e.preventDefault(); render();
  };
  const onUp = e => {
    if (!st.dragging) return;
    st.dragging = false;
    try { cv.el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  cv.el.addEventListener('pointerdown', onDown);
  cv.el.addEventListener('pointermove', onMove);
  cv.el.addEventListener('pointerup', onUp);
  cv.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    cv.el.removeEventListener('pointerdown', onDown);
    cv.el.removeEventListener('pointermove', onMove);
    cv.el.removeEventListener('pointerup', onUp);
    cv.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) { st.t += Math.min(dt, 0.1); drawF(); }
  }

  function render() {
    syncField();
    drawF(); drawA(); drawC();

    const os = orders();
    const nlam = dd() * st.sP / lam();
    const nearest = os.length
      ? os.reduce((a, x) => Math.abs(x.s - st.sP) < Math.abs(a.s - st.sP) ? x : a) : null;
    const I = gratingI(st.sP, par());
    const hw = halfWidth();
    const d = deltaAt(st.sP);
    const res = Math.abs(Math.sin(st.N * d / 2) / (st.N * Math.sin(d / 2) || 1e-30));
    const needR = st.dLamNm > 0.01 ? st.lamNm / st.dLamNm : null;
    const resolvedAt = needR ? Math.ceil(needR / st.N) : null;
    const realN = Math.round(st.lpm * 25);

    /* white light: where each order's band starts and ends, and the fact that
     * the second and third always run into each other */
    const b1 = orderBand(1), b2 = orderBand(2), b3 = orderBand(3);
    out.setAll({
      li: st.white
        ? 'white light — a flat spectrum from 400 to 700 nm, so every order but ' +
          'the zeroth opens into a band'
        : st.dLamNm > 0.01
        ? `${fmt(st.lamNm, 1)} and ${fmt(st.lamNm + st.dLamNm, 1)} nm,  Δλ = ${fmt(st.dLamNm, 1)} nm`
        : `${st.lamNm} nm, a single line`,
      gr: `${st.lpm} lines/mm,  d = ${fmt(dd() * 1e6, 3)} µm = ${fmt(dOverLam(), 2)} λ`,
      no: st.white
        ? `|m| ≤ ${Math.floor(dd() / 400e-9)} for violet but only ` +
          `${Math.floor(dd() / 700e-9)} for red — the long wavelengths run out of ` +
          'room first, so the last order is a stub with no red end'
        : `|m| ≤ ${maxOrder()} — ${2 * maxOrder() + 1} orders in all`,
      an: st.white
        ? (b1 ? `order 1 runs from ${fmt(Math.asin(b1.lo) * DEG, 1)}° at violet to ` +
                `${fmt(Math.asin(b1.hi) * DEG, 1)}° at red` : 'no order 1 — the lines are too far apart') +
          (b2 ? `;  order 2 from ${fmt(Math.asin(b2.lo) * DEG, 1)}° to ` +
                `${fmt(Math.asin(b2.hi) * DEG, 1)}°` : '')
        : os.filter(x => x.m >= 0 && x.m <= 5)
            .map(x => `${x.m}: ${fmt(x.th * DEG, 1)}°`).join(',  '),
      pp: `sin θ = ${fmt(st.sP, 4)},  ${fmt(Math.asin(clamp(st.sP, -1, 1)) * DEG, 2)}°` +
          (nearest && Math.abs(nearest.s - st.sP) < 1e-9 ? `  — order ${nearest.m}` : ''),
      ph: `${fmt(Math.abs(nlam % 1), 3)} of a turn,  resultant ${fmt(res, 3)} of ${st.N}`,
      ii: `${fmt(I, 5)}`,
      wd: `${fmt(hw, 5)} in sin θ — ${st.N} slits, so ${st.N}× narrower than two`,
      rp: needR === null
        ? 'a single line needs none'
        : `mN = ${st.N}m,  need λ/Δλ = ${fmt(needR, 0)} → first resolved at order ` +
          (resolvedAt <= maxOrder() ? `${resolvedAt}` : `${resolvedAt}, which does not exist here`),
      rl: st.white
        ? (b2 && b3
            ? `orders 2 and 3 overlap — the red of the second reaches ` +
              `${fmt(Math.asin(b2.hi) * DEG, 1)}° and the violet of the third starts at ` +
              `${fmt(Math.asin(b3.lo) * DEG, 1)}°. That happens for EVERY grating, because ` +
              `700 × 2 > 400 × 3, and it is why a spectrometer is read in the first order`
            : `${st.lpm} lines/mm × 25 mm = ${realN.toLocaleString()} lines,  ` +
              `R = ${realN.toLocaleString()}m`)
        : `${st.lpm} lines/mm × 25 mm = ${realN.toLocaleString()} lines,  ` +
          `R = ${realN.toLocaleString()}m — that is what a grating buys you`,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(fv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      fv.setLogical(w, w < NARROW ? HF_SM : HF);
      av.setLogical(w, w < NARROW ? HA_SM : HA);
      cv.setLogical(w, HC);
    }
    fv.fit(); av.fit(); cv.fit();
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
      sLam.set(st.lamNm); sDl.set(st.dLamNm); sLpm.set(st.lpm); sN.set(st.N);
      bAvg.setPressed(st.avg);
      render();
    },
    _state: () => ({
      lamNm: st.lamNm, dLamNm: st.dLamNm, lpm: st.lpm, N: st.N, sP: st.sP,
      lam: lam(), d: dd(), dOverLam: dOverLam(), maxOrder: maxOrder(),
      halfWidth: halfWidth(), delta: deltaAt(st.sP), I: gratingI(st.sP, par()),
    }),
    _I: (s, N) => gratingI(s, { lam: lam(), d: dd(), N: N ?? st.N }),
    _Ilam: (s, lamNm) => gratingI(s, { lam: lamNm * 1e-9, d: dd(), N: st.N }),
    _order: m => orderSin(m, { lam: lam(), d: dd() }),
    _orders: () => orders(),
    _field: () => field,
    _fieldAt: (x, y) => field.at(x, y),
    _sources: () => field.sources.map(x => [x.y, x.w]),
    _fieldGeom: () => {
      const g = GF();
      return { ...g, dLam: dFieldLam(), dPix: dFieldLam() * g.lamPx,
               magnification: magnification(), toScale: toScale(),
               nearlyToScale: nearlyToScale(),
               dOverLam: dOverLam(),
               sources: field.sources.length };
    },
    _white: (sinTh) => {
      const xyz = spectrumToXYZ(
        l => gratingI(sinTh, { lam: l * 1e-9, d: dd(), N: st.N }), WHITE_SAMPLES);
      const c = xyzToSRGB(xyz, { scale: 1 });
      return { xyz, css: c.css, rgb: [c.r, c.g, c.b], lum: columnLuminance(sinTh) };
    },
    _band: m => orderBand(m),
    _consts: () => {
      const a = GA(), c = GC();
      return { MW, HF, HF_SM, HA, HA_SM, HC, CELL,
               DF_CAP, LAM_MIN, LAM_MAX, DL_MAX, LPM_MIN, LPM_MAX, N_MIN, N_MAX,
               W: c.W, sm: c.sm, x0: c.x0, x1: c.x1,
               sx: a.sx, split: a.split, aH: a.H,
               cx0: a.cx0, cx1: a.cx1, cy0: a.cy0, cy1: a.cy1 };
    },
  };
}
