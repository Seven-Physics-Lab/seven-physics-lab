/* ============================================================================
 * E2-1  Compton Scattering
 * IB Physics E.2 Quantum physics
 *
 * The experiment that made the photon impossible to argue with. A wave bouncing
 * off a free electron comes back at the frequency it went in with — that is
 * what a wave does, and it is what classical physics predicted. Compton found
 * the X-rays coming back LONGER, by an amount that depended only on the angle
 * and not at all on what they had hit or what wavelength they started with.
 *
 * The only way to get that is to treat the light as a particle carrying
 * momentum h/λ and do a collision problem.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does NOT contain Δλ = (h/m_e c)(1 − cos θ). It contains the two
 * conservation laws, and solves them.
 *
 *     momentum      p = p′ + p_e            (as vectors)
 *     energy        E + m_e c² = E′ + √( (p_e c)² + (m_e c²)² )
 *
 * The electron is treated relativistically, because it has to be: a 511 keV
 * photon can hand it a third of its own rest energy, and a classical p²/2m
 * would be wrong by tens of percent. Eliminating p_e between those two lines
 * leaves one equation in E′, which is solved by bisection. Nothing is assumed
 * about the answer.
 *
 * The famous formula is then printed BESIDE the solved value, so the two can be
 * seen to agree. The verification script does the same thing the other way
 * round: it re-solves the conservation laws in Python and checks the formula
 * against them to machine precision, and separately confirms that the solved
 * momenta close the vector triangle and the solved energies balance.
 *
 * WHAT THE PICTURE IS FOR
 *
 * Two things are drawn, and both are drawn to scale.
 *
 *   the collision       the scattered photon and the recoiling electron, at
 *                       the angles the conservation laws give, with every
 *                       arrow's LENGTH in proportion to its momentum. The
 *                       scattered photon's arrow is visibly shorter, and that
 *                       shortening is the whole phenomenon.
 *   the triangle        p, p′ and p_e drawn head to tail. It closes. That is
 *                       not an illustration of momentum conservation, it is
 *                       momentum conservation, and the readouts give the
 *                       residual so you can see how well it closes.
 *
 * WHY COMPTON USED X-RAYS
 *
 * The shift is an ABSOLUTE one: 2.43 pm at ninety degrees whatever you start
 * with. So what matters is the shift as a fraction of the wavelength, and that
 * works out as
 *
 *     Δλ/λ  =  (E/m_e c²)(1 − cos θ)
 *
 * which is a straight line of gradient one on log-log axes. Green light is
 * 2.3 eV, so the fraction is about a millionth and nothing is measurable.
 * Compton's molybdenum Kα X-rays are 17.5 keV, and the fraction is 3.4% —
 * small, but he could see it. The second graph is that line, and the point of
 * it is which end of it an experiment has to sit at.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, carrow, ctext, callout,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HA = 476, HA_SM = 640;
const HG = 330;

/* SI 2019: h, c and e are exact by definition; the electron mass is measured */
const H = 6.62607015e-34;
const C0 = 299792458;
const QE = 1.602176634e-19;
const ME = 9.1093837015e-31;
const MEC2 = ME * C0 * C0;                       // the rest energy, in joules
const LAM_C = H / (ME * C0);                     // the Compton wavelength
const M_CARBON = 1.99442e-26;                    // kg, one carbon atom

/* the photon energy dial runs in decades, because the point of this topic is
 * that six orders of magnitude separate light you can see from light that
 * shows the effect */
const LE_MIN = 0, LE_MAX = 6.8;                  // log10(E / eV)
const NARROW = 720;

/* the two graph frames, named once so the drawing and the tests cannot drift */
const GY_TOP = 5.4e-12;                          // m, the angle graph's ceiling
const WY_LO = -8, WY_HI = 1;                     // log10(dLam/lam), the why graph

/* the one distortion the collision panel takes: the outgoing photon's line is
 * lifted clear of the axis so it cannot hide the arrow that came in. The
 * direction and the length of every arrow stay exact; only the tail moves. */
const LIFT = 11;
const liftFor = th => LIFT + 30 * Math.min(1, Math.max(0, 1 - Math.abs(Math.sin(th)) / 0.35));

/** energy of a photon of wavelength lam (m), and the way back */
export const energyOf = lam => H * C0 / lam;
export const lambdaOf = E => H * C0 / E;

/**
 * The scattered photon's energy, from conservation alone.
 *
 * Eliminating the electron's momentum between
 *     p = p′ + p_e   and   E + m c² = E′ + √((p_e c)² + (m c²)²)
 * leaves
 *     f(E′) = E + m c² − E′ − √(E² + E′² − 2 E E′ cos θ + (m c²)²) = 0
 *
 * Written that way it cannot be solved in double precision at visible-light
 * energies: E is a millionth of a millionth of m c², so both of those
 * subtractions cancel away every significant figure the answer needs, and the
 * shift comes out wrong in the fourth decimal place. So the SAME equation is
 * evaluated for the energy LOST, u = E − E′, using two standard rearrangements
 * that remove the cancellation without removing anything else:
 *
 *     E² + E′² − 2 E E′ cos θ   ≡   u² + 2 E (E − u)(1 − cos θ)
 *     √(m²c⁴ + δ) − m c²        ≡   δ / ( √(m²c⁴ + δ) + m c² )
 *
 * giving  f(u) = u − δ / ( √(m²c⁴ + δ) + m c² ),   δ = u² + 2E(E−u)(1−cos θ).
 *
 * f(0) < 0 ≤ f(E), and f′(u) = 1 − (u − E(1−cos θ))/√(m²c⁴ + δ) > 0 for every
 * θ, so bisection converges to the root without any cleverness and without
 * using the answer. Nothing has been eliminated and no formula assumed; this
 * is energy conservation, arranged so that doubles can carry it.
 */
