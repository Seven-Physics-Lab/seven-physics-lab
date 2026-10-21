/* ============================================================================
 * C3-6  Thin Film Interference
 * IB Physics C.3 Wave phenomena
 *
 * The topic where students lose marks not because the algebra is hard but
 * because the CONDITION FLIPS depending on the three refractive indices, and
 * the rule for when it flips is usually handed over as something to memorise.
 *
 * So this simulation does not contain the rule. It computes the amplitude
 * reflection coefficient at each surface from Fresnel's equations, and the
 * "extra half wavelength on reflection" appears as what it actually is: a
 * MINUS SIGN in front of a number. Whether the film looks bright or dark then
 * follows from the sign of r₁r₂, which the readouts show you.
 *
 *   THE FILM      the two reflected beams, their crests drawn at true spacing,
 *                 with the classic optical-path construction. A thin film is
 *                 a fraction of a wavelength thick, so unlike every other
 *                 diffraction figure THIS ONE IS ENTIRELY TO SCALE — the film,
 *                 the angles, the crests inside it and out.
 *   THE LEDGER    the phase account, line by line: the path inside the film,
 *                 a flip or no flip at each surface, and the total.
 *   THE SPECTRUM  how much is reflected, against wavelength (which is why a
 *                 soap bubble is coloured) or against thickness (which is why
 *                 a wedge shows fringes).
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * Snell through both surfaces, then Fresnel amplitude coefficients
 *
 *     r_s = (n_a cos θ_a − n_b cos θ_b) / (n_a cos θ_a + n_b cos θ_b)
 *     r_p = (n_a cos θ_b − n_b cos θ_a) / (n_a cos θ_b + n_b cos θ_a)
 *
 * computed with COMPLEX cosines, so that total internal reflection — which a
 * glass/air/glass stack reaches past 41° — comes out with |r| = 1 and a phase
 * that is neither 0 nor π, rather than as a special case bolted on.
 *
 * The round trip inside the film costs a phase
 *
 *     β = (2π/λ) · 2 n₂ t cos θ₂
 *
 * and summing every internal bounce (a geometric series) gives the exact
 * reflected amplitude
 *
 *     r = (r₁ + r₂ e^{iβ}) / (1 + r₁ r₂ e^{iβ})
 *
 * with R = |r|², averaged over the two polarisations. The two-beam answer the
 * syllabus uses is the numerator alone; the readouts give both, so the
 * approximation can be seen to be a good one rather than assumed to be.
 *
 * WHERE THE FAMILIAR CONDITIONS COME FROM
 *
 * Two beams give R ≈ r₁² + r₂² + 2r₁r₂ cos β, so
 *
 *     r₁r₂ < 0  (one surface flips)      bright: 2n₂t cos θ₂ = (m + ½)λ
 *     r₁r₂ > 0  (both flip, or neither)  bright: 2n₂t cos θ₂ = mλ
 *
 * A soap film in air has one flip; an anti-reflection coating on glass, where
 * n₁ < n₂ < n₃, has two. That is the whole of it, and the sim states which case
 * you are in from the signs it computed rather than from a table.
 *
 * ONE THING THAT COMES FREE
 *
 * Because cos θ₂ is carried as a complex number all the way through the round
 * trip and not just into the Fresnel coefficients, an air gap between glass
 * past the critical angle behaves properly: wide, it reflects everything;
 * narrow, some light tunnels across it and the reflection drops away. That is
 * FRUSTRATED total internal reflection, and it falls out of the same six lines
 * of arithmetic rather than being added on. Press "air wedge in glass", take
 * the angle past 41°, and slide the thickness down.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
} from '../sim-kit.js';
import {
  spectrumToXYZ, xyzToSRGB, wavelengthCSS, dominantWavelength, samplesEvery,
} from '../colour.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HF = 400, HF_SM = 336;
const HA = 300, HA_SM = 500;
const HC = 340;

const LAM_MIN = 400, LAM_MAX = 700;      // nm
const T_MIN = 60, T_MAX = 900;           // nm, film thickness
const N_MIN = 1.00, N_MAX = 2.60;
const TH_MAX = 70;                       // degrees
const PX_NM = 0.085;                     // pixels per nanometre — everything to scale
const NARROW = 720;

/* Colour. This is the one simulation in the set that draws in real colours,
 * because here colour is not a label for the physics — it is the physics. The
 * chain is spectrum → CIE tristimulus → sRGB, and it lives in ../colour.js.
 *
 * Two declared liberties, both of them about brightness and neither about hue:
 * the spectrum is sampled every 4 nm rather than every 1 nm, which changes
 * nothing visible and makes a whole colour chart affordable; and a film sends
 * back only a few percent of the light, so a swatch of its true luminance
 * would be nearly black. Everything coloured here is therefore brightened by
 * one fixed factor, so that different thicknesses stay comparable with each
 * other, and the true reflected fraction is printed beside it. */
const COL_SAMPLES = samplesEvery(4, 390, 720);
const COL_GAIN = 9;

/* ----------------------------------------------------------- complex */
const cx = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cSub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cMul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cDiv = (a, b) => {
  const q = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q);
};
const cAbs2 = a => a.re * a.re + a.im * a.im;
const cAbs = a => Math.hypot(a.re, a.im);
const cArg = a => Math.atan2(a.im, a.re);
const cExp = t => cx(Math.cos(t), Math.sin(t));

