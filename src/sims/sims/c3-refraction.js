/* ============================================================================
 * C3-2  Refraction, Snell's Law and Total Internal Reflection
 * IB Physics C.3 Wave phenomena
 *
 * A ray diagram is one of the few physics pictures that is worth drawing to
 * scale, because every angle in it is the answer to a question. So this one is:
 * the refracted ray is drawn at the angle Snell's law gives, the reflected ray
 * at the angle of incidence, and the critical ray exactly where it belongs. If
 * a student measures the screen with a protractor they will get the right
 * numbers, which is not true of most textbook figures.
 *
 * ---------------------------------------------------------------------------
 * THE THING THAT USUALLY GETS ASSERTED
 *
 * Why does a ray bend at all? "Because it slows down" is a statement, not an
 * argument. Turn on the wavefronts and the argument is visible: the crests
 * cross the boundary and have to STAY JOINED to each other there. The
 * wavefronts are closer together in the slower medium, and the only way the
 * two sets can meet along the boundary is if the directions satisfy
 *
 *     λ₁ / sin θ₁  =  λ₂ / sin θ₂      i.e.   n₁ sin θ₁ = n₂ sin θ₂
 *
 * The spacing of the crests measured ALONG the boundary is the same on both
 * sides, and that identity is Snell's law. Nothing else is needed.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 *   refraction        n₁ sin θ₁ = n₂ sin θ₂
 *   reflection        θ_r = θ₁, always, on both sides of the boundary
 *   speed             v = c / n,  so the slower medium is the denser one
 *   wavelength        λ = λ₀ / n,  the frequency never changes
 *   critical angle    sin θc = n₂ / n₁,  and only when n₁ > n₂
 *
 * HOW MUCH LIGHT GOES EACH WAY
 *
 * The syllabus asks students to know that some light is always reflected and
 * that beyond the critical angle all of it is. Rather than say so, the rays
 * are drawn at the brightness the Fresnel equations give, for unpolarised
 * light, R = (R_s + R_p)/2 with
 *
 *     R_s = [(n₁cosθ₁ − n₂cosθ₂)/(n₁cosθ₁ + n₂cosθ₂)]²
 *     R_p = [(n₁cosθ₂ − n₂cosθ₁)/(n₁cosθ₂ + n₂cosθ₁)]²
 *
 * so the reflected ray fades up from a faint 4% at normal incidence to the
 * full beam at the critical angle, and the refracted ray fades out to nothing
 * at the same instant. Energy is conserved by construction: R + T = 1.
 *
 * A free consequence worth having: R_p passes through zero at Brewster's angle
 * tan θ_B = n₂/n₁, where the reflected light is completely polarised. That is
 * reported rather than drawn, because it belongs to a different question.
 *
 * THE GRAPH
 *
 * sin θ₂ against sin θ₁ is the graph this experiment is written up with: a
 * straight line of gradient n₁/n₂ through the origin. It also shows total
 * internal reflection better than the ray diagram does, because the line
 * simply runs into the ceiling sin θ₂ = 1 and stops. The reflected fraction is
 * drawn on the same axes — it is dimensionless and runs 0 to 1 like a sine —
 * and it reaches 1 at exactly the sin θ₁ where the other line stops.
 * ==========================================================================*/

import { spectrumToCSS, wavelengthCSS, samplesEvery } from '../colour.js';
import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout, Plot,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HA = 470, PB_H = 330;
const YI = 236;                     // the boundary, in panel A
const N_MIN = 1.00, N_MAX = 2.60;
const C0 = 2.998e8;                 // m s⁻¹
const LAM0 = 550;                   // nm, the vacuum wavelength quoted
const NARROW = 700;

/* ------------------------------------------------------------------------ *
 * DISPERSION
 *
 * Everywhere else in this file n is a number. In a real medium it is a
 * function of wavelength, and that is the whole of why a prism makes a
 * spectrum: Snell's law is being applied to a slightly different n for every
 * colour. Two ways of writing n(λ) are used here, both of them the ones the
 * glass catalogues use.
 *
 * SELLMEIER, for the glasses. With λ in micrometres,
 *
 *     n² − 1 = Σ B_i λ² / (λ² − C_i)
 *
 * The coefficients below are the published ones for Schott N-BK7 and SF10.
 * They are not fitted here and they are not adjustable; the verification
 * script checks what they produce against the two numbers a catalogue quotes
 * for a glass — the index at the sodium d line and the Abbe number.
 *
 * CAUCHY, for water and diamond, where the useful published data is three
 * measured indices rather than Sellmeier coefficients. n = A + B/λ² + C/λ⁴
 * has three constants, so it is solved to pass EXACTLY through the three
 * Fraunhofer lines F (486.1 nm), d (587.6 nm) and C (656.3 nm) rather than
 * fitted approximately to them.
 * ------------------------------------------------------------------------ */

/** n(λ) from Sellmeier coefficients, λ in nm */
function sellmeier(B, Cc) {
  return lamNm => {
    const x = (lamNm * 1e-3) ** 2;
    let s = 1;
    for (let i = 0; i < 3; i++) s += B[i] * x / (x - Cc[i]);
    return Math.sqrt(s);
  };
}