export function solveLoss(E, theta) {
  const k = 1 - Math.cos(theta);
  if (!(k > 0)) return 0;                        // theta = 0: nothing happens
  const M = MEC2;
  const f = u => {
    const d = u * u + 2 * E * (E - u) * k;
    return u - d / (Math.sqrt(M * M + d) + M);
  };
  let lo = 0, hi = E;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** the scattered photon's energy. The loss is what is solved for; this is the
 *  same answer written the other way round, and loses digits when E ≪ m c². */
export function solveScattered(E, theta) { return E - solveLoss(E, theta); }

/** the textbook formula, kept apart so it can be compared, never used to draw */
export function shiftFormula(theta) { return LAM_C * (1 - Math.cos(theta)); }

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'e2-compton',
    title: 'Compton scattering',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    logE: Math.log10(17490),      // eV — Compton's own molybdenum Kα X-rays
    thDeg: 90,
    mode: 'angle',                // the graph: 'angle' or 'why'
    ann: false, dragging: false,
  };

  const Ein = () => Math.pow(10, st.logE) * QE;          // joules
  const theta = () => st.thDeg / DEG;
  const lamIn = () => lambdaOf(Ein());

  /**
   * Everything about this collision, solved rather than quoted.
   *
   * The energy the photon loses is the quantity that is solved for, and every
   * small difference is then built from it rather than by subtracting two
   * nearly equal large numbers: Δλ = hc·T/(E·E′) rather than λ′ − λ, and the
   * fractional loss is T/E rather than 1 − E′/E. At visible wavelengths those
   * two spellings differ in the fourth significant figure.
   */
  function collide(E = Ein(), th = theta()) {
    const T = solveLoss(E, th);
    const Ep = E - T;
    const lam = lambdaOf(E), lamp = lambdaOf(Ep);
    const dLam = H * C0 * T / (E * Ep);
    /* the electron takes what is left, and its momentum closes the triangle */
    const pix = E / C0, ppx = Ep / C0 * Math.cos(th), ppy = Ep / C0 * Math.sin(th);
    const pex = pix - ppx, pey = -ppy;
    const pe = Math.hypot(pex, pey);
    const phi = pe > 0 ? Math.atan2(-pey, pex) : 0;
    const Etot = T + MEC2;
    const beta = pe * C0 / Etot;
    return {
      E, Ep, T, lam, lamp, dLam, th, frac: T / E,
      p: pix, pp: Ep / C0, pe, phi, beta, gamma: Etot / MEC2,
      /* the two audits: how nearly the laws the answer came from are obeyed.
       * The energy one is written as a difference of squares so that it tests
       * the physics rather than the subtraction: (T + mc²)² − (p_e c)² − (mc²)²
       * is zero exactly when the electron's energy and momentum agree. */
      dP: Math.hypot(pix - (ppx + pex), 0 - (ppy + pey)) / pix,
      dE: Math.abs(Etot * Etot - (pe * C0) ** 2 - MEC2 * MEC2)
           / (Etot * Etot + (pe * C0) ** 2 + MEC2 * MEC2),
    };
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, {
    label: 'A photon scattering off an electron, and the momentum triangle it makes',
  });
  const gv = surface(MW, HG, { label: 'How the wavelength shift depends on angle' });

  /* the panel splits into the collision (cx,cy,cw,ch) and the triangle box
   * (bx,by,bw,bh): side by side when there is room, stacked when there is not */
  const GA = () => {
    const W = av.w, sm = W < NARROW, H = sm ? HA_SM : HA;
    return sm
      ? { W, H, sm,
          cx: 8, cy: 6, cw: W - 16, ch: 316,
          bx: 10, by: 330, bw: W - 20, bh: H - 342 }
      : { W, H, sm,
          cx: 8, cy: 6, cw: Math.round(W * 0.49) - 16, ch: H - 12,
          bx: Math.round(W * 0.51), by: 26, bw: Math.round(W * 0.46), bh: H - 52 };
  };
  const GG = () => {
    const W = gv.w, sm = W < NARROW;
    const x0 = sm ? 52 : 78, x1 = W - (sm ? 18 : 40);
    return { W, sm, x0, x1, yT: 40, yB: HG - 62, ax: HG - 54 };
  };

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'in', label: 'The photon going in' },
    { key: 'cw', label: 'The Compton wavelength, <i>h</i>/<i>m</i><sub>e</sub><i>c</i> — not chosen, computed' },
    { key: 'sh', label: 'The shift, solved from conservation… and what the formula says' },
    { key: 'ou', label: 'The photon coming out' },
    { key: 'fr', label: 'As a fraction of the wavelength it started with' },
    { key: 'el', label: 'The electron: kinetic energy, speed, and <i>γ</i>' },
    { key: 'an', label: 'The recoil angle <i>φ</i>, from the same two laws' },
    { key: 'au', label: 'The audit: how nearly the laws are obeyed by the answer' },
    { key: 'mx', label: 'The most that can ever happen — straight back' },
    { key: 'cl', label: 'What a classical wave would have done' },
    { key: 'at', label: 'And if it bounces off the whole atom instead' },
    { key: 'nr', label: 'Would a non-relativistic electron have done?' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sTh = slider({ label: '<i>θ</i>', min: 0, max: 180, step: 1, value: st.thDeg,
    format: v => `${v.toFixed(0)}°`, onInput: v => { st.thDeg = v; render(); } });
  const sE = slider({ label: '<i>E</i>', min: LE_MIN, max: LE_MAX, step: 0.01, value: st.logE,
    format: v => evWords(Math.pow(10, v) * QE),
    onInput: v => { st.logE = v; render(); } });

  const preset = (eV, label) => button({ label, onClick: () => {
    st.logE = Math.log10(eV); sE.set(st.logE); render();
  } });
  const presets = [
    preset(2.25, 'green light'),
    preset(17490, 'Compton’s X-rays'),
    preset(511000, 'annihilation, 511 keV'),
    preset(1250000, 'cobalt-60 gamma'),
  ];

  const bMode = button({ label: 'Why X-rays and not light', pressed: false, onClick: b => {
    st.mode = st.mode === 'angle' ? 'why' : 'angle';
    b.textContent = st.mode === 'angle' ? 'Why X-rays and not light' : 'Back to the angle';
    b.setAttribute('aria-pressed', String(st.mode === 'why'));
    render();
  } });
  const bBack = button({ label: 'Straight back, θ = 180°', onClick: () => {
    st.thDeg = 180; sTh.set(180); render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Compton Scattering',
            'nothing here uses Δ<i>λ</i> = (<i>h</i>/<i>m</i><sub>e</sub><i>c</i>)(1 − cos <i>θ</i>) ' +
            '— the two conservation laws are solved, and the formula is checked against them'),
    controls([el('div', { class: 'ibs-btns' }, presets.map(p => p.node))], { label: 'try:' }),
    panelBox('The collision, and the momentum triangle — both to scale', av.el),
    panelBox('The shift', gv.el),
    controls([el('div', { class: 'ibs-btns' }, [bMode.node, bBack.node, bAnn.node])]),
    controls([sE.node, sTh.node]),
    out.node,
    note('<b>Why this experiment settled it.</b> A classical wave shaken loose from an electron ' +
         're-radiates at the frequency that shook it, so the scattered X-rays should come back ' +
         'at exactly the wavelength they went in with. They do not. They come back longer, by an ' +
         'amount that depends on the angle and on nothing else — not on the wavelength, not on ' +
         'the target. The only way to produce that is to treat the light as a particle with ' +
         'energy <i>hf</i> and momentum <i>h</i>/<i>λ</i> and do a collision problem, and when ' +
         'you do, the shift comes out as <b>Δ<i>λ</i> = (<i>h</i>/<i>m</i><sub>e</sub><i>c</i>)' +
         '(1 − cos<i>θ</i>)</b>. <b>Three things worth noticing.</b> The shift is ' +
         '<i>absolute</i>, so what matters is how big it is compared with the wavelength you ' +
         'started with — press <b>why X-rays and not light</b> and you will see that visible ' +
         'light gives a shift of about a millionth, which is why nobody found this with a lamp. ' +
         'The electron has to be treated <i>relativistically</i>: at these energies it leaves at ' +
         'a good fraction of the speed of light, and the readouts show what a Newtonian ' +
         'treatment would have got wrong. And in Compton’s own data there are <b>two</b> peaks ' +
         'at each angle — a shifted one from the loosely bound electrons, and an unshifted one ' +
         'from photons that bounced off a whole atom instead. The readout works that second one ' +
         'out: the atom is twenty thousand times heavier, so its Compton wavelength, and its ' +
         'shift, are twenty thousand times smaller and quite unmeasurable.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /** an energy in the units a person would say it in */
  /* a function declaration, not a const: the energy slider formats its own
   * starting value while it is being built, which is before this line runs */
  function sig4(x) { return x >= 100 ? fmt(x, 1) : x >= 10 ? fmt(x, 2) : fmt(x, 3); }
  function evWords(J) {
    const eV = J / QE;
    if (eV >= 1e6) return `${sig4(eV / 1e6)} MeV`;
    if (eV >= 1e3) return `${sig4(eV / 1e3)} keV`;
    if (eV >= 1) return `${sig4(eV)} eV`;
    if (eV >= 1e-3) return `${sig4(eV * 1e3)} meV`;
    if (eV > 0) return `${sig4(eV * 1e6)} \u00b5eV`;
    return '0';
  }
  /** a length in the units a person would say it in */
  function mWords(m) {
    if (m >= 1e-6) return `${fmt(m * 1e6, 3)} µm`;
    if (m >= 1e-9) return `${fmt(m * 1e9, 4)} nm`;
    return `${fmt(m * 1e12, 4)} pm`;
  }

  /**
   * How far the three arrows reach, in momentum units, over EVERY angle at
   * this energy. The drawing is scaled to this rather than to the current
   * angle, so dragging θ moves the arrows without the ruler underneath them
   * changing — and nothing can ever leave the panel.
   */
  let exCache = null, exKey = -1;
  function extents(E) {
    if (exCache && exKey === E) return exCache;
    let L = 0, R = 0, U = 0, D = 0;
    for (let d = 0; d <= 180; d += 2) {
      const s = collide(E, d / DEG);
      const xs = [-s.p, s.pp * Math.cos(s.th), s.pe * Math.cos(s.phi)];
      const ys = [0, -s.pp * Math.sin(s.th), s.pe * Math.sin(s.phi)];
      for (let i = 0; i < 3; i++) {
        L = Math.max(L, -xs[i]); R = Math.max(R, xs[i]);
        U = Math.max(U, -ys[i]); D = Math.max(D, ys[i]);
      }
    }
    exKey = E; exCache = { L, R, U, D };
    return exCache;
  }

  /** keep a label inside the region it belongs to, whatever it is anchored on */
  function clampX(ctx, str, x, font, align, lo, hi) {
    ctx.save(); ctx.font = font; const w = ctx.measureText(str).width; ctx.restore();
    if (align === 'right') return clamp(x, lo + w, hi);
    if (align === 'center') return clamp(x, lo + w / 2, hi - w / 2);
    return clamp(x, lo, hi - w);
  }

  /**
   * Where the three arrows actually go. One function, called by the drawing and
   * by the test surface, so what is checked is what is on the screen.
   */
  function layoutA(g, s) {
    const ex = extents(s.E);
    /* mT has to clear the caption AND the label that sits above the scattered
     * photon's tip, because at ninety degrees that tip is the highest thing on
     * the panel and the fit puts it exactly on this margin */
    const mX = 16, mT = 54, mB = 34;
    /* the top margin carries three things: the caption, the label that rides
     * above the scattered photon's tip, and the lift itself, which moves that
     * tip higher than the fit would otherwise put it. At the angles where the
     * lift grows beyond LIFT the photon is nearly horizontal and its tip is
     * nowhere near the top, so LIFT is the bound that matters. */
    const availW = g.cw - 2 * mX, availH = g.ch - mT - LIFT - mB;
    const L = Math.min(availW / (ex.L + ex.R), availH / Math.max(ex.U + ex.D, 1e-30));
    const cW = (ex.L + ex.R) * L, cH = (ex.U + ex.D) * L;
    const ox = Math.round(g.cx + mX + (availW - cW) / 2 + ex.L * L);
    const oy = Math.round(g.cy + mT + LIFT + (availH - cH) / 2 + ex.U * L);
    const lift = liftFor(s.th);
    return {
      ox, oy, L, lift, ex,
      capY: g.cy + 15,
      tin: [ox - s.p * L, oy],
      tout: [ox + Math.cos(s.th) * s.pp * L, oy - lift - Math.sin(s.th) * s.pp * L],
      tel: [ox + Math.cos(s.phi) * s.pe * L, oy + Math.sin(s.phi) * s.pe * L],
    };
  }

  /* the geometry of the last collision drawn, for the pointer */
  let AG = { ox: 0, oy: 0, L: 1 };

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    const s = collide();
    const th = s.th, phi = s.phi;

    /* ---- the collision. Arrow lengths are momenta, on one common scale, so
     * the scattered photon's arrow is shorter by exactly the fraction of
     * momentum it lost. ---- */
    const A = layoutA(g, s);
    const ox = A.ox, oy = A.oy, L = A.L, ex = A.ex;
    AG = { ox, oy, L };
    const lo = g.cx + 4, hi = g.cx + g.cw - 4;
    const F = `600 12px ${P.font}`;

    /* the axis the angles are measured from */
    ctx.save();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(ox - ex.L * L - 10, oy); ctx.lineTo(ox + ex.R * L + 14, oy); ctx.stroke();
    ctx.restore();

    /* in */
    const li = s.p * L;
    carrow(ctx, ox - li, oy, ox - 9, oy, { color: P.accent, width: 3.4, head: 12 });
    const sIn = `${g.sm ? 'in' : 'photon in'} · ${evWords(s.E)}`;
    /* when the photon scatters backwards its shaft passes over the space above
     * the incoming arrow's tail, so the label backs away from it */
    const back = Math.cos(th) < -0.1;
    ctext(ctx, sIn,
      clampX(ctx, sIn, back ? ox - 16 : ox - li, F, back ? 'right' : 'left', lo, hi),
      oy - 13,
      { font: F, color: P.accent, align: back ? 'right' : 'left',
        halo: P.bg, haloWidth: 4 });

    /* the electron, before */
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(ox, oy, 5.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.8; ctx.stroke();
    ctext(ctx, 'electron, at rest', ox - 9, oy + 21,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right',
        halo: P.bg, haloWidth: 4 });

    /* out: the photon, at the scattering angle, shorter by p′/p. Its line is
     * lifted clear of the axis by a fixed few pixels so that at θ near 0 and
     * near 180 it does not hide the arrow that came in. The direction and the
     * length are exact; only the tail has been moved. */
    const lp = s.pp * L;
    const dxp = Math.cos(th), dyp = -Math.sin(th);
    const py0 = oy - A.lift;
    carrow(ctx, ox + dxp * 9, py0 + dyp * 9, ox + dxp * lp, py0 + dyp * lp,
      { color: P.accent, width: 3.4, head: 12 });
    const sOut = `${g.sm ? 'out' : 'photon out'} · ${evWords(s.Ep)}`;
    const aOut = dxp < -0.1 ? 'right' : 'left';
    ctext(ctx, sOut,
      clampX(ctx, sOut, ox + dxp * (lp + 12), F, aOut, lo, hi),
      py0 + dyp * (lp + 12) + (dyp < -0.15 ? -6 : dyp > 0.15 ? 16 : -10),
      { font: F, color: P.accent, align: aOut, halo: P.bg, haloWidth: 4 });

    /* out: the electron */
    const le = s.pe * L;
    const dxe = Math.cos(phi), dye = Math.sin(phi);
    if (le > 3) {
      carrow(ctx, ox + dxe * 9, oy + dye * 9, ox + dxe * le, oy + dye * le,
        { color: P.text, width: 3.4, head: 12 });
      const sEl = `electron · ${evWords(s.T)}`;
      const aEl = dxe < -0.1 ? 'right' : 'left';
      ctext(ctx, sEl,
        clampX(ctx, sEl, ox + dxe * (le + 12), F, aEl, lo, hi),
        oy + dye * (le + 12) + 15,
        { font: F, color: P.text, align: aEl, halo: P.bg, haloWidth: 4 });
    }

    /* the angles, as arcs off the forward direction */
    const rA = clamp(lp * 0.42, 22, 46);
    if (th > 0.06) arc(ctx, ox, oy, rA, 0, -th, P.accent, 'θ');
    /* the recoil arc stays inside the recoil arrow, so its label cannot land on
     * top of the arrow's own label when the electron barely moves */
    const rB = Math.min(rA + 19, le * 0.55);
    if (le > 3 && phi > 0.06 && rB > 14) arc(ctx, ox, oy, rB, 0, phi, P.text, 'φ');

    /* the one liberty this panel takes, said out loud */
    ctext(ctx, g.sm
      ? 'arrow lengths are momenta, to one scale'
      : 'arrow lengths are momenta, to one scale — the outgoing photon is lifted '
        + 'clear of the axis so it cannot hide the one coming in',
      g.cx + 6, g.cy + 15, { font: `500 11px ${P.font}`, color: P.muted });

    drawTriangle(ctx, g, s);

    if (st.ann) {
      callout(ctx, ['The scattered arrow is shorter because the photon',
                    'gave momentum away. A wave cannot do that —',
                    'it has no momentum to give, and comes back',
                    'at the wavelength it arrived with.'],
        g.sm ? 12 : 14, g.sm ? 10 : 10, ox + dxp * lp * 0.6, py0 + dyp * lp * 0.6,
        { palette: P });
    }
  }

  /**
   * p = p′ + p_e, head to tail, to scale.
   *
   * When θ is near 0 or 180 the three vectors are collinear and a "triangle"
   * would be three arrows on top of one another, so the sum is then drawn as
   * two rows — p along the top, p′ followed by p_e along the bottom — tied at
   * both ends by dashed lines. That is the same statement; it is just legible.
   */
  function drawTriangle(ctx, g, s) {
    const bx = g.bx, by = g.by, bw = g.bw, bh = g.bh;
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    ctext(ctx, 'the same three momenta, head to tail — and it closes',
      bx + 10, by + 18, { font: `600 11.5px ${P.font}`, color: P.muted });

    const pName = `p = ${sci(s.p, 3)} N s`;
    const ppx = s.pp * Math.cos(s.th), ppy = -s.pp * Math.sin(s.th);
    const flat = Math.abs(ppy) < 0.09 * s.p;

    if (flat) {
      /* two rows. The row spans from min(0, ppx) to p; fit that to the box. */
      const left = Math.min(0, ppx), right = Math.max(s.p, ppx);
      const pad = 34, gap = Math.min(58, (bh - 58) / 2);
      const sc = (bw - 2 * pad) / (right - left);
      const X = q => bx + pad + (q - left) * sc;
      const yTop = by + (bh - gap) / 2, yBot = yTop + gap;

      ctx.save();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(0), yTop - 9); ctx.lineTo(X(0), yBot + 9);
      ctx.moveTo(X(s.p), yTop - 9); ctx.lineTo(X(s.p), yBot + 9);
      ctx.stroke(); ctx.restore();

      carrow(ctx, X(0), yTop, X(s.p), yTop, { color: P.accent, width: 3, head: 11 });
      ctext(ctx, pName, (X(0) + X(s.p)) / 2, yTop - 10,
        { font: P.sym(12), color: P.accent, align: 'center', halo: P.bg, haloWidth: 4 });

      carrow(ctx, X(0), yBot, X(ppx), yBot, { color: P.accent, width: 3, head: 11 });
      ctext(ctx, 'p′', (X(0) + X(ppx)) / 2, yBot + 20,
        { font: P.sym(13), color: P.accent, align: 'center', halo: P.bg, haloWidth: 4 });
      if (carrow(ctx, X(ppx), yBot, X(s.p), yBot, { color: P.text, width: 3, head: 11 })) {
        ctext(ctx, 'pₑ', (X(ppx) + X(s.p)) / 2, yBot + 20,
          { font: P.sym(13), color: P.text, align: 'center', halo: P.bg, haloWidth: 4 });
      }
      ctext(ctx, s.th > Math.PI / 2
        ? 'straight back: the photon’s momentum reverses, so the electron takes more than the photon brought'
        : 'straight on: nothing is exchanged',
        bx + bw / 2, by + bh - 12,
        { font: `500 11px ${P.font}`, color: P.muted, align: 'center' });
      return;
    }

    const A = [0, 0], B = [s.p, 0], Cc = [ppx, ppy];
    const pts = [A, B, Cc];
    let mnx = 1e30, mxx = -1e30, mny = 1e30, mxy = -1e30;
    for (const q of pts) {
      mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]);
      mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]);
    }
    const pad = 46;
    const sc = Math.min((bw - 2 * pad) / Math.max(mxx - mnx, 1e-30),
                        (bh - 2 * pad) / Math.max(mxy - mny, 1e-30));
    const X = q => bx + pad + (q[0] - mnx) * sc + ((bw - 2 * pad) - (mxx - mnx) * sc) / 2;
    const Y = q => by + pad + (q[1] - mny) * sc + ((bh - 2 * pad) - (mxy - mny) * sc) / 2;

    carrow(ctx, X(A), Y(A), X(B), Y(B), { color: P.accent, width: 3, head: 11 });
    ctext(ctx, pName, (X(A) + X(B)) / 2, Y(A) + 20,
      { font: P.sym(12), color: P.accent, align: 'center', halo: P.bg, haloWidth: 4 });
    carrow(ctx, X(A), Y(A), X(Cc), Y(Cc), { color: P.accent, width: 3, head: 11 });
    ctext(ctx, 'p′', (X(A) + X(Cc)) / 2 - 13, (Y(A) + Y(Cc)) / 2 - 7,
      { font: P.sym(13), color: P.accent, halo: P.bg, haloWidth: 4 });
    carrow(ctx, X(Cc), Y(Cc), X(B), Y(B), { color: P.text, width: 3, head: 11 });
    ctext(ctx, 'pₑ', (X(Cc) + X(B)) / 2 + 9, (Y(Cc) + Y(B)) / 2 - 7,
      { font: P.sym(13), color: P.text, halo: P.bg, haloWidth: 4 });
  }

  function arc(ctx, ox, oy, r, from, to, color, label) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(ox, oy, r, Math.min(from, to), Math.max(from, to), false);
    ctx.stroke();
    ctx.restore();
    const mid = (from + to) / 2;
    ctext(ctx, label, ox + Math.cos(mid) * (r + 14), oy + Math.sin(mid) * (r + 14) + 4,
      { font: P.sym(13), color, align: 'center', halo: P.bg, haloWidth: 4 });
  }

  /* ---------------------------------------------------------- the graph */

  function drawG() {
    const ctx = gv.ctx, g = GG(), W = g.W;
    ctx.clearRect(0, 0, W, HG);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HG);
    if (st.mode === 'angle') drawAngleGraph(ctx, g); else drawWhyGraph(ctx, g);
  }

  const angleMap = g => ({
    X: d => g.x0 + d / 180 * (g.x1 - g.x0),
    Y: v => g.yB - v / GY_TOP * (g.yB - g.yT),
  });
  const whyMap = g => ({
    X: le => g.x0 + (le - LE_MIN) / (LE_MAX - LE_MIN) * (g.x1 - g.x0),
    Y: ly => g.yB - (ly - WY_LO) / (WY_HI - WY_LO) * (g.yB - g.yT),
  });

  function drawAngleGraph(ctx, g) {
    const { X, Y } = angleMap(g);

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, g.yT + 0.5, g.x1 - g.x0, g.yB - g.yT);

    /* the ceiling: twice the Compton wavelength, and there is nothing above it */
    ctx.save();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(g.x0, Y(2 * LAM_C)); ctx.lineTo(g.x1, Y(2 * LAM_C)); ctx.stroke();
    ctx.restore();
    ctext(ctx, g.sm ? `2h/mₑc = ${fmt(2 * LAM_C * 1e12, 3)} pm`
                    : `2h/mₑc = ${fmt(2 * LAM_C * 1e12, 4)} pm — no collision can shift it further`,
      g.x0 + 8, Y(2 * LAM_C) + 15,
      { font: `500 11px ${P.font}`, color: P.muted });

    /* the curve, from the solved collisions and not from the formula */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const s = collide(Ein(), i / DEG);
      i ? ctx.lineTo(X(i), Y(s.dLam)) : ctx.moveTo(X(i), Y(s.dLam));
    }
    ctx.stroke();
    ctext(ctx, g.sm ? 'solved from conservation'
                    : 'the shift, solved from conservation at every angle',
      g.x0 + 8, g.yT - 8, { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the formula, over the top of it, so they can be seen to coincide */
    ctx.save();
    ctx.setLineDash([7, 6]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const d = shiftFormula(i / DEG);
      i ? ctx.lineTo(X(i), Y(d)) : ctx.moveTo(X(i), Y(d));
    }
    ctx.stroke(); ctx.restore();
    ctext(ctx, g.sm ? 'dashed: the formula'
                    : 'dashed: (h/mₑc)(1 − cos θ) — it lies on top',
      g.x1 - 8, g.yT - 8, { font: `600 11.5px ${P.font}`, color: P.text, align: 'right' });

    /* axes */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, g.ax); ctx.lineTo(g.x1, g.ax); ctx.stroke();
    for (let d = 0; d <= 180; d += 30) {
      ctx.beginPath(); ctx.moveTo(X(d), g.ax); ctx.lineTo(X(d), g.ax + 5); ctx.stroke();
      ctext(ctx, `${d}°`, X(d), g.ax + 16,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, 'scattering angle θ', g.x1, g.ax + 32,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    for (let v = 0; v <= 5; v++) {
      const y = Y(v * 1e-12);
      ctext(ctx, `${v}`, g.x0 - 8, y + 4,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
      if (v > 0) {
        ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
        ctx.restore();
      }
    }
    ctext(ctx, 'Δλ / pm', g.x0 - 8, g.yT - 8,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* where we are */
    const s = collide();
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(X(st.thDeg), g.yT); ctx.lineTo(X(st.thDeg), g.ax); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(X(st.thDeg), Y(s.dLam), 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
  }

  function drawWhyGraph(ctx, g) {
    /* Δλ/λ = (E/m c²)(1 − cos θ): a straight line of gradient one, on log-log.
     * The whole argument for using X-rays is which decade you have to be in. */
    const xa = LE_MIN, xb = LE_MAX;                    // log10(E/eV)
    const ya = WY_LO, yb = WY_HI;                      // log10(Δλ/λ)
    const { X, Y } = whyMap(g);

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, g.yT + 0.5, g.x1 - g.x0, g.yB - g.yT);

    /* the bands an experimenter actually has, as a ribbon along the top rather
     * than a wash over the whole plot — a wash hides the grid and the curve */
    const bands = [[Math.log10(1.65), Math.log10(3.26), 'visible'],
                   [2, 5, 'X-rays'], [5, LE_MAX, 'gamma']];
    const rT = g.yT + 1, rH = 17;
    bands.forEach(([a, b, name], i) => {
      ctx.save();
      ctx.globalAlpha = i % 2 ? 0.10 : 0.18; ctx.fillStyle = P.accent;
      ctx.fillRect(X(a), rT, X(b) - X(a), rH);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = P.accent; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(a) + 0.5, rT); ctx.lineTo(X(a) + 0.5, rT + rH);
      ctx.moveTo(X(b) - 0.5, rT); ctx.lineTo(X(b) - 0.5, rT + rH);
      ctx.stroke(); ctx.restore();
      ctext(ctx, name, (X(a) + X(b)) / 2, rT + 12.5,
        { font: `600 11px ${P.font}`, color: P.accent, align: 'center' });
    });

    /* one per cent, which is about what you can see on a photographic plate */
    ctx.save();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(g.x0, Y(-2)); ctx.lineTo(g.x1, Y(-2)); ctx.stroke();
    ctx.restore();
    ctext(ctx, g.sm ? 'one per cent'
                    : 'one per cent — about the least you could have measured in 1923',
      g.x0 + 8, Y(-2) - 7,
      { font: `500 11px ${P.font}`, color: P.muted, halo: P.bg, haloWidth: 4 });

    /* the line itself, at this scattering angle, from the solved collisions */
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x0, g.yT, g.x1 - g.x0, g.yB - g.yT); ctx.clip();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    let first = true;
    for (let i = 0; i <= 220; i++) {
      const le = xa + (xb - xa) * i / 220;
      const s = collide(Math.pow(10, le) * QE, theta());
      const f = s.dLam / s.lam;
      if (!(f > 0)) continue;
      const px = X(le), py = Y(Math.log10(f));
      first ? (ctx.moveTo(px, py), first = false) : ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.restore();
    ctext(ctx, `Δλ as a fraction of λ, at θ = ${st.thDeg}°`, g.x0 + 8, g.yT - 8,
      { font: `600 11.5px ${P.font}`, color: P.accent });

    /* axes */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, g.ax); ctx.lineTo(g.x1, g.ax); ctx.stroke();
    const names = { 0: '1 eV', 1: '10 eV', 2: '100 eV', 3: '1 keV', 4: '10 keV',
                    5: '100 keV', 6: '1 MeV' };
    for (let d = 0; d <= 6; d++) {
      ctx.beginPath(); ctx.moveTo(X(d), g.ax); ctx.lineTo(X(d), g.ax + 5); ctx.stroke();
      ctext(ctx, names[d], X(d), g.ax + 16,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, 'energy of the photon going in', g.x1, g.ax + 32,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    for (let ly = ya; ly <= yb; ly += 1) {
      const y = Y(ly);
      ctext(ctx, ly === 0 ? '1' : `10${sup(ly)}`, g.x0 - 8, y + 4,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
      ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
      ctx.restore();
    }
    ctext(ctx, 'Δλ / λ', g.x0 - 8, g.yT - 8,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* where we are */
    const s = collide();
    const f = s.dLam / s.lam;
    if (f > 0) {
      const px = X(st.logE), py = Y(clamp(Math.log10(f), ya, yb));
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px, g.yT + 20); ctx.lineTo(px, g.ax); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }

  const SUPS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴',
                 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = n => String(n).split('').map(c => SUPS[c] ?? c).join('');

  /* ================================================================== *
   * dragging the angle on the top panel
   * ================================================================== */

  const fromPointer = e => {
    const p = av.at(e);
    const a = Math.atan2(-(p.y - AG.oy), p.x - AG.ox);
    st.thDeg = clamp(Math.round(Math.abs(a) * DEG), 0, 180);
    sTh.set(st.thDeg);
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
   * the readouts
   * ================================================================== */

  function render() {
    drawA(); drawG();

    const s = collide();
    const back = collide(Ein(), Math.PI);
    const fromFormula = shiftFormula(s.th);
    /* what a Newtonian electron would have given: same momentum triangle, but
     * T = p²/2m instead of the relativistic energy */
    const nrT = s.pe * s.pe / (2 * ME);
    const atomShift = (H / (M_CARBON * C0)) * (1 - Math.cos(s.th));

    out.setAll({
      in: `${evWords(s.E)},  λ = ${mWords(s.lam)}`,
      cw: `h/mₑc = ${fmt(LAM_C * 1e12, 5)} pm, and mₑc² = ${fmt(MEC2 / QE / 1e3, 3)} keV — ` +
          'both of them straight out of h, c and the electron mass',
      sh: `solved: ${fmt(s.dLam * 1e12, 6)} pm.  Formula: ${fmt(fromFormula * 1e12, 6)} pm.  ` +
          `They differ by ${fmt(Math.abs(s.dLam - fromFormula) / Math.max(fromFormula, 1e-30) * 100, 8)}%`,
      ou: `${evWords(s.Ep)},  λ′ = ${mWords(s.lamp)} — it has lost ` +
          `${fmt(s.frac * 100, 3)}% of its energy`,
      fr: `Δλ/λ = ${s.dLam / s.lam < 1e-4 ? (s.dLam / s.lam).toExponential(3)
                                          : fmt(s.dLam / s.lam * 100, 3) + '%'}` +
          (s.dLam / s.lam < 1e-2
            ? ' — too small to have been measured with a photographic plate'
            : ' — comfortably measurable'),
      el: `${evWords(s.T)},  v = ${fmt(s.beta, 4)}c,  γ = ${fmt(s.gamma, 4)}`,
      an: s.pe > 0 ? `${fmt(s.phi * DEG, 2)}° below the line, on the other side of it from ` +
                     'the photon — because the sideways momenta have to cancel'
                   : 'nothing recoils: at θ = 0 the photon carries straight on',
      au: `momentum closes to ${s.dP.toExponential(2)} of itself, energy to ` +
          `${s.dE.toExponential(2)} — that is the arithmetic, not a tolerance`,
      mx: `at 180° the shift is 2h/mₑc = ${fmt(2 * LAM_C * 1e12, 4)} pm and the photon keeps ` +
          `${fmt((1 - back.frac) * 100, 2)}% of its energy, handing the electron ` +
          `${evWords(back.T)}`,
      cl: 'Δλ = 0. A wave shakes the electron at its own frequency and the electron ' +
          're-radiates at that frequency. There is no angle at which a wave comes back longer',
      at: `${fmt(atomShift * 1e12, 6)} pm — ${fmt(M_CARBON / ME, 0)} times smaller, because ` +
          'the whole carbon atom is that much heavier. That is the unshifted peak in ' +
          'Compton’s data, sitting beside the shifted one',
      nr: `it would have given the electron ${evWords(nrT)} instead of ${evWords(s.T)}, ` +
          `wrong by ${fmt(Math.abs(nrT - s.T) / Math.max(s.T, 1e-30) * 100, 2)}%` +
          (s.beta > 0.1 ? ' — at this speed a Newtonian electron is not an option' : ''),
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(av.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      av.setLogical(w, w < NARROW ? HA_SM : HA);
      gv.setLogical(w, HG);
    }
    av.fit(); gv.fit();
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

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => { Object.assign(st, p); sTh.set(st.thDeg); sE.set(st.logE); render(); },
    _state: () => {
      const s = collide();
      return { logE: st.logE, thDeg: st.thDeg, mode: st.mode, ...s };
    },
    _collide: (Eev, thDeg) => collide(Eev * QE, thDeg / DEG),
    _solve: (Eev, thDeg) => solveScattered(Eev * QE, thDeg / DEG),
    _loss: (Eev, thDeg) => solveLoss(Eev * QE, thDeg / DEG),
    _formula: thDeg => shiftFormula(thDeg / DEG),

    /** where the three arrows are actually drawn, and the room they have */
    _geomA: () => {
      const g = GA(), A = layoutA(g, collide());
      return { sm: g.sm, W: g.W, H: g.H,
               region: { x: g.cx, y: g.cy, w: g.cw, h: g.ch },
               box: { x: g.bx, y: g.by, w: g.bw, h: g.bh },
               ox: A.ox, oy: A.oy, L: A.L, lift: A.lift, capY: A.capY,
               tin: A.tin, tout: A.tout, tel: A.tel };
    },
    /** the pixel the graph puts the current state at, through the map it draws with */
    _geomG: () => {
      const g = GG(), s = collide();
      if (st.mode === 'angle') {
        const m = angleMap(g);
        return { mode: 'angle', ...g, top: GY_TOP,
                 px: m.X(st.thDeg), py: m.Y(s.dLam),
                 yOfTop: m.Y(GY_TOP), yOfZero: m.Y(0), xOf0: m.X(0), xOf180: m.X(180) };
      }
      const m = whyMap(g);
      const f = s.dLam / s.lam;
      return { mode: 'why', ...g, lo: WY_LO, hi: WY_HI,
               px: m.X(st.logE), py: m.Y(Math.log10(f)),
               yOfLo: m.Y(WY_LO), yOfHi: m.Y(WY_HI),
               xOfMin: m.X(LE_MIN), xOfMax: m.X(LE_MAX) };
    },
    _consts: () => ({ H, C0, QE, ME, MEC2, LAM_C, M_CARBON,
                      LE_MIN, LE_MAX, MW, HA, HA_SM, HG, LIFT, GY_TOP, WY_LO, WY_HI,
                      ...(() => { const g = GA(); return { W: g.W, aH: g.H, sm: g.sm,
                                                          cx: g.cx, cw: g.cw, ch: g.ch,
                                                          bx: g.bx, bw: g.bw, bh: g.bh,
                                                          ox: AG.ox, oy: AG.oy,
                                                          pxPerNs: AG.L }; })() }),
  };
}