/**
 * cos of the refracted angle in medium b, as a complex number.
 * Past the critical angle the square root turns imaginary, which is exactly
 * how total internal reflection gets into the Fresnel coefficients without
 * being special-cased anywhere.
 */
export function cosIn(nb, sinA) {
  const s2 = (sinA / nb) ** 2;
  return s2 <= 1 ? cx(Math.sqrt(1 - s2), 0) : cx(0, Math.sqrt(s2 - 1));
}

/** the two amplitude reflection coefficients at an interface */
export function fresnelR(na, ca, nb, cb) {
  const A = cx(na * ca.re, na * ca.im), B = cx(nb * cb.re, nb * cb.im);
  const rs = cDiv(cSub(A, B), cAdd(A, B));
  const C = cx(na * cb.re, na * cb.im), D = cx(nb * ca.re, nb * ca.im);
  const rp = cDiv(cSub(C, D), cAdd(C, D));
  return { rs, rp };
}

/**
 * Everything about the stack at one wavelength: the two interface
 * coefficients, the round-trip phase, and the exact and two-beam reflectances.
 */
export function stack({ n1, n2, n3, t, lam, th1 }) {
  const sinA = n1 * Math.sin(th1);               // the invariant, n sin θ
  const c1 = cosIn(n1, sinA), c2 = cosIn(n2, sinA), c3 = cosIn(n3, sinA);
  const top = fresnelR(n1, c1, n2, c2);
  const bot = fresnelR(n2, c2, n3, c3);
  /* The round trip through the film. Past the critical angle at the TOP
   * surface cos θ2 turns imaginary, and then this factor is not a phase at
   * all but an exponential decay — the evanescent wave. Taking only the real
   * part of cos θ2 here (which an earlier version of this file did) makes the
   * factor 1, which makes the two reflections cancel and reports a totally
   * internally reflecting gap as reflecting NOTHING. Carrying the whole
   * complex cosine gives back R = 1 for a thick gap, and, for a thin one,
   * frustrated total internal reflection: some light tunnels across. */
  const K = TAU * 2 * n2 * t / lam;
  const x = K * c2.re, y = K * c2.im;
  const decay = Math.exp(-y);
  const e = cx(decay * Math.cos(x), decay * Math.sin(x));
  /* the propagating optical path, which is zero when nothing propagates */
  const opd = 2 * n2 * t * c2.re;
  const beta = x;
  const out = {};
  for (const pol of ['rs', 'rp']) {
    const r1 = top[pol], r2 = bot[pol];
    const num = cAdd(r1, cMul(r2, e));
    const den = cAdd(cx(1), cMul(cMul(r1, r2), e));
    out[pol] = { r1, r2, exact: cAbs2(cDiv(num, den)), two: cAbs2(num) };
  }
  return {
    c1, c2, c3, opd, beta,
    th2: c2.im === 0 ? Math.acos(clamp(c2.re, -1, 1)) : null,
    r1s: top.rs, r2s: bot.rs, r1p: top.rp, r2p: bot.rp,
    R: (out.rs.exact + out.rp.exact) / 2,
    Rtwo: (out.rs.two + out.rp.two) / 2,
  };
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c3-thin-film',
    title: 'Thin film interference',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    n1: 1.00, n2: 1.33, n3: 1.00,
    tNm: 300, lamNm: 550, thDeg: 25,
    mode: 'lam',                 // the spectrum panel: 'lam' or 'thick'
    t: 0, playing: true, ann: false,
  };

  const lam = () => st.lamNm;                    // nm throughout this sim
  const th1 = () => st.thDeg / DEG;
  const S = (l = lam(), tt = st.tNm) =>
    stack({ n1: st.n1, n2: st.n2, n3: st.n3, t: tt, lam: l, th1: th1() });

  /* ------------------------------------------------------------ colour */

  /** the tristimulus values of the light this film sends back */
  const filmXYZ = (tt = st.tNm) =>
    spectrumToXYZ(l => S(l, tt).R, COL_SAMPLES);
  /** the luminance of the returning light, as a fraction of a perfect mirror */
  const lumOf = (tt = st.tNm) => filmXYZ(tt).Y;
  /** and the colour a screen can make of it */
  const filmColour = (tt = st.tNm, gain = COL_GAIN) =>
    xyzToSRGB(filmXYZ(tt), { scale: gain });

  /* the thickness chart is 350 stack calculations per column, so it is kept
   * until something other than the thickness changes */
  let chartKey = '', chart = [];
  function thicknessChart(n) {
    const key = [st.n1, st.n2, st.n3, st.thDeg, n].join('|');
    if (key === chartKey) return chart;
    chartKey = key;
    chart = [];
    for (let i = 0; i < n; i++) {
      const t = T_MIN + (T_MAX - T_MIN) * i / (n - 1);
      chart.push([t, filmColour(t).css]);
    }
    return chart;
  }

  /** the name of a wavelength, in the words a person would use */
  function hueWord(l) {
    if (l === null) return 'a purple, which is not in the rainbow at all — ' +
                            'the spectrum has been cut from the middle, not the ends';
    if (l < 430) return 'violet';
    if (l < 465) return 'blue-violet';
    if (l < 490) return 'blue';
    if (l < 510) return 'cyan';
    if (l < 535) return 'green';
    if (l < 565) return 'yellow-green';
    if (l < 585) return 'yellow';
    if (l < 600) return 'orange';
    if (l < 625) return 'orange-red';
    return 'red';
  }

  /** the film's colour, said in words as well as shown */
  function colourWords() {
    const xyz = filmXYZ();
    const dom = dominantWavelength(xyz);
    const c = filmColour();
    const lum = xyz.Y;
    if (lum < 2e-4) return 'black — it sends back essentially nothing';
    const sat = Math.hypot(xyz.X / (xyz.X + xyz.Y + xyz.Z) - 1 / 3,
                           xyz.Y / (xyz.X + xyz.Y + xyz.Z) - 1 / 3);
    if (sat < 0.02) return `a neutral grey — every wavelength comes back about equally ` +
                           `(${fmt(100 * lum, 1)}% of the light)`;
    return (dom === null ? hueWord(null)
             : `${hueWord(dom)}, dominant wavelength ${fmt(dom, 0)} nm`) +
           ` — ${c.css}, and ${fmt(100 * lum, 1)}% of the light comes back` +
           (c.gamutLoss > 0.02 ? '. A screen cannot quite reach this colour, so the ' +
            'swatch is a little less saturated than the real thing' : '');
  }

  /* which way each surface flips, read off the sign of r, not off a rule */
  const flipOf = r => {
    const a = cArg(r);
    if (Math.abs(a) < 1e-9) return { turns: 0, word: 'no flip' };
    if (Math.abs(Math.abs(a) - Math.PI) < 1e-9) return { turns: 0.5, word: 'flips by ½λ' };
    return { turns: Math.abs(a) / TAU, word: `flips by ${fmt(Math.abs(a) / TAU, 3)} λ` };
  };

  /* ---------------------------------------------------------- surfaces */

  const fv = surface(MW, HF, {
    label: 'A thin film, the two beams it reflects, and their crests drawn at true spacing',
  });
  const av = surface(MW, HA, { label: 'The phase account, and the two reflected waves added' });
  const cvs = surface(MW, HC, { label: 'How much light the film reflects' });

  const GF = () => {
    const W = fv.w, sm = W < NARROW, H = sm ? HF_SM : HF;
    /* the film sits low in the panel: everything interesting happens in the
     * medium above it, and a 300 nm film is only half a wavelength thick, so
     * it needs very little room of its own */
    return { W, H, sm, ox: Math.round(W * 0.42), yt: H - (sm ? 92 : 108) };
  };
  const GA = () => {
    const W = av.w, sm = W < NARROW;
    return { W, sm, H: sm ? HA_SM : HA,
             lx: 20, lw: sm ? W - 40 : Math.round(W * 0.42),
             wx0: sm ? 22 : Math.round(W * 0.42) + 40, wx1: W - 26,
             wyA: sm ? 330 : 96, wyB: sm ? 428 : 216, wA: sm ? 22 : 27 };
  };
  const GC = () => {
    const W = cvs.w, sm = W < NARROW;
    const x0 = sm ? 44 : 70, x1 = W - (sm ? 18 : 44);
    return { W, sm, x0, x1,
             lo: st.mode === 'lam' ? LAM_MIN : T_MIN,
             hi: st.mode === 'lam' ? LAM_MAX : T_MAX,
             xOf(v) { return x0 + (v - this.lo) / (this.hi - this.lo) * (x1 - x0); } };
  };

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'st', label: 'The stack, top to bottom' },
    { key: 'th', label: 'Film thickness <i>t</i>, and what that is inside the film' },
    { key: 'an', label: 'Angle in, and angle inside the film' },
    { key: 'op', label: 'Optical path for the round trip, 2<i>n</i>₂<i>t</i>&thinsp;cos<i>θ</i>₂' },
    { key: 'r1', label: 'Top surface: <i>r</i>₁, and what it does to the phase' },
    { key: 'r2', label: 'Bottom surface: <i>r</i>₂' },
    { key: 'cd', label: 'So the film is bright when…' },
    { key: 'to', label: 'Total phase difference, and the verdict here' },
    { key: 'rr', label: 'Reflected fraction — every bounce, and the two-beam answer' },
    { key: 'be', label: 'Most strongly reflected wavelength at this thickness' },
    { key: 'cl', label: 'And so, in white light, the film looks…' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sN2 = slider({ label: '<i>n</i>₂', min: N_MIN, max: N_MAX, step: 0.01, value: st.n2,
    format: v => v.toFixed(2), onInput: v => { st.n2 = v; render(); } });
  const sT = slider({ label: '<i>t</i>', min: T_MIN, max: T_MAX, step: 5, value: st.tNm,
    format: v => `${v.toFixed(0)} nm`, onInput: v => { st.tNm = v; render(); } });
  const sLam = slider({ label: '<i>λ</i>', min: LAM_MIN, max: LAM_MAX, step: 5, value: st.lamNm,
    format: v => `${v.toFixed(0)} nm`, onInput: v => { st.lamNm = v; render(); } });
  const sTh = slider({ label: '<i>θ</i>₁', min: 0, max: TH_MAX, step: 1, value: st.thDeg,
    format: v => `${v.toFixed(0)}°`, onInput: v => { st.thDeg = v; render(); } });

  const preset = (a, b, c, label) => button({ label, onClick: () => {
    st.n1 = a; st.n2 = b; st.n3 = c; sN2.set(b); render();
  } });
  const presets = [
    preset(1.00, 1.33, 1.00, 'soap film in air'),
    preset(1.00, 1.47, 1.33, 'oil on water'),
    preset(1.00, 1.38, 1.52, 'coating on glass'),
    preset(1.52, 1.00, 1.52, 'air wedge in glass'),
  ];

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bQw = button({ label: 'Make it a quarter-wave coating', onClick: () => {
    const c2 = cosIn(st.n2, st.n1 * Math.sin(th1()));
    const t = lam() / (4 * st.n2 * Math.max(c2.re, 1e-6));
    st.tNm = clamp(Math.round(t / 5) * 5, T_MIN, T_MAX); sT.set(st.tNm); render();
  } });
  const bMode = button({ label: 'Against thickness instead', pressed: false, onClick: b => {
    st.mode = st.mode === 'lam' ? 'thick' : 'lam';
    b.textContent = st.mode === 'lam' ? 'Against thickness instead' : 'Against wavelength instead';
    b.setAttribute('aria-pressed', String(st.mode === 'thick'));
    render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Thin Film Interference',
            'two reflections, one of them possibly flipped — and this figure is entirely to scale'),
    controls([el('div', { class: 'ibs-btns' }, presets.map(p => p.node))], { label: 'try:' }),
    panelBox('The film and the two beams it sends back — <b>to scale</b>, film, angles and crests',
             fv.el),
    panelBox('The phase account, and the two reflected waves added', av.el),
    panelBox('How much comes back', cvs.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bQw.node, bMode.node, bAnn.node])]),
    controls([sN2.node, sT.node, sLam.node, sTh.node]),
    out.node,
    note('<b>The half-wavelength on reflection.</b> Light reflecting off a medium of <i>higher</i> ' +
         'refractive index comes back with its phase turned by half a wavelength; off a lower one ' +
         'it does not. That is not a rule to memorise here — it is the <b>sign of the reflection ' +
         'coefficient</b>, which this simulation computes from Fresnel’s equations and shows you ' +
         'in the readouts. Everything else follows. With <b>one</b> flip (a soap film in air, ' +
         'where <i>n</i>₂ is bigger than both its neighbours) the film is bright when ' +
         '2<i>n</i>₂<i>t</i>&thinsp;cos<i>θ</i>₂ = (<i>m</i>+½)<i>λ</i>. With <b>two</b> flips, or ' +
         'none — an anti-reflection coating, where <i>n</i>₁ < <i>n</i>₂ < <i>n</i>₃ — the two ' +
         'conditions swap over and it is bright at <i>mλ</i>. Press <b>coating on glass</b> and ' +
         'then <b>quarter-wave</b>: the reflection at 550 nm falls from 4.3% to 1.3%, about a ' +
         'threefold cut, which is exactly what the single magnesium-fluoride coating on a camera ' +
         'lens does — and what is left is red and violet with the green taken out, which is why ' +
         'a coated lens looks purple. It only vanishes completely when <i>n</i>₂ = √(<i>n</i>₁' +
         '<i>n</i>₃) = 1.23, and no cheap hard coating has that index; slide <i>n</i>₂ down to ' +
         '1.23 and watch it go. Switch the graph to run <b>against thickness</b> and ' +
         'you have the fringes of a wedge; leave it against wavelength and you have the reason a ' +
         'soap bubble is coloured — at one thickness some wavelengths come back strongly and ' +
         'others hardly at all. One more thing falls out of the same arithmetic: press ' +
         '<b>air wedge in glass</b>, push <i>θ</i>₁ past 41° so the top surface totally ' +
         'internally reflects, and then slide <i>t</i> down. A wide gap sends everything back, ' +
         'but a narrow one does not — light <b>tunnels</b> across it. That is frustrated total ' +
         'internal reflection, and nothing was added to the model to produce it.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /* ------------------------------------------------- the film and beams */

  function drawF() {
    const ctx = fv.ctx, g = GF(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    const s = S();
    const tpx = st.tNm * PX_NM;
    const yt = g.yt, yb = yt + tpx;
    const t1 = th1();
    const th2 = s.th2;                      // null if the top surface totally reflects
    const ox = g.ox;

    /* What the film actually looks like. Everything else in this panel is one
     * wavelength at a time; this band is the whole spectrum at once, put
     * through the eye. It is the answer to "so why is a bubble coloured". */
    const BAND = g.sm ? 22 : 26;
    const col = filmColour();
    ctx.fillStyle = col.css;
    ctx.fillRect(0, 0, W, BAND);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, BAND + 0.5); ctx.lineTo(W, BAND + 0.5); ctx.stroke();
    /* the band is a real colour, so its label cannot take the page's ink
     * colour: it needs whichever of black or white the band can carry */
    const lin = c => { const u = c / 255; return u <= 0.04045 ? u / 12.92
                                                             : Math.pow((u + 0.055) / 1.055, 2.4); };
    const rel = 0.2126 * lin(col.r) + 0.7152 * lin(col.g) + 0.0722 * lin(col.b);
    const ink = rel > 0.34 ? '#000' : '#fff';
    ctext(ctx, g.sm ? `in white light — ×${COL_GAIN}`
                    : `what this film looks like in white light  — brightened ×${COL_GAIN}, ` +
                      `since it sends back ${fmt(100 * lumOf(), 1)}% of the light`,
      8, BAND - 8, { font: `600 11.5px ${P.font}`, color: ink });

    /* the three media, tinted by how optically dense they are */
    const tint = n => 0.05 + 0.13 * (n - 1) / (N_MAX - 1);
    ctx.save();
    ctx.fillStyle = P.accent;
    ctx.globalAlpha = tint(st.n1); ctx.fillRect(0, BAND + 1, W, yt - BAND - 1);
    ctx.globalAlpha = tint(st.n2); ctx.fillRect(0, yt, W, tpx);
    ctx.globalAlpha = tint(st.n3); ctx.fillRect(0, yb, W, H - yb);
    ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, yt); ctx.lineTo(W, yt);
    ctx.moveTo(0, yb); ctx.lineTo(W, yb);
    ctx.stroke();

    /* the geometry of the two beams */
    const u1 = [Math.sin(t1), Math.cos(t1)];          // in, going down-right
    const up = [Math.sin(t1), -Math.cos(t1)];         // out, going up-right
    const shift = th2 === null ? 0 : 2 * tpx * Math.tan(th2);
    const A = [ox, yt];                               // where it first strikes
    const B = th2 === null ? null : [ox + tpx * Math.tan(th2), yb];
    const Cc = [ox + shift, yt];

    /* the incoming beam */
    const inLen = Math.min(260, (A[1] - 30) / Math.max(u1[1], 0.2));
    const inStart = [A[0] - u1[0] * inLen, A[1] - u1[1] * inLen];
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(inStart[0], inStart[1]); ctx.lineTo(A[0], A[1]); ctx.stroke();
    carrow(ctx, A[0] - u1[0] * inLen * 0.6, A[1] - u1[1] * inLen * 0.6,
           A[0] - u1[0] * (inLen * 0.6 - 28), A[1] - u1[1] * (inLen * 0.6 - 28),
      { color: P.accent, width: 2.6, head: 10 });
    ctext(ctx, 'in', inStart[0] - 8, inStart[1] + 12,
      { font: `600 12px ${P.font}`, color: P.accent, align: 'right',
        halo: P.bg, haloWidth: 4 });

    /* inside the film */
    if (B) {
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(Cc[0], Cc[1]);
      ctx.stroke(); ctx.restore();
    }

    /* the two emerging beams, with their crests at true spacing */
    const reach = Math.min(W - Cc[0] - 20, yt - 20) / Math.max(Math.cos(t1), 1e-6);
    const phi1 = cArg(s.r1s);
    const phi2 = s.beta + cArg(s.r2s);                // relative to beam 1's start
    const lamPx = lam() * PX_NM;
    const beams = [
      { from: A,  phase: phi1, color: P.accent, dash: null, lab: 'off the top' },
      { from: Cc, phase: phi2, color: P.text,   dash: [6, 5], lab: 'out of the film' },
    ];
    for (const bm of beams) {
      ctx.save();
      ctx.strokeStyle = bm.color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      if (bm.dash) ctx.setLineDash(bm.dash);
      ctx.beginPath();
      ctx.moveTo(bm.from[0], bm.from[1]);
      ctx.lineTo(bm.from[0] + up[0] * reach, bm.from[1] + up[1] * reach);
      ctx.stroke();
      ctx.restore();
      /* crests: ticks across the beam wherever the phase is a whole turn */
      ctx.save();
      ctx.strokeStyle = bm.color; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.95;
      const per = [up[1], -up[0]];
      const drift = st.playing ? (st.t * 0.45) % 1 : 0;
      for (let k = 0; k < 40; k++) {
        const d = (k + drift) * lamPx - bm.phase / TAU * lamPx;
        if (d < 14 || d > reach) continue;
        const px = bm.from[0] + up[0] * d, py = bm.from[1] + up[1] * d;
        ctx.beginPath();
        ctx.moveTo(px - per[0] * 11, py - per[1] * 11);
        ctx.lineTo(px + per[0] * 11, py + per[1] * 11);
        ctx.stroke();
      }
      ctx.restore();
    }
    /* The two beams leave a few pixels apart — that separation is 2t tan θ₂
     * and is genuinely small — so they are named in a key rather than at
     * their ends, where the labels would sit on top of each other. */
    let ly = BAND + 42;
    for (const bm of beams) {
      ctx.save();
      ctx.strokeStyle = bm.color; ctx.lineWidth = 2.4;
      if (bm.dash) ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(12, ly - 4); ctx.lineTo(40, ly - 4); ctx.stroke();
      ctx.restore();
      ctext(ctx, bm.lab, 46, ly, { font: `600 11.5px ${P.font}`, color: bm.color });
      ly += 17;
    }

    /* the construction: the wavefront from C perpendicular to beam 1 */
    if (B) {
      const proj = (Cc[0] - A[0]) * up[0] + (Cc[1] - A[1]) * up[1];
      const foot = [A[0] + up[0] * proj, A[1] + up[1] * proj];
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(Cc[0], Cc[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
      ctx.restore();
    }

    /* mark every surface that flips the phase */
    const mark = (pt, r, label) => {
      const f = flipOf(r);
      if (f.turns < 1e-9) return;
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 4.2, 0, TAU); ctx.fill();
      ctext(ctx, `${label}: ${f.word}`, pt[0] + 9, pt[1] - 9,
        { font: `600 11px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });
    };
    mark(A, s.r1s, 'top');
    if (B) mark(B, s.r2s, 'bottom');

    /* thickness, bracketed */
    const bx = Math.max(14, ox - 150);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx - 6, yt); ctx.lineTo(bx + 30, yt);
    ctx.moveTo(bx - 6, yb); ctx.lineTo(bx + 30, yb);
    ctx.stroke();
    carrow(ctx, bx, yt, bx, yb, { color: P.accent, width: 1.2, head: 6, min: 3 });
    carrow(ctx, bx, yb, bx, yt, { color: P.accent, width: 1.2, head: 6, min: 3 });
    ctext(ctx, `t = ${st.tNm} nm`, bx - 10, (yt + yb) / 2 + 4,
      { font: P.sym(12), color: P.accent, align: 'right', halo: P.bg, haloWidth: 4 });

    /* the media, named */
    const nm = (n, y, which) => ctext(ctx, `${which}  n = ${fmt(n, 2)}`, W - 10, y,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right', halo: P.bg, haloWidth: 4 });
    nm(st.n1, yt - 12, 'above');
    nm(st.n3, H - 12, 'below');
    ctext(ctx, `film  n = ${fmt(st.n2, 2)}`, W - 10, yb + 16,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right', halo: P.bg, haloWidth: 4 });

    /* the one claim this panel makes about itself */
    const nlam = s.opd / lam();
    ctext(ctx, g.sm
            ? `to scale: ${fmt(lam(), 0)} nm = ${fmt(lamPx, 0)} px, film ${fmt(tpx, 0)} px ` +
              `= ${fmt(st.tNm / lam(), 2)} λ`
            : `drawn to scale: ${fmt(lam(), 0)} nm is ${fmt(lamPx, 0)} px and the film is ` +
              `${fmt(tpx, 0)} px, so it really is ${fmt(st.tNm / lam(), 2)} of a wavelength ` +
              `thick. Round trip inside: ${fmt(nlam, 3)} λ`,
      10, BAND + 18, { font: `500 11px ${P.font}`, color: P.muted, halo: P.bg,
                       haloWidth: 4, align: 'left' });

    if (st.ann) {
      callout(ctx, ['The two beams leave parallel, so an eye or a lens',
                    'brings them together. Whether they arrive in step',
                    'is the whole question.'],
        ox + 40, BAND + 12, Cc[0] + up[0] * 90, Cc[1] + up[1] * 90, { palette: P });
    }
  }

  /* ---------------------------------------- the ledger and the two waves */

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    const s = S();
    const f1 = flipOf(s.r1s), f2 = flipOf(s.r2s);
    const pathL = s.opd / lam();
    const total = pathL + f2.turns - f1.turns;
    const frac = ((total % 1) + 1) % 1;
    const bright = Math.min(frac, 1 - frac) < 0.02;
    const dark = Math.abs(frac - 0.5) < 0.02;

    const rows = [
      ['the round trip inside the film', `2n₂t cos θ₂ = ${fmt(s.opd, 0)} nm = ${fmt(pathL, 3)} λ`],
      ['at the top surface', `n ${st.n1 < st.n2 ? 'rises' : st.n1 > st.n2 ? 'falls' : 'is unchanged'}` +
        `, ${fmt(st.n1, 2)} → ${fmt(st.n2, 2)}:  ${f1.word}`],
      ['at the bottom surface', s.th2 === null
        ? 'nothing gets that far — the top surface reflects it all'
        : `n ${st.n2 < st.n3 ? 'rises' : st.n2 > st.n3 ? 'falls' : 'is unchanged'}` +
          `, ${fmt(st.n2, 2)} → ${fmt(st.n3, 2)}:  ${f2.word}`],
      ['so the two beams differ by', `${fmt(total, 3)} λ`],
      ['which means', bright ? 'a whole number of wavelengths — BRIGHT'
        : dark ? 'a half-integer — DARK'
        : `${fmt(frac, 3)} of a wavelength — in between`],
    ];
    let y = 34;
    for (const [k, v] of rows) {
      ctext(ctx, k, g.lx + 4, y, { font: `500 11.5px ${P.font}`, color: P.muted });
      ctext(ctx, v, g.lx + 4, y + 16,
        { font: `600 12.5px ${P.font}`,
          color: k === 'which means' ? (bright || dark ? P.accent : P.text) : P.text });
      ctx.save();
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.lx, y + 26); ctx.lineTo(g.lx + g.lw, y + 26); ctx.stroke();
      ctx.restore();
      y += 42;
    }

    drawWaves(ctx, g, total, s);

    if (st.ann) {
      callout(ctx, ['Every line of this is computed from the',
                    'refractive indices. Nothing here is a rule',
                    'that had to be remembered.'],
        g.lx + 40, H - 74, g.lx + 120, 60, { palette: P });
    }
  }

  function drawWaves(ctx, g, total, s) {
    const x0 = g.wx0, x1 = g.wx1;
    const ph = st.playing ? TAU * 0.35 * st.t : 0;
    const A = g.wA, yA = g.wyA, yB = g.wyB;
    /* the two beams carry different amplitudes, so the cancellation is
     * partial — which is the honest picture, and why a soap film is never
     * perfectly black */
    const a1 = cAbs(s.r1s), a2 = cAbs(s.r2s) * (1 - cAbs2(s.r1s));
    const big = Math.max(a1, a2, 1e-6);
    const A1 = A * a1 / big, A2 = A * a2 / big;

    const axis = (y, text, top) => {
      ctx.save();
      ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.35; ctx.strokeStyle = P.muted;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.restore();
      ctext(ctx, text, x0, y - top - 12, { font: `600 11.5px ${P.font}`, color: P.muted });
    };
    const wave = (y, amp, phase, color, width, dash) => {
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let px = x0; px <= x1; px += 2) {
        const k = (px - x0) / 64;
        const yy = y - amp * Math.sin(TAU * k - ph - phase);
        px === x0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
      }
      ctx.stroke(); ctx.restore();
    };

    axis(yA, 'the two reflected waves', A);
    wave(yA, A1, 0, P.accent, 2.4, null);
    wave(yA, A2, TAU * total, P.text, 2.2, [7, 5]);

    /* their sum, by phasors */
    const rx = A1 + A2 * Math.cos(TAU * total), ry = A2 * Math.sin(TAU * total);
    const res = Math.hypot(rx, ry), resPh = Math.atan2(ry, rx);
    axis(yB, 'their sum', A1 + A2);
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.globalAlpha = 0.4; ctx.strokeStyle = P.accent;
    ctx.lineWidth = 1.2;
    for (const sg of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(x0, yB - sg * (A1 + A2)); ctx.lineTo(x1, yB - sg * (A1 + A2));
      ctx.stroke();
    }
    ctx.restore();
    wave(yB, res, resPh, P.accent, 3, null);

    ctext(ctx, `${fmt(res / (A1 + A2), 3)} of the most they could give`,
      x1, yB + (A1 + A2) + 22,
      { font: `600 11.5px ${P.font}`,
        color: res / (A1 + A2) > 0.98 ? P.accent : P.text, align: 'right' });
    ctext(ctx, `${fmt(total, 3)} λ apart — ` +
               (Math.min(((total % 1) + 1) % 1, 1 - (((total % 1) + 1) % 1)) < 0.02
                 ? 'in step' : Math.abs((((total % 1) + 1) % 1) - 0.5) < 0.02
                 ? 'exactly out of step' : 'partly out of step'),
      x0, yA - A - 34, { font: `600 12px ${P.font}`, color: P.accent });
  }

  /* --------------------------------------------------- how much comes back */

  function drawC() {
    const ctx = cvs.ctx, g = GC(), W = g.W;
    ctx.clearRect(0, 0, W, HC);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HC);

    const STRIP_T = 26, STRIP_B = 74;
    const PLOT_T = 90, PLOT_B = 262, AX = 272;
    const lamMode = st.mode === 'lam';
    const at = v => (lamMode ? S(v, st.tNm) : S(lam(), v)).R;

    let mx = 0;
    const vals = [];
    for (let px = g.x0; px <= g.x1; px++) {
      const v = g.lo + (px - g.x0) / (g.x1 - g.x0) * (g.hi - g.lo);
      const R = at(v);
      vals.push([px, R]);
      if (R > mx) mx = R;
    }
    mx = Math.max(mx, 1e-6);

    /* The strip is in real colour, and it means two different things in the
     * two modes. Against WAVELENGTH it is the spectrum of the returning light:
     * each column is that wavelength's own colour, at the brightness this film
     * sends it back. Against THICKNESS each column is instead the whole
     * spectrum added up through the eye — so the strip becomes the sequence of
     * colours a wedge or a draining soap film runs through, and it is computed,
     * not copied from a chart. */
    if (lamMode) {
      for (const [px, R] of vals) {
        const v = g.lo + (px - g.x0) / (g.x1 - g.x0) * (g.hi - g.lo);
        /* absolute, not normalised to this film's own best: a coating that
         * reflects almost nothing has to LOOK like it reflects almost
         * nothing, and the curve below carries the shape either way */
        ctx.fillStyle = wavelengthCSS(v, { scale: clamp(R * COL_GAIN, 0, 1) }).css;
        ctx.fillRect(px, STRIP_T, 1, STRIP_B - STRIP_T);
      }
    } else {
      const cols = thicknessChart(Math.max(2, Math.round((g.x1 - g.x0) / 3)));
      const wpx = (g.x1 - g.x0) / cols.length + 1;
      cols.forEach(([t, css], i) => {
        ctx.fillStyle = css;
        ctx.fillRect(g.x0 + i * (g.x1 - g.x0) / cols.length, STRIP_T, wpx,
                     STRIP_B - STRIP_T);
      });
    }
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, STRIP_T + 0.5, g.x1 - g.x0, STRIP_B - STRIP_T);
    ctext(ctx, lamMode
            ? `the spectrum that comes back, wavelength by wavelength — brightened ×${COL_GAIN}`
            : `the colour the film runs through as it thickens — brightened ×${COL_GAIN}`,
      g.x1, STRIP_T - 8,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    const IY = R => PLOT_B - (R / mx) * (PLOT_B - PLOT_T);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, PLOT_T + 0.5, g.x1 - g.x0, PLOT_B - PLOT_T);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    vals.forEach(([px, R], i) => i ? ctx.lineTo(px, IY(R)) : ctx.moveTo(px, IY(R)));
    ctx.stroke();
    ctext(ctx, `reflected fraction — peak ${fmt(100 * mx, 1)}%`, g.x0 + 6, PLOT_T - 6,
      { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the axis */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, AX); ctx.lineTo(g.x1, AX); ctx.stroke();
    const step = lamMode ? 50 : 100;
    for (let v = Math.ceil(g.lo / step) * step; v <= g.hi; v += step) {
      const px = g.xOf(v);
      ctx.beginPath(); ctx.moveTo(px, AX); ctx.lineTo(px, AX + 5); ctx.stroke();
      ctext(ctx, String(v), px, AX + 15,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, lamMode ? 'wavelength / nm' : 'film thickness / nm', g.x1, AX + 32,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* where we are */
    const here = lamMode ? lam() : st.tNm;
    const pxh = g.xOf(here);
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pxh, STRIP_T); ctx.lineTo(pxh, AX); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(pxh, IY(at(here)), 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
  }

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) { st.t += Math.min(dt, 0.1); drawF(); drawA(); }
  }

  function render() {
    drawF(); drawA(); drawC();

    const s = S();
    const f1 = flipOf(s.r1s), f2 = flipOf(s.r2s);
    const pathL = s.opd / lam();
    const total = pathL + f2.turns - f1.turns;
    const frac = ((total % 1) + 1) % 1;
    const sameSign = s.r1s.re * s.r2s.re >= 0;

    /* the wavelength this thickness sends back most strongly */
    let bestL = LAM_MIN, bestR = -1;
    for (let l = LAM_MIN; l <= LAM_MAX; l += 1) {
      const R = S(l, st.tNm).R;
      if (R > bestR) { bestR = R; bestL = l; }
    }

    out.setAll({
      st: `${fmt(st.n1, 2)}  →  film ${fmt(st.n2, 2)}  →  ${fmt(st.n3, 2)}`,
      th: `${st.tNm} nm  =  ${fmt(st.tNm * st.n2 / lam(), 3)} wavelengths of ` +
          `${fmt(lam() / st.n2, 0)} nm light inside it`,
      an: s.th2 === null
        ? `${st.thDeg}° — past the critical angle: nothing travels in the film, only an ` +
          `evanescent wave that dies away across it`
        : `${st.thDeg}° in,  ${fmt(s.th2 * DEG, 2)}° inside`,
      op: `${fmt(s.opd, 1)} nm  =  ${fmt(pathL, 3)} λ`,
      r1: `${fmt(s.r1s.re, 3)}${Math.abs(s.r1s.im) > 1e-9 ? ` + ${fmt(s.r1s.im, 3)}i` : ''}` +
          `  —  ${f1.word}`,
      r2: s.th2 === null ? '—'
        : `${fmt(s.r2s.re, 3)}${Math.abs(s.r2s.im) > 1e-9 ? ` + ${fmt(s.r2s.im, 3)}i` : ''}` +
          `  —  ${f2.word}`,
      cd: sameSign
        ? '2n₂t cos θ₂ = mλ  (the flips agree, so they cancel out of the sum)'
        : '2n₂t cos θ₂ = (m+½)λ  (one surface flips and the other does not)',
      to: `${fmt(total, 3)} λ — ` +
          (Math.min(frac, 1 - frac) < 0.02 ? 'bright'
           : Math.abs(frac - 0.5) < 0.02 ? 'dark' : 'neither, in between'),
      rr: `${fmt(100 * s.R, 2)}%  —  two beams alone would say ${fmt(100 * s.Rtwo, 2)}%`,
      be: `${bestL} nm, at ${fmt(100 * bestR, 2)}%` +
          (bestR < 0.005 ? ' — this film reflects almost nothing at all' : ''),
      cl: colourWords(),
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(fv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      fv.setLogical(w, w < NARROW ? HF_SM : HF);
      av.setLogical(w, w < NARROW ? HA_SM : HA);
      cvs.setLogical(w, HC);
    }
    fv.fit(); av.fit(); cvs.fit();
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
      sN2.set(st.n2); sT.set(st.tNm); sLam.set(st.lamNm); sTh.set(st.thDeg);
      render();
    },
    _state: () => {
      const s = S();
      const f1 = flipOf(s.r1s), f2 = flipOf(s.r2s);
      return {
        n1: st.n1, n2: st.n2, n3: st.n3, tNm: st.tNm, lamNm: st.lamNm, thDeg: st.thDeg,
        opd: s.opd, opdLam: s.opd / lam(), beta: s.beta,
        th2: s.th2, R: s.R, Rtwo: s.Rtwo,
        r1: s.r1s, r2: s.r2s, flip1: f1.turns, flip2: f2.turns,
        total: s.opd / lam() + f2.turns - f1.turns,
        sameSign: s.r1s.re * s.r2s.re >= 0,
      };
    },
    _stack: q => stack(q),
    _R: (l, tt) => S(l ?? lam(), tt ?? st.tNm).R,
    /* the colour side, so a test can hold it to the same account */
    _colour: (tt) => {
      const xyz = filmXYZ(tt ?? st.tNm);
      const c = filmColour(tt ?? st.tNm);
      return { xyz, css: c.css, rgb: [c.r, c.g, c.b], gamutLoss: c.gamutLoss,
               clipped: c.clipped, lum: xyz.Y,
               dom: dominantWavelength(xyz), words: tt == null ? colourWords() : null };
    },
    _chart: n => thicknessChart(n).map(([t, css]) => [t, css]),
    _colGain: () => COL_GAIN,
    _cosIn: (n, sinA) => cosIn(n, sinA),
    _fresnel: (na, ca, nb, cb) => fresnelR(na, ca, nb, cb),
    _consts: () => {
      const a = GA(), c = GC(), f = GF();
      return { MW, HF, HF_SM, HA, HA_SM, HC, PX_NM,
               LAM_MIN, LAM_MAX, T_MIN, T_MAX, N_MIN, N_MAX, TH_MAX,
               W: c.W, sm: c.sm, x0: c.x0, x1: c.x1,
               fW: f.W, fH: f.H, ox: f.ox, yt: f.yt,
               lx: a.lx, lw: a.lw, wx0: a.wx0, wx1: a.wx1,
               wyA: a.wyA, wyB: a.wyB, wA: a.wA, aH: a.H };
    },
  };
}
