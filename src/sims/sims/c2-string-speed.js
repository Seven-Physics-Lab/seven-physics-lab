/* ============================================================================
 * C2-2  Wave Speed on a String   (Melde's experiment)
 * IB Physics C.2 Wave Model  /  C.4 Standing Waves
 *
 * A vibrator shakes one end of a string; the other end runs over a pulley and
 * carries a hanging mass. The mass sets the tension, the tension sets the
 * speed, and at the right frequencies the string breaks into loops. It is the
 * cheapest experiment in the wave course and the one that ties the whole topic
 * together: v = √(T/μ) is the mechanics, v = fλ is the wave model, and
 * L = nλ/2 is the standing wave, and all three have to agree on one number.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS ASSUMED
 *
 * The string is driven, not free. Newton's second law on an element of a
 * string under tension T, with mass per unit length μ and a drag force b per
 * unit length proportional to the transverse speed, is
 *
 *     μ ÿ = T y″ − b ẏ
 *
 * Looking for y ∝ e^{i(kx − ωt)} gives
 *
 *     k² = ω²/v² + i ω b / T ,      v = √(T/μ)
 *
 * so for light damping the wavenumber picks up a small imaginary part,
 *
 *     k ≈ ω/v + iα ,      α = b / (2 μ v)
 *
 * The string is driven at x = 0 with amplitude A₀ and tied down at x = L, so
 *
 *     y(x) = A₀ · sin( k (L − x) ) / sin( k L )
 *
 * and because |sin(a + ib)|² = sin²a + sinh²b, the amplitude at a point is
 *
 *     |y(x)| = A₀ √( sin²(kᵣ(L−x)) + sinh²(α(L−x)) )
 *              ───────────────────────────────────────
 *                    √( sin²(kᵣL)  + sinh²(αL) )
 *
 * Nothing about the loops is drawn by hand. They are what that expression does
 * when kᵣL passes through a multiple of π.
 *
 * THREE THINGS THAT FALL OUT OF IT RATHER THAN BEING ASSERTED
 *
 *   · The resonances sit exactly at f_n = n v / 2L, because in this model α
 *     does not depend on frequency, so the denominator is smallest exactly
 *     where sin(kᵣL) = 0.
 *   · The nodes are not quite still. A driven damped string cannot have a true
 *     node anywhere except the fixed end: the quietest points move by about
 *     αL of an antinode, and the sim reports that number.
 *   · The vibrator's own end is a node only by courtesy. It moves by A₀, which
 *     is 1/gain of an antinode — which is exactly why the experiment can treat
 *     it as one and use L = nλ/2.
 *
 * THE DRAG MODEL, DECLARED
 *
 * b is taken proportional to the string's diameter — more surface, more air
 * pushed — with one constant for all three strings, which are all nylon. Two
 * consequences worth knowing about. Because a fatter string is heavier as the
 * square of its diameter but drags as the first power, d·v = 2√(T/πρ) is the
 * same for every string, and the sharpness αL = C L / √(πρT) then depends on
 * the LENGTH and the TENSION and not at all on which string is strung. And
 * because the drag is taken proportional to speed alone, every resonance comes
 * out equally sharp; a real string loses a little more at high frequency, so
 * in practice the higher loops are slightly weaker than they are here.
 *
 * ---------------------------------------------------------------------------
 * THE MEASUREMENT
 *
 * Tuning to a resonance and counting the loops gives the speed twice over:
 *
 *     from the pattern      v = 2 L f / n
 *     from the apparatus    v = √(T/μ)
 *
 * and squaring the first and plotting it against T = Mg gives a straight line
 * through the origin of gradient 1/μ. So a set of hanging masses and a ruler
 * weigh the string. The graph panel records what you actually set, not what
 * you should have set, so a reading taken slightly off resonance lands off the
 * line — which is the real lesson of the practical.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider, select,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout, Plot,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;
const HA = 300;                     // the bench
const HR = 270;                     // the response curve
const HG = 300;                     // the v² against T graph

const G = 9.81;
const RHO_S = 1150;                 // kg m⁻³, nylon
const DRAG = 6.0;                   // N s m⁻³ — drag per unit length per unit
                                    // velocity per unit diameter (declared)
const A0_MM = 0.40;                 // the vibrator's own amplitude
const EXAG = 6;                     // sideways magnification, declared

const STRINGS = [
  { key: 'thin',  name: 'thin',   mu: 0.5e-3 },
  { key: 'med',   name: 'medium', mu: 1.2e-3 },
  { key: 'thick', name: 'thick',  mu: 3.0e-3 },
];

const M_MIN = 50, M_MAX = 500;      // g on the hanger
const MASSES = [50, 100, 150, 200, 250, 300, 400, 500];
const L_MIN = 0.40, L_MAX = 1.20;   // m, vibrator to pulley
const F_MIN = 10, F_MAX = 130;      // Hz

const PPM = 760;                    // px per metre along the bench
const NARROW = 720;

/** a round number at or above v, so an axis never reads 987 or 17.5 */
function niceTop(v) {
  if (!(v > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) if (m * e >= v - 1e-12) return m * e;
  return 10 * e;
}

/** the speed of a transverse wave on a string: v = √(T/μ) */
export function speedOf(T, mu) { return Math.sqrt(T / mu); }

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c2-string-speed',
    title: 'Wave speed on a string',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    str: 'med', mMg: 200, fHz: 40, L: 0.90,
    t: 0, playing: true, env: true, ann: false, dragging: false,
    data: [],                        // [{T, v, f, n, mMg, mu}]
  };

  const S = () => STRINGS.find(s => s.key === st.str);
  const muOf = () => S().mu;
  const dOf = () => Math.sqrt(4 * muOf() / (Math.PI * RHO_S));   // m, diameter
  const Tof = () => st.mMg * 1e-3 * G;                           // N
  const vOf = () => speedOf(Tof(), muOf());                      // m/s
  const bOf = () => DRAG * dOf();
  const alphaOf = () => bOf() / (2 * muOf() * vOf());            // per metre
  const lamOf = () => vOf() / st.fHz;
  /** the resonant frequencies, f_n = n v / 2L */
  const fOfN = n => n * vOf() / (2 * st.L);
  const nNear = () => Math.max(1, Math.round(2 * st.L * st.fHz / vOf()));

  /* ---------------------------------------------------------- the model */

  /**
   * |sin(k(L−x))| / |sin(kL)| — the shape of a driven, damped string, as an
   * amplitude. In units of the vibrator's own amplitude.
   */
  function envelopeAt(x, f = st.fHz) {
    const kr = TAU * f / vOf(), a = alphaOf(), u = st.L - x;
    const num = Math.hypot(Math.sin(kr * u), Math.sinh(a * u));
    const den = Math.hypot(Math.sin(kr * st.L), Math.sinh(a * st.L));
    return den > 0 ? num / den : 0;
  }

  /** the same thing as a complex amplitude, so the string can be animated */
  function shapeAt(x, f = st.fHz) {
    const kr = TAU * f / vOf(), a = alphaOf(), u = st.L - x;
    /* sin(p + iq) = sin p cosh q + i cos p sinh q */
    const nr = Math.sin(kr * u) * Math.cosh(a * u);
    const ni = Math.cos(kr * u) * Math.sinh(a * u);
    const dr = Math.sin(kr * st.L) * Math.cosh(a * st.L);
    const di = Math.cos(kr * st.L) * Math.sinh(a * st.L);
    const q = dr * dr + di * di;
    if (q < 1e-300) return [0, 0];
    return [(nr * dr + ni * di) / q, (ni * dr - nr * di) / q];
  }

  /**
   * How much bigger the biggest loop is than the vibrator's own movement.
   *
   * The biggest loop is NOT quite the one where sin(k u) = ±1. sinh²(αu) grows
   * with distance from the tied end, so the true maximum is dragged a little
   * beyond the naive antinode. That displacement is negligible; what is not
   * negligible is the error of LOOKING for the maximum on a grid. A scan of a
   * few hundred points misses a peak by up to (nπ/steps)²/2 of its height —
   * a few tenths of a percent once the string carries a dozen loops, which is
   * the same size as the differences between orders this panel invites you to
   * compare. So the stationary point is solved for rather than sampled: it is
   * the root of
   *
   *     d/du [ sin²(ku) + sinh²(αu) ] = k sin(2ku) + α sinh(2αu) = 0
   *
   * found by Newton from the naive antinode. Only the last one or two need
   * checking, because sinh² is increasing, so the winner is always near the
   * driven end.
   */
  function gainAt(f = st.fHz) {
    const k = TAU * f / vOf(), a = alphaOf(), L = st.L;
    const F2 = u => Math.sin(k * u) ** 2 + Math.sinh(a * u) ** 2;
    const d1 = u => k * Math.sin(2 * k * u) + a * Math.sinh(2 * a * u);
    const d2 = u => 2 * k * k * Math.cos(2 * k * u) + 2 * a * a * Math.cosh(2 * a * u);
    let best = Math.max(F2(0), F2(L));
    const jmax = Math.floor(k * L / Math.PI - 0.5);
    for (let j = Math.max(0, jmax - 1); j <= jmax; j++) {
      let u = (2 * j + 1) * Math.PI / (2 * k);
      if (!(u > 0 && u < L)) continue;
      for (let it = 0; it < 14; it++) {
        const dd = d2(u);
        if (Math.abs(dd) < 1e-30) break;
        const step = d1(u) / dd;
        const next = u - step;
        if (!(next > 0 && next < L)) break;
        u = next;
        if (Math.abs(step) < 1e-15) break;
      }
      if (u > 0 && u < L) best = Math.max(best, F2(u));
    }
    const den = Math.hypot(Math.sin(k * L), Math.sinh(a * L));
    return den > 0 ? Math.sqrt(best) / den : 0;
  }

  /** where that biggest loop is, measured from the tied end */
  function peakU(f = st.fHz) {
    const k = TAU * f / vOf(), a = alphaOf(), L = st.L;
    const F2 = u => Math.sin(k * u) ** 2 + Math.sinh(a * u) ** 2;
    const d1 = u => k * Math.sin(2 * k * u) + a * Math.sinh(2 * a * u);
    const d2 = u => 2 * k * k * Math.cos(2 * k * u) + 2 * a * a * Math.cosh(2 * a * u);
    let bu = F2(L) >= F2(0) ? L : 0, bv = Math.max(F2(0), F2(L));
    const jmax = Math.floor(k * L / Math.PI - 0.5);
    for (let j = Math.max(0, jmax - 1); j <= jmax; j++) {
      let u = (2 * j + 1) * Math.PI / (2 * k);
      if (!(u > 0 && u < L)) continue;
      for (let it = 0; it < 14; it++) {
        const dd = d2(u);
        if (Math.abs(dd) < 1e-30) break;
        const step = d1(u) / dd;
        const next = u - step;
        if (!(next > 0 && next < L)) break;
        u = next;
        if (Math.abs(step) < 1e-15) break;
      }
      if (u > 0 && u < L && F2(u) > bv) { bv = F2(u); bu = u; }
    }
    return bu;
  }

  /** where the quiet points are: x = L − mλ/2, measured from the vibrator */
  function nodesNow() {
    const half = lamOf() / 2, out = [];
    for (let m = 0; ; m++) {
      const x = st.L - m * half;
      if (x < -1e-9) break;
      out.push(x);
      if (out.length > 40) break;
    }
    return out;
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, { label: 'A string driven by a vibrator, with a pulley and a hanging mass' });

  const pr = new Plot({
    width: MW, height: HR,
    xDomain: [F_MIN, F_MAX], yDomain: [0, 60],
    xTicks: 11, yTicks: 4,
    xLabel: 'driving frequency f / Hz',
    yLabel: 'biggest loop, in vibrator amplitudes',
    tickFmt: v => v.toFixed(0),
    pad: { l: 62, r: 18, t: 30, b: 40 },
    ariaLabel: 'the amplitude of the string against driving frequency',
  });

  const pg = new Plot({
    width: MW, height: HG,
    xDomain: [0, 5.2], yDomain: [0, 11000],
    xTicks: 4, yTicks: 5,
    xLabel: 'tension T = Mg   (N)', yLabel: 'v² / m² s⁻²',
    pad: { l: 74, r: 18, t: 30, b: 42 },
    ariaLabel: 'speed squared against tension',
  });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'sg', label: 'The string, and its mass per unit length <i>μ</i>' },
    { key: 'tn', label: 'The hanging mass, and the tension <i>T</i> = <i>Mg</i>' },
    { key: 'sp', label: 'The speed the apparatus sets, <i>v</i> = √(<i>T</i>/<i>μ</i>)' },
    { key: 'ln', label: 'Length between the ends, and the wavelength <i>λ</i> = <i>v</i>/<i>f</i>' },
    { key: 'fr', label: 'Driving frequency, and the nearest resonance <i>f<sub>n</sub></i> = <i>nv</i>/2<i>L</i>' },
    { key: 'lp', label: 'Loops on the string, <i>L</i> = <i>nλ</i>/2' },
    { key: 'gn', label: 'How much the string beats the vibrator by' },
    { key: 'nd', label: 'How still the nodes really are' },
    { key: 'me', label: 'The speed measured off the pattern, <i>v</i> = 2<i>Lf</i>/<i>n</i>' },
    { key: 'gr', label: 'The graph: gradient, and the <i>μ</i> it gives' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sStr = select({
    label: 'string', value: st.str,
    options: STRINGS.map(s => ({ value: s.key, label: s.name })),
    onChange: v => { st.str = v; render(); },
  });
  const sM = slider({ label: '<i>M</i>', min: M_MIN, max: M_MAX, step: 10, value: st.mMg,
    format: v => `${v.toFixed(0)} g`, onInput: v => { st.mMg = v; render(); } });
  const sF = slider({ label: '<i>f</i>', min: F_MIN, max: F_MAX, step: 0.1, value: st.fHz,
    format: v => `${v.toFixed(1)} Hz`, onInput: v => { st.fHz = v; render(); } });
  const sL = slider({ label: '<i>L</i>', min: L_MIN, max: L_MAX, step: 0.01, value: st.L,
    format: v => `${(v * 100).toFixed(0)} cm`, onInput: v => { st.L = v; render(); } });

  const bSnap = button({ label: 'Tune to the nearest resonance', onClick: () => {
    const n = nNear();
    st.fHz = clamp(+fOfN(n).toFixed(1), F_MIN, F_MAX);
    sF.set(st.fHz); render();
  } });
  const bRec = button({ label: 'Record this reading', onClick: () => {
    const n = nNear();
    st.data.push({ T: Tof(), v: 2 * st.L * st.fHz / n, f: st.fHz, n,
                   mMg: st.mMg, mu: muOf(), L: st.L });
    render();
  } });
  const bRun = button({ label: 'Work through all eight masses', onClick: () => {
    st.data = [];
    for (const m of MASSES) {
      st.mMg = m;
      /* the loop count a careful student would choose: the most loops that
       * still fit under the top of the frequency dial */
      let n = 1;
      while (fOfN(n + 1) <= F_MAX && n < 12) n++;
      const f = +fOfN(n).toFixed(1);
      if (f < F_MIN) continue;
      st.data.push({ T: Tof(), v: 2 * st.L * f / n, f, n, mMg: m, mu: muOf(), L: st.L });
    }
    /* leave the bench showing the last reading that was taken, not some
      * unrelated frequency */
    const last = st.data[st.data.length - 1];
    if (last) { st.mMg = last.mMg; st.fHz = last.f; }
    sM.set(st.mMg); sF.set(st.fHz);
    render();
  } });
  const bClr = button({ label: 'Clear the graph', onClick: () => { st.data = []; render(); } });
  const bEnv = button({ label: 'Envelope', pressed: true, onClick: b => {
    st.env = !st.env; b.setAttribute('aria-pressed', String(st.env)); render();
  } });
  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Wave Speed on a String',
            'a vibrator, a pulley and a hanging mass — and three ways to the same speed'),
    panelBox('The bench — lengths to scale, sideways movement magnified', av.el),
    panelBox('Sweep the frequency: where the string answers back', pr.svg),
    controls([el('div', { class: 'ibs-btns' }, [bSnap.node, bRec.node, bRun.node, bClr.node]) ]),
    controls([sStr.node, sM.node, sF.node, sL.node]),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bEnv.node, bAnn.node])]),
    panelBox('What the readings say the string weighs', pg.svg),
    out.node,
    note('<b>Three routes to one number.</b> The hanging mass sets the tension, so the ' +
         'apparatus fixes the speed at <i>v</i> = √(<i>T</i>/<i>μ</i>) before the vibrator is ' +
         'even switched on. Sweep the frequency and the string answers at ' +
         '<i>f<sub>n</sub></i> = <i>nv</i>/2<i>L</i> and nowhere else; count the loops at a ' +
         'resonance and <i>v</i> = 2<i>Lf</i>/<i>n</i> gives the same speed back without any ' +
         'mention of tension. Square that and plot it against <i>T</i> and the gradient is ' +
         '1/<i>μ</i> — so a set of slotted masses and a metre rule weigh a metre of the string. ' +
         '<b>What is drawn:</b> the string is the driven, damped solution ' +
         '<i>y</i> = <i>A</i>₀ sin<i>k</i>(<i>L</i>−<i>x</i>)/sin<i>kL</i> with a complex ' +
         '<i>k</i>, not a sine curve put there by hand, which is why off resonance it barely ' +
         'moves, why the nodes are not perfectly still, and why the vibrator end — the thing ' +
         'the whole measurement calls a node — is only nearly one. <b>The one liberty:</b> ' +
         `distances along the bench are to scale, but sideways movement is magnified ×${EXAG}, ` +
         'because a real loop is a couple of centimetres on a metre of string.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  const GA = () => {
    const W = av.w, sm = W < NARROW;
    const x0 = Math.round(sm ? 52 : 86);                 // the vibrator's blade
    const scale = Math.min(PPM, (W - x0 - (sm ? 56 : 96)) / L_MAX);
    return { W, sm, x0, scale, mid: Math.round(HA * 0.42),
             xOf: m => x0 + m * scale,
             pulley: x0 + st.L * scale };
  };

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W;
    ctx.clearRect(0, 0, W, HA);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HA);

    const mid = g.mid;
    const mmPx = g.scale * 1e-3 * EXAG;                  // px per mm of movement
    const yOf = mm => mid - mm * mmPx;

    /* --- the string itself ------------------------------------------ */
    const [cr, ci] = [Math.cos(TAU * st.t * 0.9), Math.sin(TAU * st.t * 0.9)];
    const N = 460;
    if (st.env) {
      for (const sgn of [-1, 1]) {
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1.1;
        ctx.save(); ctx.globalAlpha = 0.5; ctx.setLineDash([5, 4]);
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const x = st.L * i / N;
          const a = envelopeAt(x) * A0_MM * sgn;
          const px = g.xOf(x), py = yOf(a);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke(); ctx.restore();
      }
    }
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = st.L * i / N;
      const [zr, zi] = shapeAt(x);
      const a = (zr * cr + zi * ci) * A0_MM;
      const px = g.xOf(x), py = yOf(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();

    /* --- the vibrator ------------------------------------------------ */
    ctx.fillStyle = P.text;
    ctx.fillRect(g.x0 - (g.sm ? 40 : 62), mid - 26, (g.sm ? 34 : 54), 52);
    ctx.beginPath();
    ctx.moveTo(g.x0 - (g.sm ? 6 : 8), mid - 9);
    ctx.lineTo(g.x0, mid); ctx.lineTo(g.x0 - (g.sm ? 6 : 8), mid + 9);
    ctx.closePath(); ctx.fill();
    ctext(ctx, 'vibrator', g.x0 - (g.sm ? 40 : 62), mid - 34,
      { font: `600 11.5px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });

    /* --- the pulley and the load ------------------------------------- */
    /* the wheel sits so that its top is exactly the end of the vibrating
     * length: that tangent point is the fixed end, not the axle */
    const px = g.pulley, R = 13;
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(px, mid + R, R, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, mid + R, 2.6, 0, TAU); ctx.fillStyle = P.text; ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(px + R, mid + R); ctx.lineTo(px + R, mid + 74); ctx.stroke();
    /* the hanger: a disc stack whose height says something about the mass
     * without pretending to be to scale */
    const hh = 10 + st.mMg / 500 * 26;
    ctx.fillStyle = P.text;
    ctx.fillRect(px + R - 17, mid + 74, 34, hh);
    ctext(ctx, `${st.mMg} g`, px + R, mid + 74 + hh + 14,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg, haloWidth: 4 });
    carrow(ctx, px + R + 30, mid + 30, px + R + 30, mid + 66,
      { color: P.accent, width: 1.6, head: 7 });
    ctext(ctx, `T = ${fmt(Tof(), 2)} N`, px + R + 38, mid + 54,
      { font: P.sym(12), color: P.accent, halo: P.bg, haloWidth: 4 });

    /* --- nodes and antinodes ----------------------------------------- */
    const nodes = nodesNow();
    const onRes = Math.abs(st.fHz - fOfN(nNear())) < 0.35;
    for (const x of nodes) {
      if (x < -1e-9 || x > st.L + 1e-9) continue;
      const cx = g.xOf(x);
      /* the node at the pulley shares its patch of canvas with the wheel and
       * the hanger, so it labels itself from the left */
      const atEnd = x > st.L - 1e-9;
      ctx.save();
      ctx.globalAlpha = onRes ? 0.9 : 0.35;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, mid - 96); ctx.lineTo(cx, mid + (atEnd ? 0 : 96)); ctx.stroke();
      ctx.restore();
      ctext(ctx, 'N', atEnd ? cx - 11 : cx, mid + 110,
        { font: `600 11px ${P.font}`, color: onRes ? P.text : P.muted,
          align: atEnd ? 'right' : 'center', halo: P.bg, haloWidth: 4 });
    }
    if (onRes) {
      const n = nNear();
      for (let m = 0; m < n; m++) {
        const cx = g.xOf(st.L * (m + 0.5) / n);
        ctext(ctx, 'A', cx, mid + 110,
          { font: `600 11px ${P.font}`, color: P.accent, align: 'center',
            halo: P.bg, haloWidth: 4 });
      }
    }

    /* --- the two scales ---------------------------------------------- */
    const ry = HA - 16;
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, ry); ctx.lineTo(g.xOf(L_MAX), ry); ctx.stroke();
    for (let cm = 0; cm <= L_MAX * 100; cm += 10) {
      const x = g.xOf(cm / 100);
      const big = cm % 50 === 0;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry - (big ? 7 : 3.5)); ctx.stroke();
      if (big && cm > 0 && !(g.sm && cm >= 100)) {
        ctext(ctx, String(cm), x + 3, ry - 8, { font: `500 10px ${P.font}`, color: P.muted });
      }
    }
    ctext(ctx, g.sm ? 'cm' : 'cm along the bench', g.xOf(L_MAX), ry - 8,
      { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });

    /* the true size of the movement, since it is the one magnified thing */
    const barMm = 10;
    const bx = W - (g.sm ? 26 : 46), by = 18;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 4, by);
    ctx.moveTo(bx, by); ctx.lineTo(bx, by + barMm * mmPx);
    ctx.moveTo(bx - 4, by + barMm * mmPx); ctx.lineTo(bx + 4, by + barMm * mmPx);
    ctx.stroke();
    ctext(ctx, `${barMm} mm of real movement`, bx - 7, by + barMm * mmPx / 2 + 4,
      { font: `500 10px ${P.font}`, color: P.accent, align: 'right',
        halo: P.bg, haloWidth: 4 });

    if (st.ann) {
      callout(ctx, ['The vibrator end is not really a node.',
                    `It moves by ${fmt(A0_MM, 2)} mm — 1/${fmt(gainAt(), 0)} of a loop —`,
                    'which is why the experiment may call it one',
                    'and use L = nλ/2.'],
        g.sm ? 14 : 120, 14, g.x0, mid, { palette: P });
    }
  }

  /* ------------------------------------------- the response curve */

  function drawResponse() {
    pr.clear(); pr.clearOverlay();
    const col = 'var(--ibs-accent)', ink = 'var(--ibs-text)';

    const pts = [];
    let top = 0;
    for (let i = 0; i <= 1400; i++) {
      const f = F_MIN + (F_MAX - F_MIN) * i / 1400;
      const a = gainAt(f);
      if (a > top) top = a;
      pts.push([f, a]);
    }
    const ymax = niceTop(Math.max(6, top * 1.12));
    pr.setDomain([F_MIN, F_MAX], [0, ymax]);

    pr.area(pts, { color: col, opacity: 0.12 });
    pr.line(pts, { color: col, width: 2 });

    /* where the theory says the peaks are */
    for (let n = 1; n <= 60; n++) {
      const f = fOfN(n);
      if (f < F_MIN) continue;
      if (f > F_MAX) break;
      pr.vline(f, { color: ink, dash: '3 4', label: `${n}` });
    }
    pr.vline(st.fHz, { color: col, dash: '', label: '' });
    pr.dot(st.fHz, gainAt(), { color: ink, r: 4.5 });
    pr.text(F_MIN + (F_MAX - F_MIN) * 0.015, ymax * 0.62,
      av.w < NARROW ? 'one more half wavelength each time'
                    : 'each peak is one more half wavelength fitting between the ends',
      { color: 'var(--ibs-muted)', size: 11.5 });
  }

  /* ------------------------------------------- the v² against T graph */

  /** unweighted least squares, written out because the gradient IS the result */
  function fit(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-18) return null;
    const grad = (n * sxy - sx * sy) / d;
    return { grad, inter: (sy - grad * sx) / n, n };
  }

  function drawGraph() {
    pg.clear(); pg.clearOverlay();
    const col = 'var(--ibs-accent)', ink = 'var(--ibs-text)';
    const Tmax = M_MAX * 1e-3 * G * 1.05;
    const ytop = niceTop(Math.max(1.15 * Tmax / muOf(),
                                  ...st.data.map(d => d.v * d.v * 1.15), 1000));
    pg.setDomain([0, Tmax], [0, ytop]);

    /* the line the string itself defines, drawn whether or not anything has
     * been recorded, so the panel is never an empty box */
    pg.line([[0, 0], [Tmax, Tmax / muOf()]],
      { color: ink, width: 1.2, dash: '5 4', opacity: 0.35 });

    const pts = st.data.map(d => [d.T, d.v * d.v]);
    for (const [x, y] of pts) pg.dot(x, y, { color: col, r: 4.2 });

    const f = fit(pts);
    if (f) {
      pg.line([[0, f.inter], [Tmax, f.grad * Tmax + f.inter]], { color: col, width: 2 });
      pg.text(Tmax * 0.03, ytop * 0.93,
        `gradient = ${fmt(f.grad, 0)} m² s⁻² N⁻¹  →  μ = 1/gradient = ${fmt(1e3 / f.grad, 3)} g m⁻¹`,
        { color: col, size: 13, weight: 600 });
      pg.text(Tmax * 0.03, ytop * 0.855,
        `the string really is ${fmt(muOf() * 1e3, 3)} g m⁻¹ — out by ` +
        `${fmt(Math.abs(1e3 / f.grad - muOf() * 1e3) / (muOf() * 1e3) * 100, 2)}%`,
        { color: ink, size: 12, weight: 600 });
      pg.text(Tmax * 0.03, ytop * 0.79, `${f.n} reading${f.n === 1 ? '' : 's'}`,
        { color: 'var(--ibs-muted)', size: 11.5 });
    } else {
      pg.text(Tmax * 0.03, ytop * 0.93,
        pts.length ? 'one reading is a point, not a line — hang a different mass'
                   : 'tune to a resonance and record it, or work through all eight masses',
        { color: 'var(--ibs-muted)', size: 12.5 });
      pg.text(Tmax * 0.03, ytop * 0.865,
        'the dashed line is v² = T/μ for the string on the bench',
        { color: 'var(--ibs-muted)', size: 11.5 });
    }

    /* where the present setting would land */
    const vm = 2 * st.L * st.fHz / nNear();
    pg.dot(Tof(), vm * vm, { color: 'var(--ibs-bg)', r: 6 });
    pg.dot(Tof(), vm * vm, { color: ink, r: 2.6 });
  }

  /* ================================================================== *
   * dragging the frequency on the response curve
   * ================================================================== */

  const unbind = [];
  {
    const el2 = pr.svg;
    const toF = e => {
      const r = el2.getBoundingClientRect();
      const vx = (e.clientX - r.left) * (pr.w / r.width);
      return clamp(pr.invX(vx), F_MIN, F_MAX);
    };
    const down = e => { st.dragging = true; st.fHz = +toF(e).toFixed(1); sF.set(st.fHz);
                        el2.setPointerCapture(e.pointerId); e.preventDefault(); render(); };
    const move = e => { if (!st.dragging) { el2.style.cursor = 'ew-resize'; return; }
                        st.fHz = +toF(e).toFixed(1); sF.set(st.fHz); e.preventDefault(); render(); };
    const up = e => { if (!st.dragging) return; st.dragging = false;
                      try { el2.releasePointerCapture(e.pointerId); } catch (_) {} };
    el2.addEventListener('pointerdown', down);
    el2.addEventListener('pointermove', move);
    el2.addEventListener('pointerup', up);
    el2.addEventListener('pointercancel', up);
    unbind.push(() => {
      el2.removeEventListener('pointerdown', down);
      el2.removeEventListener('pointermove', move);
      el2.removeEventListener('pointerup', up);
      el2.removeEventListener('pointercancel', up);
    });
  }
  onDestroy(() => unbind.forEach(f => f()));

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) { st.t += Math.min(dt, 0.1); drawA(); }
  }

  function render() {
    drawA(); drawResponse(); drawGraph();

    const n = nNear(), fn = fOfN(n), gain = gainAt();
    const vm = 2 * st.L * st.fHz / n;
    const v = vOf(), aL = alphaOf() * st.L;
    const f = fit(st.data.map(d => [d.T, d.v * d.v]));
    const onRes = Math.abs(st.fHz - fn) < 0.35;

    out.setAll({
      sg: `${S().name} — μ = ${fmt(muOf() * 1e3, 2)} g m⁻¹, about ` +
          `${fmt(dOf() * 1e3, 2)} mm across`,
      tn: `${st.mMg} g  →  T = ${fmt(Tof(), 2)} N`,
      sp: `${fmt(v, 1)} m s⁻¹`,
      ln: `L = ${fmt(st.L * 100, 0)} cm,  λ = ${fmt(lamOf() * 100, 1)} cm`,
      fr: `${fmt(st.fHz, 1)} Hz` +
          (onRes ? `  — on the n = ${n} resonance`
                 : `,  nearest is f${n} = ${fmt(fn, 1)} Hz (${fmt(st.fHz - fn, 1)} Hz away)`),
      lp: onRes ? `${n} loop${n === 1 ? '' : 's'}, so L = ${n}λ/2 = ${fmt(n * lamOf() / 2 * 100, 1)} cm`
                : `between modes — ${fmt(2 * st.L / lamOf(), 2)} half wavelengths would have to fit`,
      gn: `the biggest loop is ${fmt(gain, 1)}× the vibrator's own ${fmt(A0_MM, 2)} mm ` +
          `= ${fmt(gain * A0_MM, 1)} mm`,
      nd: `αL = ${fmt(aL, 3)}: the quiet point nearest the vibrator still moves ` +
          `${fmt(100 / Math.max(gain, 1e-9), 1)}% of a loop, and each one nearer the ` +
          'pulley moves less in proportion to its distance from it. Only the tied ' +
          'end is a true node',
      me: `2Lf/n = ${fmt(vm, 1)} m s⁻¹` +
          (onRes ? '  — the same as √(T/μ), which is the point of the experiment'
                 : `, which is ${fmt((vm / v - 1) * 100, 1)}% out because f is off resonance`),
      gr: f ? `gradient ${fmt(f.grad, 0)} → μ = ${fmt(1e3 / f.grad, 3)} g m⁻¹ ` +
              `against a true ${fmt(muOf() * 1e3, 2)} g m⁻¹`
            : 'record at least two masses and the gradient measures μ',
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(av.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      av.setLogical(w, HA);
      pr.xTicks = w < NARROW ? 4 : 11;
      pr.setSize(w, HR);
      pg.setSize(w, HG);
    }
    av.fit();
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
    _set: p => { Object.assign(st, p);
                 sM.set(st.mMg); sF.set(st.fHz); sL.set(st.L); sStr.set(st.str);
                 render(); },
    _state: () => ({ str: st.str, mu: muOf(), d: dOf(), mMg: st.mMg, T: Tof(),
                     v: vOf(), fHz: st.fHz, L: st.L, lam: lamOf(),
                     n: nNear(), fn: fOfN(nNear()), gain: gainAt(),
                     alpha: alphaOf(), alphaL: alphaOf() * st.L,
                     vMeasured: 2 * st.L * st.fHz / nNear(), A0: A0_MM,
                     points: st.data.length }),
    _consts: () => ({ G, RHO_S, DRAG, A0_MM, EXAG, M_MIN, M_MAX, MASSES,
                      L_MIN, L_MAX, F_MIN, F_MAX, HA, HR, HG, MW,
                      STRINGS: STRINGS.map(s => [s.key, s.mu]) }),
    _speed: (T, mu) => speedOf(T, mu),
    _env: (x, f) => envelopeAt(x, f),
    _shape: (x, f) => shapeAt(x, f),
    _gain: f => gainAt(f),
    _peakU: f => peakU(f),
    _fn: n => fOfN(n),
    _nodes: () => nodesNow(),
    _data: () => st.data.map(d => ({ ...d })),
    _fit: () => fit(st.data.map(d => [d.T, d.v * d.v])),
    _geom: () => { const g = GA(); return { W: g.W, sm: g.sm, x0: g.x0, scale: g.scale,
                                            mid: g.mid, pulley: g.pulley,
                                            mmPx: g.scale * 1e-3 * EXAG }; },
  };
}
