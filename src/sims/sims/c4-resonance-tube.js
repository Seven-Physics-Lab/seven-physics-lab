/* ============================================================================
 * C4-3  Resonance Tube
 * IB Physics C.4 Standing Waves and Resonance
 *
 * The practical version of C4-2. A tuning fork of known frequency is held over
 * a tube of air standing in water; lowering the water lengthens the air column
 * until it resonates. This is the standard school measurement of the speed of
 * sound, and it is also where the end correction stops being a footnote in a
 * textbook and becomes the intercept of a graph you have drawn yourself.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PICTURE IS FOR
 *
 * The apparatus and the response curve share one vertical axis. The water
 * level in the tube lines up, across the panel, with the point on the loudness
 * curve that belongs to it. The resonances are therefore not asserted: they are
 * the places where the curve bulges, at the water levels where the mode fits.
 * Sliding the water down walks you along that curve.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * The air column is closed by the water and open at the top, so it needs a
 * displacement node at the water and an antinode at the open end. The antinode
 * is not exactly at the rim: the air just outside the tube is dragged along
 * too, and the column behaves as if it were longer by the END CORRECTION
 *
 *     e = 0.6 r          (r = the tube's inner radius, unflanged end)
 *
 * so resonance needs
 *
 *     L + e = (2m - 1) λ/4,      m = 1, 2, 3, …
 *
 * TWO INDEPENDENT ROUTES TO THE SPEED OF SOUND, AND WHY BOTH ARE HERE
 *
 * 1. Successive resonances of the same fork differ by exactly λ/2, and the
 *    end correction cancels in the subtraction:
 *
 *        L₂ - L₁ = λ/2   →   v = 2 f (L₂ - L₁)
 *
 *    This is why the experiment is done with two resonances rather than one.
 *    A single resonance and v = 4 f L₁ is wrong by about 3%, and the sim shows
 *    that error rather than mentioning it.
 *
 * 2. Over a set of forks, L₁ = (v/4)(1/f) - e is a straight line. Its gradient
 *    gives v and its intercept gives -e, so the second graph measures the very
 *    thing the first method was designed to avoid needing.
 *
 * THE LOUDNESS CURVE
 *
 * Not invented. A tube of length Lₑ = L + e driven at its open end has a
 * response proportional to 1/cos(k Lₑ) with no losses, which is infinite at
 * resonance. With losses the wavenumber is complex, k → k - iα, and
 *
 *     |cos(k Lₑ - i α Lₑ)|² = cos²(k Lₑ) cosh²(α Lₑ) + sin²(k Lₑ) sinh²(α Lₑ)
 *                           = cos²(k Lₑ) + sinh²(α Lₑ)
 *
 * using cosh² - sinh² = 1. So the response is
 *
 *     A(L) = 1 / sqrt( cos²(k Lₑ) + sinh²(α Lₑ) )
 *
 * a clean resonance curve. Because α itself grows a little with length, the
 * true maximum is not quite at cos(k Lₑ) = 0 but displaced by
 * −sinh y cosh y (dy/dLₑ)/k². Across every fork, radius and order available
 * here that displacement is at most 0.17 mm — a twentieth of the peak's own
 * −3 dB width, and below what a metre rule against a tube of water could
 * resolve. So the loss broadens the peaks without, for any practical purpose,
 * moving them. α is the sum of the two losses a real tube has:
 *
 *   wall (Kirchhoff, viscous + thermal boundary layer):
 *       α_w = (1/rc) sqrt(ηω/2ρ) (1 + (γ-1)/√Pr)
 *   radiation from the open end:
 *       α_r = (kr)² / (4 Lₑ)
 *
 * These pull in OPPOSITE directions with radius: the wall loss goes as 1/r and
 * the radiation loss as r². Their sum therefore has a minimum, at r³ = A/2B,
 * which for a 512 Hz fork is a radius of about 14 mm. A very narrow tube loses
 * its energy to friction at the walls; a very wide one throws it out of the
 * mouth as sound. Somewhere in between is the tube that rings most sharply,
 * and the sim reproduces that rather than the easier half-truth that narrower
 * is always sharper.
 *
 * INSIDE THE TUBE
 *
 * The air column is driven, not free, so its shape is always sin(kz) measured
 * up from the water — a node at the water, whatever the length — and it is the
 * AMPLITUDE that peaks at resonance, by the factor above. Off resonance the
 * curve is drawn genuinely tiny, because off resonance the air genuinely
 * barely moves; the dashed envelope shows the mode that would stand there if
 * the length were right.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout, Plot,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;
const HA = 524;                     // the apparatus + response panel
const PB_H = 316;                   // the L against 1/f graph

const FORKS = [256, 288, 320, 341, 384, 426, 480, 512];   // a school fork set

const TUBE_LEN = 1.12;              // m, the glass tube
const L_MIN = 0.02, L_MAX = 1.05;   // m, the air column
const R_MIN = 8, R_MAX = 30;        // mm, inner radius
const THETA = 20;                   // °C — fixed; C4-2 is where temperature lives
const V_AIR = 331.3 * Math.sqrt(1 + THETA / 273.15);

/* air, at 20 °C, for the Kirchhoff wall loss */
const ETA = 1.85e-5, RHO = 1.20, GAMMA = 1.40, PR = 0.71;