/** n = A + B/λ² + C/λ⁴, solved to pass through three measured indices */
function cauchy3(pts) {
  const M = pts.map(([l]) => [1, 1 / l ** 2, 1 / l ** 4]);
  const y = pts.map(([, n]) => n);
  /* Gaussian elimination on a 3x3 — small enough to write out and see */
  const A = M.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  const k = [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
  return lamNm => k[0] + k[1] / lamNm ** 2 + k[2] / lamNm ** 4;
}

/* the Fraunhofer lines the optical industry quotes everything at */
export const LINE_F = 486.1, LINE_D = 587.6, LINE_C = 656.3;

export const DISPERSIVE = {
  water:   { name: 'water',
             n: cauchy3([[LINE_F, 1.33714], [LINE_D, 1.33304], [LINE_C, 1.33107]]) },
  bk7:     { name: 'crown glass',
             n: sellmeier([1.03961212, 0.231792344, 1.01046945],
                          [0.00600069867, 0.0200179144, 103.560653]) },
  sf10:    { name: 'dense flint',
             n: sellmeier([1.62153902, 0.256287842, 1.64447552],
                          [0.0122241457, 0.0595736775, 147.468793]) },
  diamond: { name: 'diamond',
             n: cauchy3([[LINE_F, 2.4354], [LINE_D, 2.4175], [LINE_C, 2.4099]]) },
};

/** the Abbe number, which is how a catalogue says "how dispersive" */
export function abbe(key) {
  const f = DISPERSIVE[key].n;
  return (f(LINE_D) - 1) / (f(LINE_F) - f(LINE_C));
}

/** the media a school lab actually has, for naming a refractive index */
const MEDIA = [
  [1.00, 'air'], [1.31, 'ice'], [1.33, 'water'], [1.36, 'ethanol'],
  [1.47, 'oil'], [1.49, 'perspex'], [1.52, 'crown glass'],
  [1.62, 'flint glass'], [1.77, 'sapphire'], [2.42, 'diamond'],
];
export function nameOf(n) {
  for (const [v, name] of MEDIA) if (Math.abs(v - n) < 0.012) return name;
  return null;
}

/** Snell: the refracted angle, or null if the ray is totally internally reflected */
export function refract(n1, th1, n2) {
  const s = n1 * Math.sin(th1) / n2;
  return s > 1 ? null : Math.asin(s);
}

/** unpolarised Fresnel reflectance, and each polarisation separately */
export function fresnel(n1, th1, n2) {
  const th2 = refract(n1, th1, n2);
  if (th2 === null) return { R: 1, Rs: 1, Rp: 1 };
  const c1 = Math.cos(th1), c2 = Math.cos(th2);
  const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2);
  const rp = (n1 * c2 - n2 * c1) / (n1 * c2 + n2 * c1);
  const Rs = rs * rs, Rp = rp * rp;
  return { R: (Rs + Rp) / 2, Rs, Rp };
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c3-refraction',
    title: 'Refraction, Snell’s law and total internal reflection',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    n1: 1.52, n2: 1.00,
    th: 35 * Math.PI / 180,       // angle of incidence, radians
    disp: null,                   // a key of DISPERSIVE, or null for one index
    dispSide: 2,                  // which medium the dispersive material is
    waves: false,
    ann: false,
    playing: true,
    t: 0,
    dragging: false,
  };

  const TH_MAX = 89.2 / DEG;

  /* With a dispersive medium in place, n is no longer a number on a slider but
   * a function of wavelength, and every angle in the panel becomes a small
   * band instead of a line. Everything below is written so that the ordinary
   * single-index case is just the case where that band has zero width. */
  const n1At = l => (st.disp && st.dispSide === 1) ? DISPERSIVE[st.disp].n(l) : st.n1;
  const n2At = l => (st.disp && st.dispSide === 2) ? DISPERSIVE[st.disp].n(l) : st.n2;
  const th2At = l => refract(n1At(l), st.th, n2At(l));
  const critAt = l => (n1At(l) > n2At(l) ? Math.asin(n2At(l) / n1At(l)) : null);
  /* the wavelengths the fan is drawn with, and the ones the colour is
   * integrated over */
  const FAN = samplesEvery(5, 400, 700);

  /** how many degrees the refracted beam is spread over, or null if none gets out */
  function spreadDeg() {
    let lo = Infinity, hi = -Infinity;
    for (const l of FAN) {
      const t = th2At(l);
      if (t === null) continue;
      lo = Math.min(lo, t); hi = Math.max(hi, t);
    }
    return hi < lo ? null : (hi - lo) * DEG;
  }

  const th2Of = () => refract(st.n1, st.th, st.n2);
  const critical = () => (st.n1 > st.n2 ? Math.asin(st.n2 / st.n1) : null);
  const brewster = () => Math.atan(st.n2 / st.n1);
  const isTIR = () => th2Of() === null;

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, {
    label: 'A ray crossing a boundary between two media, drawn to scale',
  });

  function GA() {
    const W = av.w, sm = W < NARROW;
    return { W, sm,
             ox: Math.round(W * (sm ? 0.46 : 0.42)),
             arc1: sm ? 58 : 84, arc2: sm ? 46 : 68 };
  }

  /* ------------------------------------------------------- the graph */

  const plot = new Plot({
    width: MW, height: PB_H,
    xDomain: [0, 1], yDomain: [0, 1],
    xLabel: 'sin θ₁', yLabel: 'sin θ₂ , and the reflected fraction',
    pad: { l: 58, r: 20, t: 30, b: 42 },
    xTicks: 5, yTicks: 5,
    ariaLabel: 'sine of the refracted angle, and the reflected fraction, against the sine of the angle of incidence',
  });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'm1', label: 'Medium 1, the ray comes from here' },
    { key: 'm2', label: 'Medium 2' },
    { key: 'a1', label: 'Angle of incidence <i>θ</i>₁, from the <b>normal</b>' },
    { key: 'a2', label: 'Angle of refraction <i>θ</i>₂' },
    { key: 'sn', label: 'Snell: <i>n</i>₁sin<i>θ</i>₁ against <i>n</i>₂sin<i>θ</i>₂' },
    { key: 'cr', label: 'Critical angle, sin<i>θ</i><sub>c</sub> = <i>n</i>₂/<i>n</i>₁' },
    { key: 'sp', label: 'Speed of light in each, <i>v</i> = <i>c</i>/<i>n</i>' },
    { key: 'wl', label: `Wavelength of ${LAM0} nm light in each, <i>λ</i> = <i>λ</i>₀/<i>n</i>` },
    { key: 'rf', label: 'Reflected, and refracted, fraction of the energy' },
    { key: 'br', label: 'Brewster angle, tan<i>θ</i><sub>B</sub> = <i>n</i>₂/<i>n</i>₁ — reflection fully polarised' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sN1 = slider({ label: '<i>n</i>₁', min: N_MIN, max: N_MAX, step: 0.01, value: st.n1,
    format: v => `${v.toFixed(2)}${nameOf(v) ? ' · ' + nameOf(v) : ''}`,
    onInput: v => { st.n1 = v; if (st.dispSide === 1) st.disp = null; render(); } });
  const sN2 = slider({ label: '<i>n</i>₂', min: N_MIN, max: N_MAX, step: 0.01, value: st.n2,
    format: v => `${v.toFixed(2)}${nameOf(v) ? ' · ' + nameOf(v) : ''}`,
    onInput: v => { st.n2 = v; if (st.dispSide === 2) st.disp = null; render(); } });
  const sTh = slider({ label: '<i>θ</i>₁', min: 0, max: 89.2, step: 0.1, value: 35,
    format: v => `${v.toFixed(1)}°`, onInput: v => { st.th = v / DEG; render(); } });

  const bWave = button({ label: 'Show the wavefronts', pressed: false, onClick: b => {
    st.waves = !st.waves; b.setAttribute('aria-pressed', String(st.waves)); render();
  } });
  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });
  const bCrit = button({ label: 'Sit exactly on the critical angle', onClick: () => {
    const c = critical();
    if (c === null) return;
    setTh(c); render();
  } });

  const preset = (a, b2, label) => button({ label, onClick: () => {
    st.disp = null;
    st.n1 = a; st.n2 = b2; sN1.set(a); sN2.set(b2);
    if (st.th > TH_MAX) setTh(TH_MAX);
    render();
  } });
  /* A dispersive setup needs four things set at once — which material, which
   * side of the boundary it is on, and an angle worth looking at — so each of
   * these is one button rather than four controls. */
  const whiteDefs = [
    { key: 'bk7', side: 2, th: 60, label: 'into crown glass' },
    { key: 'sf10', side: 2, th: 60, label: 'into dense flint' },
    { key: 'sf10', side: 1, th: 33.5, label: 'out of dense flint, near θc' },
    { key: 'diamond', side: 1, th: 24.3, label: 'out of diamond, near θc' },
  ];
  const whites = whiteDefs.map(w => button({
    label: w.label, pressed: false,
    onClick: () => {
      st.disp = w.key; st.dispSide = w.side;
      const nd = DISPERSIVE[w.key].n(LINE_D);
      if (w.side === 2) { st.n2 = +nd.toFixed(2); st.n1 = 1.00; }
      else { st.n1 = +nd.toFixed(2); st.n2 = 1.00; }
      sN1.set(st.n1); sN2.set(st.n2);
      setTh(w.th / DEG);
      render();
    },
  }));
  const bMono = button({ label: 'Back to one wavelength', onClick: () => {
    st.disp = null; render();
  } });

  const presets = [
    preset(1.00, 1.33, 'air → water'),
    preset(1.33, 1.00, 'water → air'),
    preset(1.52, 1.00, 'glass → air'),
    preset(1.00, 1.52, 'air → glass'),
    preset(2.42, 1.00, 'diamond → air'),
  ];

  function setTh(rad) { st.th = clamp(rad, 0, TH_MAX); sTh.set(st.th * DEG); }

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Refraction, Snell’s Law and Total Internal Reflection',
            'a ray diagram drawn to scale — measure it with a protractor if you like'),
    controls([el('div', { class: 'ibs-btns' }, presets.map(p => p.node))], { label: 'try:' }),
    controls([el('div', { class: 'ibs-btns' },
                 whites.map(p => p.node).concat([bMono.node]))],
             { label: 'white light:' }),
    panelBox('The boundary — drag the incoming ray', av.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bWave.node, bCrit.node, bAnn.node])]),
    controls([sN1.node, sN2.node, sTh.node]),
    panelBox('The graph this experiment is written up with', plot.svg),
    out.node,
    note('<b>Snell’s law.</b> Light changes direction at a boundary because it changes speed: ' +
         '<i>v</i> = <i>c</i>/<i>n</i>, and the frequency cannot change, so the wavelength does. ' +
         'Press <b>Show the wavefronts</b> and the reason is on the screen — the crests have to ' +
         'stay joined across the boundary, and the only way two sets of differently spaced crests ' +
         'can meet along one line is if <i>λ</i>₁/sin<i>θ</i>₁ = <i>λ</i>₂/sin<i>θ</i>₂, which is ' +
         '<b><i>n</i>₁sin<i>θ</i>₁ = <i>n</i>₂sin<i>θ</i>₂</b>. Every angle here is measured from ' +
         'the <b>normal</b>, never from the surface. Going into a <i>less</i> dense medium the ray ' +
         'bends away from the normal, and past the <b>critical angle</b> sin<i>θ</i><sub>c</sub> = ' +
         '<i>n</i>₂/<i>n</i>₁ there is no angle left to bend to: every bit of the light comes back, ' +
         'which is how an optical fibre works. Notice that the reflected ray is there the whole ' +
         'time, faint at first and brightening as you approach the critical angle — total internal ' +
         'reflection is the end of that process, not a switch that flips. ' +
         '<b>Then try white light.</b> A real medium does not have one refractive index, it has ' +
         'one for every wavelength — violet always sees a slightly larger <i>n</i> than red — so ' +
         'Snell\u2019s law sends each colour somewhere slightly different. Two things are worth ' +
         'noticing. Going <b>into</b> the glass the fan is a fraction of a degree wide: dispersion ' +
         'at a single surface is a small effect, which is exactly why a prism uses two surfaces ' +
         'and a spectrometer uses a grating. And going <b>out</b>, near the critical angle, the ' +
         'fan opens right out — because there is no longer one critical angle but a band of them, ' +
         'violet reaching its own first. Sit between the two and the only light that escapes is ' +
         'red. Nothing in that picture is exaggerated; every angle is where Snell puts it.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /** where a ray from the origin in direction (dx,dy) leaves the panel */
  function edge(ox, oy, dx, dy, W, hiMin, hiMax) {
    let best = 1e9;
    if (dx > 1e-9) best = Math.min(best, (W - 6 - ox) / dx);
    if (dx < -1e-9) best = Math.min(best, (6 - ox) / dx);
    if (dy > 1e-9) best = Math.min(best, (hiMax - oy) / dy);
    if (dy < -1e-9) best = Math.min(best, (hiMin - oy) / dy);
    return [ox + dx * best, oy + dy * best];
  }

  /**
   * Wavefronts, on both sides, drawn so they meet.
   *
   * A crest in medium 1 satisfies (P−O)·d̂₁ = λ₁(m + ft); in medium 2,
   * (P−O)·d̂₂ = λ₂(m + ft) with λ₂ = λ₁n₁/n₂. Feeding the same m and the same
   * ft to both sides makes crest m meet crest m on the boundary, because
   * x sinθ₁ = λ₁(m+ft) and x sinθ₂ = λ₂(m+ft) have the same solution x
   * exactly when sinθ₁/sinθ₂ = λ₁/λ₂ = n₂/n₁ — which is Snell's law. The
   * picture is therefore not an illustration of the law, it is the law.
   */
  function drawWaves(ctx, g, ox, th1, th2) {
    const W = g.W;
    const lam1 = 42, lam2 = lam1 * st.n1 / st.n2;
    const ft = st.playing ? (st.t * 0.5) % 1 : 0;

    /* A beam of finite width, not a wallpaper of infinite plane waves. The
     * footprint it makes on the boundary is what the two sets of crests have
     * to share, so it is the quantity held fixed: the incident beam is
     * F·cosθ₁ wide and the refracted one F·cosθ₂, which is also why a beam
     * broadens as it enters a denser medium. F is capped so that a beam at
     * grazing incidence neither vanishes nor floods the panel. */
    const F = Math.min(300, 110 / Math.max(Math.cos(th1), 0.05));
    const b1 = F * Math.cos(th1);
    const b2 = th2 === null ? 0 : F * Math.cos(th2);

    const draw = (th, lam, b, above) => {
      const dx = Math.sin(th), dy = Math.cos(th);    // the way the wave travels
      const px = Math.cos(th), py = -Math.sin(th);   // along a crest
      ctx.save();
      ctx.beginPath();
      above ? ctx.rect(0, 0, W, YI) : ctx.rect(0, YI, W, HA - YI);
      ctx.clip();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.42;
      ctx.lineCap = 'round';
      for (let m = -40; m <= 40; m++) {
        const c = lam * (m + ft);
        const cx = ox + dx * c, cy = YI + dy * c;
        ctx.beginPath();
        ctx.moveTo(cx - px * b, cy - py * b);
        ctx.lineTo(cx + px * b, cy + py * b);
        ctx.stroke();
      }
      /* the two edges of the beam, so it reads as a beam */
      ctx.globalAlpha = 0.30; ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(ox + px * b * sgn - dx * 1600, YI + py * b * sgn - dy * 1600);
        ctx.lineTo(ox + px * b * sgn + dx * 1600, YI + py * b * sgn + dy * 1600);
        ctx.stroke();
      }
      ctx.restore();
    };
    draw(th1, lam1, b1, true);
    if (th2 !== null) draw(th2, lam2, b2, false);

    /* the crest spacing measured ALONG the boundary — the same on both sides,
     * which is the whole of Snell's law */
    if (th2 !== null && Math.sin(th1) > 0.06) {
      const step = lam1 / Math.sin(th1);
      const x0 = ox + step * ft;
      ctx.save();
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
      for (let m = 0; m <= 2; m++) {
        const x = x0 + m * step;
        if (x > W - 40) break;
        ctx.beginPath(); ctx.moveTo(x, YI - 7); ctx.lineTo(x, YI + 7); ctx.stroke();
      }
      if (x0 + step < W - 40 && !g.sm) {
        /* no number: this is a distance on a screen, and quoting it in
         * pixels would invite it to be read as a measurement */
        ctext(ctx, 'the crests meet here:  λ₁/sin θ₁ = λ₂/sin θ₂',
          x0 + step / 2, YI - 13,
          { font: P.sym(11.5), color: P.text, align: 'center', halo: P.bg, haloWidth: 4 });
      }
      ctx.restore();
    }
  }

  function angleArc(ctx, ox, r, from, to, color, label) {
    /* angles measured from the normal, which is what the labels must show */
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(ox, YI, r, from, to, false);
    ctx.stroke();
    ctx.restore();
    const mid = (from + to) / 2;
    ctext(ctx, label, ox + Math.cos(mid) * (r + 15), YI + Math.sin(mid) * (r + 15) + 4,
      { font: P.sym(13), color, align: 'center', halo: P.bg });
  }

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W;
    ctx.clearRect(0, 0, W, HA);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HA);

    const ox = g.ox, th1 = st.th, th2 = th2Of();
    const F = fresnel(st.n1, th1, st.n2);

    /* the two media, tinted by how optically dense they are */
    const tint = n => 0.05 + 0.13 * (n - 1) / (N_MAX - 1);
    ctx.save();
    ctx.globalAlpha = tint(st.n1); ctx.fillStyle = P.accent;
    ctx.fillRect(0, 0, W, YI);
    ctx.globalAlpha = tint(st.n2);
    ctx.fillRect(0, YI, W, HA - YI);
    ctx.restore();

    if (st.waves) drawWaves(ctx, g, ox, th1, th2);

    /* the boundary and the normal */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, YI); ctx.lineTo(W, YI); ctx.stroke();
    ctx.save();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ox, 12); ctx.lineTo(ox, HA - 12); ctx.stroke();
    ctx.restore();
    /* at the foot of the normal, not the head: on a phone the medium label
     * runs the width of the panel and the two collide up there */
    ctext(ctx, 'normal', ox + 7, HA - 16, { font: `500 11px ${P.font}`, color: P.muted });

    /* the labels for each medium */
    /* A steep incident ray crosses the top-left corner, where the medium-1
     * label lives. Moving the label to the other side only trades one
     * collision for another — the reflected ray's own name is over there — so
     * it stays put and carries a halo, which is what haloes are for. */
    const lx = 14, la = 'left';
    const label = (n, y, which) => {
      const nm = nameOf(n);
      ctext(ctx, `${which}:  n = ${fmt(n, 2)}${nm ? '  (' + nm + ')' : ''}`, lx, y,
        { font: `600 12px ${P.font}`, color: P.text, align: la,
          halo: P.bg, haloWidth: 4 });
      ctext(ctx, `v = ${fmt(C0 / n / 1e8, 3)} × 10⁸ m s⁻¹`, lx, y + 15,
        { font: `500 11px ${P.font}`, color: P.muted, align: la,
          halo: P.bg, haloWidth: 4 });
    };
    label(st.n1, 24, 'medium 1');
    label(st.n2, HA - 30, 'medium 2');

    /* ---- the rays ---- */
    const ray = (dx, dy, color, strength, dashed) => {
      const [ex, ey] = edge(ox, YI, dx, dy, W, 8, HA - 8);
      const alpha = 0.22 + 0.78 * strength;
      const wdt = 1.6 + 2.6 * strength;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (dashed) ctx.setLineDash([6, 5]);
      ctx.strokeStyle = color; ctx.lineWidth = wdt; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox, YI); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      /* an arrowhead partway along, so direction is never in doubt */
      const t = 0.56, mx = ox + (ex - ox) * t, my = YI + (ey - YI) * t;
      ctx.save(); ctx.globalAlpha = alpha;
      carrow(ctx, mx - dx * 16, my - dy * 16, mx + dx * 16, my + dy * 16,
        { color, width: wdt, head: 11 });
      ctx.restore();
      return [ex, ey];
    };

    /* incident: comes from the upper left, travelling down-right */
    const idx = Math.sin(th1), idy = Math.cos(th1);
    const [sx, sy] = edge(ox, YI, -idx, -idy, W, 8, HA - 8);
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ox, YI); ctx.stroke();
    const imx = sx + (ox - sx) * 0.52, imy = sy + (YI - sy) * 0.52;
    carrow(ctx, imx - idx * 16, imy - idy * 16, imx, imy,
      { color: P.accent, width: 4.2, head: 13 });
    ctx.restore();
    const inOff = g.sm ? 92 : 46;
    ctext(ctx, 'incident', sx + idx * inOff + idy * 14, sy + idy * inOff - idx * 14 + 4,
      { font: `600 12px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });

    /* reflected: same angle, other side of the normal, always present */
    ray(idx, -idy, P.text, F.R);
    /* refracted: at the Snell angle, unless there is no such angle.
     *
     * With a dispersive medium there is no single such angle — there is one
     * per wavelength — so the beam is drawn as the fan it is, in real colour,
     * AT TRUE ANGLES with nothing exaggerated. Away from the critical angle
     * that fan is a fraction of a degree wide and the colours blend back into
     * white, which is the honest picture: dispersion at a single surface is a
     * small effect, and that is exactly why a prism uses two of them. Near the
     * critical angle it opens out, and the short wavelengths drop out of it
     * one by one as they go into total internal reflection first. */
    if (st.disp) {
      /* long enough to leave the panel from anywhere, then clipped to it */
      const R0 = Math.hypot(W, HA) * 1.2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, YI, W, HA - YI);
      ctx.clip();
      for (let i = 0; i < FAN.length - 1; i++) {
        const la = FAN[i], lb = FAN[i + 1];
        const ta = th2At(la), tb = th2At(lb);
        if (ta === null || tb === null) continue;
        const str = 1 - fresnel(n1At(la), th1, n2At(la)).R;
        ctx.globalAlpha = 0.25 + 0.75 * str;
        ctx.fillStyle = wavelengthCSS((la + lb) / 2).css;
        ctx.beginPath();
        ctx.moveTo(ox, YI);
        ctx.lineTo(ox + Math.sin(ta) * R0, YI + Math.cos(ta) * R0);
        ctx.lineTo(ox + Math.sin(tb) * R0, YI + Math.cos(tb) * R0);
        ctx.closePath();
        ctx.fill();
      }
      /* A tenth of a degree of spread is a fraction of a pixel wide, and a
       * white beam on white paper is nothing at all, so the EDGES of the fan
       * are drawn as lines. That keeps every angle true — the outline is where
       * the extreme colours really go — while leaving something to see. */
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
      for (const l of [400, 700]) {
        const t = th2At(l);
        if (t === null) continue;
        ctx.beginPath();
        ctx.moveTo(ox, YI);
        ctx.lineTo(ox + Math.sin(t) * R0, YI + Math.cos(t) * R0);
        ctx.stroke();
      }
      ctx.restore();
    } else if (th2 !== null) {
      ray(Math.sin(th2), Math.cos(th2), P.accent, 1 - F.R);
    }

    /* the critical ray, drawn faintly wherever one exists */
    const c = critical();
    if (c !== null && Math.abs(c - th1) > 0.01) {
      ctx.save();
      ctx.setLineDash([3, 5]); ctx.globalAlpha = 0.4;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
      const [ex, ey] = edge(ox, YI, -Math.sin(c), -Math.cos(c), W, 8, HA - 8);
      ctx.beginPath(); ctx.moveTo(ox, YI); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      /* two thirds of the way along rather than at the end, where the
       * incident ray's own label is */
      ctext(ctx, `θc = ${fmt(c * DEG, 1)}°`,
        ox + (ex - ox) * 0.66 - 6, YI + (ey - YI) * 0.66,
        { font: P.sym(11.5), color: P.muted, align: 'right',
          halo: P.bg, haloWidth: 4 });
    }

    /* ---- the angles ---- */
    const A = -Math.PI / 2;                    // straight up, along the normal
    angleArc(ctx, ox, g.arc1, A - th1, A, P.accent, 'θ₁');
    angleArc(ctx, ox, g.arc1 + 16, A, A + th1, P.text, 'θr');
    if (th2 !== null) {
      angleArc(ctx, ox, g.arc2, Math.PI / 2 - th2, Math.PI / 2, P.accent, 'θ₂');
    }

    /* the ray names, placed at the ends rather than along the rays */
    const nameAt = (dx, dy, text, color) => {
      const [ex, ey] = edge(ox, YI, dx, dy, W, 8, HA - 8);
      /* a ray that leaves through the bottom edge would put its label below
       * the panel, so the label is pulled back inside rather than trusted to
       * the ray's own end point */
      const ly = clamp(ey - dy * 30 + (dy > 0 ? 16 : -10), 22, HA - 12);
      ctext(ctx, text, clamp(ex - dx * 30, 90, W - 8), ly,
        { font: `600 12px ${P.font}`, color, align: 'right', halo: P.bg,
          haloWidth: 4 });
    };
    nameAt(idx, -idy, `reflected · ${(F.R * 100).toFixed(0)}%`, P.text);
    if (st.disp) {
      const sp = spreadDeg();
      const lost = FAN.filter(l => th2At(l) === null).length;
      ctext(ctx, sp === null ? 'every colour is totally internally reflected'
              : `refracted, spread over ${fmt(sp, sp < 1 ? 2 : 1)}°` +
                (g.sm ? '' :
                 lost ? ` — and ${lost} of the ${FAN.length} sampled wavelengths, ` +
                        'the short ones, are already past their own critical angle'
                      : ' — drawn at true angles, nothing exaggerated'),
        14, HA - 52, { font: `600 12px ${P.font}`, color: P.text,
                       halo: P.bg, haloWidth: 4 });
    } else if (th2 !== null) {
      nameAt(Math.sin(th2), Math.cos(th2),
        `refracted · ${((1 - F.R) * 100).toFixed(0)}%`, P.accent);
    } else {
      ctext(ctx, 'total internal reflection — nothing gets through', ox + 16, YI + 34,
        { font: `600 12.5px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
    }

    if (st.ann) {
      callout(ctx, ['Every angle is measured from the NORMAL,',
                    'the dashed line, not from the surface.',
                    'Marks are lost here every year.'],
        ox + 30, 44, ox, YI - g.arc1, { palette: P });
    }
  }

  /* -------------------------------------------------- the sin-sin graph */

  function drawB() {
    plot.clear(); plot.clearOverlay();
    const col = 'var(--ibs-accent)', ink = 'var(--ibs-text)';
    const ratio = st.n1 / st.n2;
    const sMax = Math.min(1, st.n2 / st.n1);     // where the straight line stops

    if (st.disp) {
      /* one line per colour: same law, slightly different n, so they fan out
       * from a common origin and run into the ceiling at slightly different
       * places. The spread of those endpoints IS the spread of critical
       * angles, which is why the light that escapes near θc is red. */
      for (let l = 400; l <= 700; l += 10) {
        const r = n1At(l) / n2At(l);
        const m = Math.min(1, 1 / r);
        plot.line([[0, 0], [m, r * m]],
          { color: wavelengthCSS(l).css, width: 2.2 });
      }
    } else {
      /* sin θ₂ = (n₁/n₂) sin θ₁ — a straight line, which is the point of it */
      plot.line([[0, 0], [sMax, ratio * sMax]], { color: col, width: 2.4 });
    }

    /* the reflected fraction, on the same dimensionless axis */
    const pts = [];
    for (let i = 0; i <= 400; i++) {
      const s = i / 400;
      const th = Math.asin(Math.min(1, s));
      pts.push([s, fresnel(st.n1, th, st.n2).R]);
    }
    plot.line(pts, { color: ink, width: 1.5, dash: '5 4', opacity: 0.75 });

    if (sMax < 1) {
      plot.vline(sMax, { color: ink, dash: '4 4' });
      plot.text(sMax, 0.06, ` total internal reflection →`,
        { color: ink, size: 11.5, weight: 600 });
      plot.text(sMax, 0.14, ` sin θc = ${fmt(sMax, 3)}`,
        { color: 'var(--ibs-muted)', size: 11 });
    }

    plot.text(0.035, 0.95, `gradient = n₁/n₂ = ${fmt(ratio, 3)}`,
      { color: col, size: 13, weight: 600 });
    plot.text(0.035, 0.88, 'the dashed curve is the reflected fraction',
      { color: 'var(--ibs-muted)', size: 11.5 });

    /* where the ray currently is */
    const s1 = Math.sin(st.th), th2 = th2Of();
    plot.dot(s1, fresnel(st.n1, st.th, st.n2).R, { color: ink, r: 4 });
    if (th2 !== null) plot.dot(s1, Math.sin(th2), { color: col, r: 5 });
  }

  /* ================================================================== *
   * dragging the incoming ray
   * ================================================================== */

  const fromPointer = e => {
    const g = GA(), p = av.at(e);
    const dx = p.x - g.ox, dy = p.y - YI;
    /* the angle of whichever ray the pointer is nearest to, from the normal */
    const a = Math.atan2(Math.abs(dx), Math.abs(dy));
    setTh(a);
  };
  const onDown = e => {
    st.dragging = true; fromPointer(e);
    av.el.setPointerCapture(e.pointerId); e.preventDefault(); render();
  };
  const onMove = e => {
    if (!st.dragging) { av.el.style.cursor = 'crosshair'; return; }
    fromPointer(e); e.preventDefault(); render();
  };
  const onUp = e => {
    if (!st.dragging) return;
    st.dragging = false;
    try { av.el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  av.el.addEventListener('pointerdown', onDown);
  av.el.addEventListener('pointermove', onMove);
  av.el.addEventListener('pointerup', onUp);
  av.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    av.el.removeEventListener('pointerdown', onDown);
    av.el.removeEventListener('pointermove', onMove);
    av.el.removeEventListener('pointerup', onUp);
    av.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing && st.waves) { st.t += Math.min(dt, 0.1); drawA(); }
  }

  let lastKey = '';
  function render() {
    whites.forEach((b, i) => b.setPressed(
      st.disp === whiteDefs[i].key && st.dispSide === whiteDefs[i].side));
    bMono.setPressed(st.disp === null);
    drawA();
    const key = `${st.n1}|${st.n2}|${fmt(st.th, 5)}|${plot.w}`;
    if (key !== lastKey) { drawB(); lastKey = key; }

    const th2 = th2Of(), c = critical(), F = fresnel(st.n1, st.th, st.n2);
    const nm = n => { const x = nameOf(n); return x ? ` (${x})` : ''; };
    bCrit.disable(c === null);

    /* the dispersive case: every one of these is a band, not a number */
    const D = st.disp ? DISPERSIVE[st.disp] : null;
    const sideWord = st.dispSide === 1 ? 'medium 1' : 'medium 2';
    const tV = st.disp ? th2At(400) : null, tR = st.disp ? th2At(700) : null;
    const cV = st.disp ? critAt(400) : null, cR = st.disp ? critAt(700) : null;
    const spread = st.disp ? spreadDeg() : null;

    out.setAll({
      m1: st.disp && st.dispSide === 1
        ? `${D.name} — n = ${fmt(D.n(LINE_D), 4)} at the sodium d line, ` +
          `and an Abbe number of ${fmt(abbe(st.disp), 1)}`
        : `n₁ = ${fmt(st.n1, 2)}${nm(st.n1)}`,
      m2: st.disp && st.dispSide === 2
        ? `${D.name} — n = ${fmt(D.n(LINE_D), 4)} at the sodium d line, ` +
          `and an Abbe number of ${fmt(abbe(st.disp), 1)}: the smaller that is, ` +
          'the more the colours are separated'
        : `n₂ = ${fmt(st.n2, 2)}${nm(st.n2)}` +
          (st.n2 < st.n1 ? ' — the less dense side' : st.n2 > st.n1 ? ' — the denser side' : ' — the same'),
      a1: `${fmt(st.th * DEG, 1)}°`,
      a2: st.disp
        ? (spread === null ? 'none — every colour is past its own critical angle'
           : `${tR === null ? '—' : fmt(tR * DEG, 2) + '° for red'}` +
             `${tV === null ? ', and violet no longer gets out at all'
                            : ` and ${fmt(tV * DEG, 2)}° for violet`}` +
             ` — a spread of ${fmt(spread, spread < 1 ? 2 : 1)}°`)
        : th2 === null ? 'none — the light cannot get out'
                       : `${fmt(th2 * DEG, 1)}°` +
                         (th2 > st.th ? '  (bent away from the normal)'
                          : th2 < st.th ? '  (bent towards the normal)' : '  (straight through)'),
      sn: `${fmt(st.n1 * Math.sin(st.th), 4)}  against  ` +
          (th2 === null ? 'no refracted ray' : `${fmt(st.n2 * Math.sin(th2), 4)}`),
      cr: st.disp && cV !== null && cR !== null
        ? `not one angle but a band: ${fmt(cV * DEG, 2)}° for violet and ` +
          `${fmt(cR * DEG, 2)}° for red, because violet sees the larger n. ` +
          'Inside that band the spectrum is cut off from the violet end, and the cut ' +
          'creeps up through it as you turn further — so the last light to escape is red'
        : c === null ? 'none — medium 2 is the denser one'
                     : `${fmt(c * DEG, 2)}°` +
                       (st.th > c ? '  — you are past it' : `  — ${fmt((c - st.th) * DEG, 1)}° to go`),
      sp: `${fmt(C0 / st.n1 / 1e8, 3)} and ${fmt(C0 / st.n2 / 1e8, 3)} × 10⁸ m s⁻¹`,
      wl: st.disp
        ? `in ${D.name}, n is ${fmt(D.n(LINE_F), 4)} at 486 nm, ${fmt(D.n(LINE_D), 4)} at ` +
          `588 nm and ${fmt(D.n(LINE_C), 4)} at 656 nm — a change of only ` +
          `${fmt(D.n(LINE_F) - D.n(LINE_C), 4)} across the whole visible spectrum`
        : `${fmt(LAM0 / st.n1, 1)} and ${fmt(LAM0 / st.n2, 1)} nm — the frequency is unchanged`,
      rf: `${fmt(F.R * 100, 1)}% reflected, ${fmt((1 - F.R) * 100, 1)}% refracted`,
      br: st.n1 === st.n2 ? '—'
        : `${fmt(brewster() * DEG, 1)}°` +
          (Math.abs(st.th - brewster()) < 0.01 ? '  — you are on it' : ''),
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(av.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      av.setLogical(clamp(cw, 340, MW), HA);
      plot.setSize(clamp(cw, 300, MW), PB_H);
    }
    av.fit();
    lastKey = '';
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
      if (p.thDeg != null) { st.th = clamp(p.thDeg / DEG, 0, TH_MAX); delete p.thDeg; }
      Object.assign(st, p);
      sN1.set(st.n1); sN2.set(st.n2); sTh.set(st.th * DEG);
      lastKey = ''; render();
    },
    _state: () => ({
      n1: st.n1, n2: st.n2, th1: st.th, th1Deg: st.th * DEG,
      th2: th2Of(), th2Deg: th2Of() === null ? null : th2Of() * DEG,
      tir: isTIR(), critical: critical(), brewster: brewster(),
      ...fresnel(st.n1, st.th, st.n2),
      v1: C0 / st.n1, v2: C0 / st.n2,
      lam1: LAM0 / st.n1, lam2: LAM0 / st.n2,
    }),
    _refract: (n1, thDeg, n2) => {
      const r = refract(n1, thDeg / DEG, n2);
      return r === null ? null : r * DEG;
    },
    _fresnel: (n1, thDeg, n2) => fresnel(n1, thDeg / DEG, n2),
    _name: nameOf,
    /* the dispersive side, for the tests */
    _n1At: l => n1At(l),
    _n2At: l => n2At(l),
    _th2At: l => th2At(l),
    _critAt: l => critAt(l),
    _spread: () => spreadDeg(),
    _disp: () => ({ key: st.disp, side: st.dispSide }),
    _nMat: (key, l) => DISPERSIVE[key].n(l),
    _abbe: key => abbe(key),
    _lines: () => ({ F: LINE_F, D: LINE_D, C: LINE_C }),
    _consts: () => {
      const { W, sm, ox, arc1, arc2 } = GA();
      return { MW, HA, PB_H, YI, N_MIN, N_MAX, C0, LAM0, TH_MAX_DEG: TH_MAX * DEG,
               W, sm, ox, arc1, arc2 };
    },
  };
}