const PPM = 360;                    // px per metre, vertical, in panel A
const TOP = 86;                     // y of the tube rim
const DB_FLOOR = -45;               // the quietest the loudness axis shows

const NARROW = 700;

/** the end correction of an unflanged open end */
export function endCorrection(rMetres) { return 0.6 * rMetres; }

/** total absorption coefficient of the column, m⁻¹ */
export function alphaOf(f, rMetres, LeMetres) {
  const w = TAU * f, k = w / V_AIR;
  const wall = (1 / (rMetres * V_AIR)) * Math.sqrt(ETA * w / (2 * RHO))
             * (1 + (GAMMA - 1) / Math.sqrt(PR));
  const rad = (k * rMetres) ** 2 / (4 * Math.max(LeMetres, 1e-3));
  return wall + rad;
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c4-resonance-tube',
    title: 'Resonance tube',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    fi: 7,                 // index into FORKS — 512 Hz
    L: 0.158,              // m, the air column
    r: 15,                 // mm
    t: 0,
    playing: true,
    ann: false,
    dragging: false,
    data: [],              // recorded {f, L1}
  };

  const fOf  = () => FORKS[st.fi];
  const rM   = () => st.r / 1000;
  const eOf  = () => endCorrection(rM());
  const lam  = () => V_AIR / fOf();
  const kOf  = () => TAU / lam();

  /** the resonance response at an air column of length L */
  function response(L) {
    const Le = L + eOf();
    const y = alphaOf(fOf(), rM(), Le) * Le;
    const c = Math.cos(kOf() * Le), s = Math.sinh(y);
    return 1 / Math.sqrt(c * c + s * s);
  }

  /** the resonant air columns that fit in the tube, shortest first */
  function resonances() {
    const out = [];
    for (let m = 1; m <= 8; m++) {
      const L = (2 * m - 1) * lam() / 4 - eOf();
      if (L > L_MAX) break;
      if (L >= L_MIN) out.push({ m, L });
    }
    return out;
  }

  /* Normalising by the best resonance the tube can show keeps the loudness
   * scale steady while the water moves, so the meter reads as a measurement
   * rather than as an auto-gain. */
  const bestResponse = () => {
    const rs = resonances();
    return rs.length ? Math.max(...rs.map(x => response(x.L))) : response(st.L);
  };
  const rel = L => clamp(response(L) / bestResponse(), 0, 1);

  const nearest = () => {
    const rs = resonances();
    if (!rs.length) return null;
    return rs.reduce((a, x) => Math.abs(x.L - st.L) < Math.abs(a.L - st.L) ? x : a);
  };

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, {
    label: 'A tuning fork over a tube of air standing in water, and the loudness at every water level',
  });

  /** panel A geometry, recomputed from the live width */
  function GA() {
    const W = av.w, sm = W < NARROW;
    /* On a phone the metre rule is dropped: the water line, the slider and
     * the readout all carry the same number, and a rule squeezed to 20 px
     * is decoration rather than an instrument. */
    const ruler = !sm;
    const rulX = 34;
    const tubeX = sm ? 14 : 78;
    const tubeW = sm ? 52 : 74;
    const cx0 = sm ? 192 : 368;                // the loudness axis
    const cx1 = W - (sm ? 16 : 44);
    return { W, sm, ruler, rulX, tubeX, tubeW, cx0, cx1,
             aMax: tubeW / 2 - 7,
             yOf: L => TOP + L * PPM,
             lOf: y => clamp((y - TOP) / PPM, L_MIN, L_MAX),
             /* decibels relative to the strongest resonance this tube shows */
             xOf: L => cx0 + clamp(1 - dbOf(L) / DB_FLOOR, 0, 1) * (cx1 - cx0) };
  }
  const dbOf = L => Math.max(DB_FLOOR, 20 * Math.log10(Math.max(rel(L), 1e-9)));

  /* ------------------------------------------------------- the graph */

  const plot = new Plot({
    width: MW, height: PB_H,
    xDomain: [0, 4.0], yDomain: [-0.10, 0.40],
    xTicks: 4, yTicks: 5,
    xLabel: '1 / f   (ms)', yLabel: 'first resonance L₁ / m',
    pad: { l: 62, r: 18, t: 30, b: 42 },
    ariaLabel: 'first resonance length against one over frequency',
  });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'fk',  label: 'Tuning fork, and its wavelength <i>λ</i> = <i>v</i>/<i>f</i>' },
    { key: 'ai',  label: 'Air column <i>L</i>, and the distance to the nearest resonance' },
    { key: 'ld',  label: 'Loudness, against the strongest resonance' },
    { key: 'rs',  label: 'Resonant lengths this fork gives, <i>L</i> + <i>e</i> = (2<i>m</i>−1)<i>λ</i>/4' },
    { key: 'dl',  label: 'Spacing Δ<i>L</i> between them, against <i>λ</i>/2' },
    { key: 'v2',  label: '<b>v</b> from two resonances, <i>v</i> = 2<i>f</i>Δ<i>L</i>' },
    { key: 'v1',  label: 'and from one, <i>v</i> = 4<i>fL</i>₁ — the error the end correction causes' },
    { key: 'ec',  label: 'End correction <i>e</i> = 0.6<i>r</i>' },
    { key: 'gr',  label: 'From the graph: gradient → <i>v</i>' },
    { key: 'gi',  label: 'From the graph: intercept → <i>e</i>' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sFork = slider({ label: 'tuning fork', word: true, min: 0, max: FORKS.length - 1,
    step: 1, value: st.fi,
    format: v => `${FORKS[Math.round(v)]} Hz`,
    onInput: v => { st.fi = Math.round(v); render(); } });
  const sL = slider({ label: '<i>L</i>', min: L_MIN, max: L_MAX, step: 0.001, value: st.L,
    format: v => `${(v * 100).toFixed(1)} cm`, onInput: v => { st.L = v; } });
  const sR = slider({ label: '<i>r</i>', min: R_MIN, max: R_MAX, step: 1, value: st.r,
    format: v => `${v.toFixed(0)} mm`, onInput: v => { st.r = v; render(); } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bTune = button({ label: '🎯 Tune to the nearest resonance', onClick: () => {
    const n = nearest();
    if (n) { st.L = n.L; sL.set(st.L); render(); }
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });

  const bRec = button({ label: 'Record this reading', onClick: () => {
    const n = nearest();
    if (!n || n.m !== 1) return;
    record(fOf(), n.L);
  } });
  const bAll = button({ label: 'Work through all eight forks', onClick: () => {
    for (const f of FORKS) {
      const L1 = lamFor(f) / 4 - eOf();
      if (L1 >= L_MIN && L1 <= L_MAX) record(f, L1);
    }
    render();
  } });
  const bClr = button({ label: 'Clear the readings', onClick: () => {
    st.data = []; render();
  } });

  const lamFor = f => V_AIR / f;
  function record(f, L1) {
    st.data = st.data.filter(d => d.f !== f).concat([{ f, L1 }]).sort((a, b) => a.f - b.f);
    render();
  }

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Resonance Tube',
            'measuring the speed of sound, and meeting the end correction'),
    panelBox('The apparatus, and the loudness at every water level — drag the water',
             av.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bTune.node, bAnn.node])]),
    controls([sFork.node, sL.node, sR.node]),
    panelBox('The experiment: first resonance against 1/<i>f</i>, over the set of forks',
             plot.svg),
    controls([el('div', { class: 'ibs-btns' }, [bRec.node, bAll.node, bClr.node])],
             { label: 'readings:' }),
    out.node,
    note('<b>The end correction.</b> A tube of air closed by the water and open at the top ' +
         'needs a <b>node at the water</b> and an <b>antinode at the open end</b> — but the ' +
         'antinode sits a little <i>above</i> the rim, because the air just outside is dragged ' +
         'along too. The column behaves as if it were longer by <i>e</i> ≈ 0.6<i>r</i>, so ' +
         'resonance needs <i>L</i> + <i>e</i> = (2<i>m</i>−1)<i>λ</i>/4. This is why the ' +
         'experiment is never done with one resonance: <i>v</i> = 4<i>fL</i>₁ is wrong by the ' +
         'end correction, and the readouts show by how much. Take <b>two</b> resonances instead ' +
         'and the correction subtracts away — Δ<i>L</i> = <i>λ</i>/2 exactly, so ' +
         '<b><i>v</i> = 2<i>f</i>Δ<i>L</i></b>. The second graph does it the other way: over a ' +
         'set of forks <i>L</i>₁ = (<i>v</i>/4)(1/<i>f</i>) − <i>e</i> is a straight line, whose ' +
         '<b>gradient</b> gives the speed of sound and whose <b>intercept</b> measures the end ' +
         'correction you were trying to avoid. The tube\'s radius does two things at once: it sets ' +
         'the end correction, and it sets how sharp the resonance is. A very narrow tube wastes ' +
         'its energy on friction at the walls, a very wide one radiates it away out of the mouth, ' +
         'so the sharpest peaks come from a tube <b>in between</b> — near 14 mm for a 512 Hz fork. ' +
         'Slide <i>r</i> from one end to the other and watch the peaks narrow and then widen again.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  function drawFork(ctx, g, cx, y) {
    /* a small tuning fork above the mouth, buzzing */
    const wob = st.playing ? Math.sin(TAU * 6 * st.t) * 1.6 : 0;
    ctx.save();
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * (8 + wob * s), y - 46);
      ctx.lineTo(cx + s * (8 + wob * s), y - 18);
      ctx.quadraticCurveTo(cx + s * 8, y - 10, cx, y - 10);
      ctx.stroke();
    }
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(cx, y - 10); ctx.lineTo(cx, y + 2); ctx.stroke();
    ctx.restore();
    ctext(ctx, `${fOf()} Hz`, cx + 16, y - 34,
      { font: `600 11.5px ${P.font}`, color: P.text });
  }

  function drawA() {
    const ctx = av.ctx, g = GA(), W = g.W;
    ctx.clearRect(0, 0, W, HA);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HA);

    const yRim = TOP, yBot = TOP + TUBE_LEN * PPM;
    const x0 = g.tubeX, x1 = g.tubeX + g.tubeW, cxT = (x0 + x1) / 2;
    const yW = g.yOf(st.L);
    const e = eOf(), rlz = rel(st.L);

    /* ---- the metre rule, zeroed at the rim and reading downwards ---- */
    if (g.ruler) {
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.rulX + 20, yRim); ctx.lineTo(g.rulX + 20, yBot); ctx.stroke();
    for (let i = 0; i * 0.05 <= TUBE_LEN + 1e-9; i++) {
      const L = i * 0.05, big = i % 2 === 0;
      const y = g.yOf(L);
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      ctx.moveTo(g.rulX + 20 - (big ? 9 : 5), y); ctx.lineTo(g.rulX + 20, y); ctx.stroke();
      if (big) {
        ctext(ctx, L.toFixed(1), g.rulX + 20 - 12, y + 4,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
      }
    }
    ctext(ctx, 'L / m', g.rulX + 20, yRim - 12,
      { font: P.sym(12), color: P.muted, align: 'right' });
    }

    /* ---- the tube, and the water in it ---- */
    ctx.save();
    ctx.fillStyle = P.accent; ctx.globalAlpha = 0.16;
    ctx.fillRect(x0 + 2, yW, g.tubeW - 4, yBot - yW - 2);
    ctx.restore();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x0 + 2, yW); ctx.lineTo(x1 - 2, yW); ctx.stroke();

    ctx.strokeStyle = P.text; ctx.lineWidth = 2.2; ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x0, yRim); ctx.lineTo(x0, yBot);
    ctx.lineTo(x1, yBot); ctx.lineTo(x1, yRim);
    ctx.stroke();

    drawFork(ctx, g, cxT, yRim - 30);

    /* ---- the mode inside the column ----
     * z is measured up from the water: a node there, always. The dashed
     * envelope runs on past the rim to where the antinode actually is. */
    const k = kOf();
    const zTop = st.L + e;                       // to the virtual antinode
    const yz = z => yW - z * PPM;
    const put = (z, u) => [cxT + u, yz(z)];

    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.2;
    for (const s of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const z = zTop * i / 120;
        const [px, py] = put(z, s * g.aMax * Math.sin(k * z));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    /* the air's actual displacement, at true relative scale */
    const ph = Math.cos(TAU * 2.2 * st.t);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const z = st.L * i / 120;
      const [px, py] = put(z, g.aMax * rlz * ph * Math.sin(k * z));
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();

    /* node at the water, antinode above the rim */
    ctx.beginPath(); ctx.arc(cxT, yW, 4.6, 0, TAU);
    ctx.fillStyle = P.bg; ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.stroke();
    ctext(ctx, 'N', cxT + 12, yW + 4, { font: `600 11px ${P.font}`, color: P.text });

    const yA = yz(zTop);
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(cxT, yA, 3.4, 0, TAU); ctx.fill();

    /* The end correction is a few millimetres, which at this scale is a few
     * pixels. It is drawn to scale anyway - exaggerating a length on a
     * physics diagram is worse than drawing it small - and carries a bracket
     * and a leader out to a label with room to be read. */
    const eb = x1 + 12;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x1 + 2, yRim); ctx.lineTo(eb + 6, yRim);
    ctx.moveTo(cxT, yA);      ctx.lineTo(eb + 6, yA);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(eb, yA); ctx.lineTo(eb, yRim); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eb + 6, (yA + yRim) / 2); ctx.lineTo(eb + 22, yRim - 34);
    ctx.stroke();
    ctext(ctx, `e = ${fmt(e * 1000, 1)} mm`, eb + 24, yRim - 36,
      { font: P.sym(11.5), color: P.accent });
    ctext(ctx, 'the antinode is above the rim', eb + 24, yRim - 23,
      { font: `500 10.5px ${P.font}`, color: P.muted });

    /* ---- the loudness curve, on the same vertical axis ----
     *
     * In decibels, not as a fraction. Off resonance the amplitude is about a
     * hundredth of the peak, so a linear axis draws the whole curve flat
     * against its own axis with three needles sticking out of it; on a dB
     * axis the resonance has the shape a resonance actually has, and dB is
     * what a sound meter reads anyway. */
    const cx0 = g.cx0, cx1 = g.cx1;
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx0, yRim); ctx.lineTo(cx0, g.yOf(L_MAX)); ctx.stroke();
    for (let db = DB_FLOOR; db <= 0; db += 15) {
      const px = cx0 + (1 - db / DB_FLOOR) * (cx1 - cx0);
      ctx.save();
      ctx.strokeStyle = P.line; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(px, yRim); ctx.lineTo(px, g.yOf(L_MAX)); ctx.stroke();
      ctx.restore();
      ctext(ctx, db === 0 ? '0 dB' : String(db), px, yRim - 7,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, 'loudness', (cx0 + cx1) / 2, yRim - 24,
      { font: `600 11px ${P.font}`, color: P.muted, align: 'center' });

    const pts = [];
    const N = 1400;
    for (let i = 0; i <= N; i++) {
      const L = L_MIN + (L_MAX - L_MIN) * i / N;
      pts.push([g.xOf(L), g.yOf(L)]);
    }
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
    ctx.stroke();

    /* each resonance, labelled where it sits */
    const rs = resonances();
    rs.forEach(({ m, L }) => {
      const y = g.yOf(L);
      ctx.save();
      ctx.setLineDash([3, 4]); ctx.globalAlpha = 0.45;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1 + 2, y); ctx.lineTo(cx1, y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(g.xOf(L), y, 3.6, 0, TAU); ctx.fill();
      ctext(ctx, g.sm ? `${ordinal(m)}` : `${ordinal(m)} resonance`, cx0 - 12, y - 3,
        { font: `600 11px ${P.font}`, color: P.text, align: 'right', halo: P.bg });
      ctext(ctx, `L = ${fmt(L, 3)} m`, cx0 - 12, y + 11,
        { font: P.sym(11), color: P.muted, align: 'right', halo: P.bg });
    });

    /* the half wavelength between two of them: the measurement that works */
    if (rs.length >= 2) {
      const ya = g.yOf(rs[0].L), yb = g.yOf(rs[1].L), bx = x1 + (g.sm ? 20 : 34);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - 5, ya); ctx.lineTo(bx + 5, ya);
      ctx.moveTo(bx - 5, yb); ctx.lineTo(bx + 5, yb);
      ctx.stroke();
      carrow(ctx, bx, ya, bx, yb, { color: P.accent, width: 1.2, head: 6, min: 4 });
      carrow(ctx, bx, yb, bx, ya, { color: P.accent, width: 1.2, head: 6, min: 4 });
      ctx.save();
      ctx.translate(bx - 7, (ya + yb) / 2); ctx.rotate(-Math.PI / 2);
      ctext(ctx, `ΔL = λ/2 = ${fmt(lam() / 2, 3)} m`, 0, 0,
        { font: P.sym(11.5), color: P.accent, align: 'center', halo: P.bg });
      ctx.restore();
    }

    /* the water level, carried across the whole panel */
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(g.ruler ? g.rulX + 20 : x0, yW); ctx.lineTo(cx1, yW); ctx.stroke();
    ctx.restore();
    const hx = g.xOf(st.L);
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(hx, yW, 5.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
    const near = hx + 74 > W;
    ctext(ctx, `${fmt(dbOf(st.L), 1)} dB`, hx + (near ? -12 : 12), yW + 4,
      { font: `700 11.5px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 5,
        align: near ? 'right' : 'left' });

    if (st.ann) {
      const n = nearest();
      callout(ctx, ['The water level and the loudness curve',
                    'share one vertical scale. The bulges are',
                    'the lengths at which the mode fits.'],
        cx0 + 14, HA - 86, hx, yW, { palette: P });
      if (n) {
        ctext(ctx, `nearest resonance: ${ordinal(n.m)}, ${fmt(Math.abs(n.L - st.L) * 1000, 0)} mm away`,
          x0, HA - 12, { font: `500 11px ${P.font}`, color: P.muted });
      }
    }
  }

  function ordinal(n) {
    return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  }

  /* ---------------------------------------------- the L against 1/f graph */

  /**
   * Unweighted least squares through the recorded points. Written out rather
   * than approximated, because the whole point of the graph is that its
   * gradient and intercept are measurements.
   */
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

  function drawB() {
    plot.clear(); plot.clearOverlay();
    const col = 'var(--ibs-accent)', ink = 'var(--ibs-text)';

    /* the line the theory predicts, drawn faintly whether or not anything
     * has been recorded, so the graph is never an empty box */
    const e = eOf();
    plot.line([[0, -e], [4.0, V_AIR / 4 * 0.0040 - e]],
      { color: ink, width: 1.2, dash: '5 4', opacity: 0.35 });

    const pts = st.data.map(d => [1000 / d.f, d.L1]);
    for (const [x, y] of pts) plot.dot(x, y, { color: col, r: 4.2 });

    const f = fit(pts);
    if (f) {
      plot.line([[0, f.inter], [4.0, f.grad * 4.0 + f.inter]], { color: col, width: 2 });
      plot.text(0.10, 0.370, `v = 4 × gradient = ${fmt(4 * f.grad * 1000, 1)} m s⁻¹`,
        { color: col, size: 13, weight: 600 });
      plot.text(0.10, 0.332, `e = −intercept = ${fmt(-f.inter * 1000, 1)} mm`,
        { color: ink, size: 12.5, weight: 600 });
      plot.text(0.10, 0.298, `${f.n} reading${f.n === 1 ? '' : 's'}`,
        { color: 'var(--ibs-muted)', size: 11.5 });
    } else {
      plot.text(0.10, 0.366,
        pts.length ? 'one reading is a point, not a line — record another fork'
                   : 'tune to a first resonance, then record it',
        { color: 'var(--ibs-muted)', size: 12.5 });
      plot.text(0.10, 0.330, 'the dashed line is what theory predicts',
        { color: 'var(--ibs-muted)', size: 11.5 });
    }

    /* where the current fork would land */
    const L1 = lam() / 4 - e;
    if (L1 >= L_MIN && L1 <= L_MAX) {
      plot.dot(1000 / fOf(), L1, { color: 'var(--ibs-bg)', r: 6 });
      plot.dot(1000 / fOf(), L1, { color: ink, r: 2.6 });
    }
  }

  /* ================================================================== *
   * dragging the water
   * ================================================================== */

  const setFromPointer = e => {
    const g = GA();
    st.L = clamp(g.lOf(av.at(e).y), L_MIN, L_MAX);
    sL.set(st.L);
  };
  const onDown = e => {
    st.dragging = true; setFromPointer(e);
    av.el.setPointerCapture(e.pointerId); e.preventDefault();
  };
  const onMove = e => {
    if (!st.dragging) { av.el.style.cursor = 'ns-resize'; return; }
    setFromPointer(e); e.preventDefault();
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
    if (st.playing) st.t += Math.min(dt, 0.1);
    render();
  }

  let bTick = 0, lastKey = '';
  function render() {
    drawA();
    const key = `${st.fi}|${st.r}|${st.data.length}|${st.data.map(d => d.f).join(',')}|${plot.w}`;
    if (key !== lastKey || (bTick++ % 30) === 0) { drawB(); lastKey = key; }

    const rs = resonances(), n = nearest(), e = eOf();
    const dL = rs.length >= 2 ? rs[1].L - rs[0].L : null;
    const v2 = dL ? 2 * fOf() * dL : null;
    const v1 = rs.length ? 4 * fOf() * rs[0].L : null;
    const f = fit(st.data.map(d => [1000 / d.f, d.L1]));

    bRec.disable(!(n && n.m === 1 && Math.abs(n.L - st.L) < 5e-4));

    out.setAll({
      fk: `${fOf()} Hz,  λ = ${fmt(lam(), 3)} m`,
      ai: n ? `${fmt(st.L * 100, 1)} cm,  ${fmt(Math.abs(n.L - st.L) * 1000, 0)} mm from the ${ordinal(n.m)}`
            : `${fmt(st.L * 100, 1)} cm,  no resonance fits this tube`,
      ld: `${fmt(dbOf(st.L), 1)} dB  (${(rel(st.L) * 100).toFixed(1)}% of the amplitude)`,
      rs: rs.length ? rs.map(x => fmt(x.L, 3)).join(',  ') + ' m' : 'none — the tube is too short',
      dl: dL ? `${fmt(dL, 4)} m,  against λ/2 = ${fmt(lam() / 2, 4)} m`
             : 'only one resonance fits — try a higher fork',
      v2: v2 ? `${fmt(v2, 1)} m s⁻¹   (true value ${fmt(V_AIR, 1)})`
             : 'needs two resonances',
      v1: v1 ? `${fmt(v1, 1)} m s⁻¹ — low by ${fmt(V_AIR - v1, 1)}, or ` +
               `${fmt(100 * (V_AIR - v1) / V_AIR, 1)}%`
             : '—',
      ec: `${fmt(e * 1000, 1)} mm  (r = ${st.r} mm)`,
      gr: f ? `${fmt(4 * f.grad * 1000, 1)} m s⁻¹` : `${st.data.length} of 8 readings taken`,
      gi: f ? `${fmt(-f.inter * 1000, 1)} mm  (true ${fmt(e * 1000, 1)} mm)` : '—',
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
    _set: p => { Object.assign(st, p); if (p.L != null) sL.set(st.L);
                 if (p.fi != null) sFork.set(st.fi); if (p.r != null) sR.set(st.r);
                 lastKey = ''; render(); },
    _state: () => ({
      f: fOf(), fi: st.fi, L: st.L, r: st.r, e: eOf(), lam: lam(), v: V_AIR,
      rel: rel(st.L), data: st.data.slice(),
      fit: fit(st.data.map(d => [1000 / d.f, d.L1])),
    }),
    _response: L => response(L),
    _rel: L => rel(L),
    _resonances: () => resonances(),
    _alpha: () => alphaOf(fOf(), rM(), st.L + eOf()),
    _db: L => dbOf(L),
    _record: (f, L1) => record(f, L1),
    _recordAll: () => bAll.node.click(),
    _tune: () => bTune.node.click(),
    _clear: () => bClr.node.click(),
    _consts: () => {
      const { W, sm, ruler, rulX, tubeX, tubeW, cx0, cx1, aMax } = GA();
      return { FORKS, TUBE_LEN, L_MIN, L_MAX, R_MIN, R_MAX, V_AIR, THETA,
               PPM, TOP, DB_FLOOR, HA, PB_H, MW,
               W, sm, ruler, rulX, tubeX, tubeW, cx0, cx1, aMax,
               yBot: TOP + TUBE_LEN * PPM };
    },
  };
}
