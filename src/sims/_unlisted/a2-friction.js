/* ============================================================================
 * A2-6  The Friction Bench
 * IB Physics A.2 Forces and momentum — friction
 *
 * One phenomenon at three magnifications, on three benches:
 *
 *   THE BLOCK       a block dragged across a table through a spring balance.
 *                   This is the scale a student measures at: the pull climbs,
 *                   the block lets go, the pull drops, the block stops, and
 *                   the whole thing judders.
 *   THE CONTACT     the same two surfaces at about twenty thousand times.
 *                   Two rough faces touch on a handful of summits, and how
 *                   much of them touches is what the load decides.
 *   ONE JUNCTION    a single one of those contacts, at the scale of atoms,
 *                   dragged over the corrugation of the surface below it.
 *
 * ---------------------------------------------------------------------------
 * NOTHING QUOTED
 *
 * The results of this topic are NOT in this file. None of the following is
 * written down anywhere below, and each of them comes out of the model:
 *
 *   * that friction is proportional to the normal force (Amontons I)
 *   * that it does not depend on the apparent area of contact (Amontons II)
 *   * that the coefficient μ has any particular value, or indeed that a
 *     coefficient exists at all
 *   * that limiting static friction exceeds kinetic friction, or that this
 *     is what makes a dragged object judder
 *   * that friction turns work into heat
 *   * that a very stiff, very smooth contact can have almost no friction
 *
 * F = μN appears exactly once, on the first bench, as THE RULE THE TABLE
 * OBEYS — which is the honest place for it, because a coefficient of friction
 * is a measured summary of a surface, not a law of nature. On the second
 * bench the table is gone and μ is an OUTPUT: the junctions have to be
 * sheared, so F = τ·A_real, and μ = τ·A_real/N is whatever that division
 * gives. On the third bench even τ is gone.
 *
 * WHAT GOES IN
 *
 *   Newton's second law.
 *   Hooke's law, for the spring balance and for the contact stiffness.
 *   Hertz's elastic contact, w = (4/3)E*√R δ^(3/2) and A = πRδ for one bump
 *     of radius R squashed by δ — geometry and elasticity, no friction in it.
 *   A yield pressure H, past which a bump stops behaving elastically and
 *     spreads at constant pressure.
 *   Summit heights spread exponentially, which is what a ground or machined
 *     surface measures like (Greenwood and Williamson's observation).
 *   A periodic potential U(x) = −U₀cos(2πx/a) for the corrugation a crystal
 *     surface presents, and overdamped motion, which is what motion is at
 *     that size.
 *
 * ---------------------------------------------------------------------------
 * HOW THE NUMBERS ARE GOT
 *
 * The block is integrated with classical RK4 at 2000 steps per second. The
 * direction the table pushes is frozen for the whole of a step, at the
 * direction the block is travelling as the step begins: deciding it inside
 * the step lets the force flip sign between stages and rattles a block that
 * is really at rest. A step that turns the velocity round IS the block
 * stopping, and the grip is then asked whether it can hold it.
 *
 * The contact is solved by bisecting the height of the approaching plane
 * until the summits above it carry exactly the load. The apparent area is a
 * number of summits, so doubling it doubles the summits and nothing else.
 *
 * The junction is integrated with RK4 on the overdamped equation
 * ẋ = (spring + corrugation)/γ. Heat is not assumed: the damper's dissipation
 * is accumulated step by step and compared, in the verification, with the
 * work the puller did.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, carrow, ctext,
  croundRect, chatch, callout, Recorder,
} from '../sim-kit.js';

/* --------------------------------------------------------------- constants */

const G = 9.81, TAU = Math.PI * 2;
const AW = 664, AH = 408;          // apparatus surface, logical px
const GW = 664, GH = 292;          // graph surface
const HB = 1 / 2000;               // s, block substep
const EV = 1.602176634e-19;        // J, for reporting junction energies

/* ========================================================================= *
 * THE MODELS
 * Kept together, above the drawing, so that the physics can be read without
 * reading any canvas code — and so the verification can drive exactly these.
 * ========================================================================= */

/* ---- 1. the block ------------------------------------------------------ */

/**
 * One step of a block pulled through a spring balance whose far end moves at
 * a steady speed. The table obeys one rule: it holds with anything up to
 * μs·N, and once the block moves it pushes back with μk·N against the motion.
 */
function blockStep(s, p, h) {
  const Fs = p.k * (p.vh * s.t - s.x);
  if (s.stuck) {
    if (Math.abs(Fs) > p.us * p.N) s.stuck = false;
    else { s.t += h; return; }
  }
  const v0 = s.v;
  const dir = v0 !== 0 ? Math.sign(v0) : Math.sign(Fs) || 1;
  /* the hand keeps moving inside the step, so the stage times advance too —
   * freeze them and the method quietly drops to first order */
  const acc = (x, tt) => (p.k * (p.vh * tt - x) - p.uk * p.N * dir) / p.m;
  const t0 = s.t;
  const k1v = acc(s.x, t0),                   k1x = s.v;
  const k2v = acc(s.x + h / 2 * k1x, t0 + h / 2), k2x = s.v + h / 2 * k1v;
  const k3v = acc(s.x + h / 2 * k2x, t0 + h / 2), k3x = s.v + h / 2 * k2v;
  const k4v = acc(s.x + h * k3x, t0 + h),     k4x = s.v + h * k3v;
  const dx = h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
  const dv = h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
  s.x += dx; s.v += dv; s.t += h;
  s.heat += p.uk * p.N * Math.abs(dx);
  s.slid += Math.abs(dx);
  if (dir > 0 && s.v <= 0 || dir < 0 && s.v >= 0) {
    s.v = 0;
    if (Math.abs(p.k * (p.vh * s.t - s.x)) <= p.us * p.N) { s.stuck = true; s.grips++; }
  }
}

const pullOf = (s, p) => p.k * (p.vh * s.t - s.x);

/* ---- 2. the contact ---------------------------------------------------- */

/** deterministic noise, so a surface is the same surface every time */
function rnd(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * A rough surface: `n` summits whose heights are spread exponentially about
 * a roughness λ. Nothing about friction is in here — it is a description of
 * a shape.
 */
function makeSurface(seed, n, lambda) {
  const r = rnd(seed), h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = -lambda * Math.log(1 - r() * 0.999999);
  return { h, n, lambda, seed };
}

/**
 * Press a flat down to height d. Every summit taller than d is squashed by
 * δ = h − d; Hertz says what that costs in load and gives in area. A summit
 * whose pressure would exceed the yield pressure H stops being elastic and
 * spreads at constant pressure instead.
 */
function contactAt(surf, d, m) {
  let load = 0, area = 0, spots = 0;
  for (let i = 0; i < surf.n; i++) {
    const del = surf.h[i] - d;
    if (del <= 0) continue;
    const aEl = Math.PI * m.R * del;
    const w = (4 / 3) * m.Estar * Math.sqrt(m.R) * Math.pow(del, 1.5);
    area += (w / aEl > m.H) ? w / m.H : aEl;
    load += w; spots++;
  }
  return { load, area, spots };
}

/** lower the flat until the summits carry exactly the weight on them */
function pressTo(surf, N, m, iters = 64) {
  let lo = 0, hi = 0;
  for (let i = 0; i < surf.n; i++) if (surf.h[i] > hi) hi = surf.h[i];
  hi *= 1.0001;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (contactAt(surf, mid, m).load > N) lo = mid; else hi = mid;
  }
  const d = (lo + hi) / 2;
  return { d, ...contactAt(surf, d, m) };
}

/* ---- 3. one junction --------------------------------------------------- */

const ptEta = p => (4 * Math.PI * Math.PI * p.U0) / (p.k * p.a * p.a);

function ptForce(x, t, p) {
  const dU = (TAU * p.U0 / p.a) * Math.sin(TAU * x / p.a);
  return { spring: p.k * (p.V * t - x), corr: -dU };
}

function ptStep(x, t, p, h) {
  /* the support moves inside the step as well, so each stage is evaluated at
   * its own time; holding the time still costs three orders of accuracy */
  const f = (s, tt) => { const q = ptForce(s, tt, p); return (q.spring + q.corr) / p.gamma; };
  const k1 = f(x, t);
  const k2 = f(x + h / 2 * k1, t + h / 2);
  const k3 = f(x + h / 2 * k2, t + h / 2);
  const k4 = f(x + h * k3, t + h);
  return x + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
}

/* ========================================================================= *
 * THE SIMULATION
 * ========================================================================= */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a2-friction',
    title: 'Friction: the block, the contact and one junction',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    stage: 'block',
    playing: true, ann: false, speed: 1,

    /* the block */
    m: 1.2, us: 0.62, uk: 0.44, vh: 0.012, kb: 220,
    b: { x: 0, v: 0, t: 0, stuck: true, heat: 0, slid: 0, grips: 0 },
    peak: 0, lastPeak: 0, plateau: 0, plateauN: 0,

    /* the contact */
    N: 5, areaMul: 1, rough: 60e-9, tau: 5.4e8,
    R: 40e-6, Estar: 1.1e11, Hy: 2.0e9,

    /* one junction */
    U0: 1.0e-19, ka: 11, a: 3.0e-10, V: 4.0, gamma: 1.0e-11,
    j: { x: 0, t: 0, diss: 0, work: 0, jumps: 0, lost: 0, inJump: null, peak: 0 },
    jF: [],                       // [supportPosition(nm), force(nN)]
  };

  /* The patch that is modelled: 3000 summits, each owning 1e-8 m² of face, so
   * ×1 is four tenths of a square centimetre of a real block's underside. The
   * block on bench 1 is taken to have a face 75 times bigger than that, which
   * is what sets the load the lens is looking at. */
  const NBASE = 3000;
  const CELL = 1e-8;                       // m², the face one summit owns
  const BLOCK_FACE = 3e-3;                 // m², the whole underside of the block
  const mat = () => ({ R: st.R, Estar: st.Estar, H: st.Hy });

  /* Surfaces and sweeps are expensive and change only when a control moves,
   * so they are built once and kept until something invalidates them. */
  let surf = null, press = null, sweep = null, pressB = null;
  const nSummits = () => Math.round(NBASE * st.areaMul);
  const appArea = () => surf.n * CELL;
  /** the share of the block's weight that falls on the patch being modelled */
  const patchLoad = () => st.m * G * (appArea() / BLOCK_FACE);
  function rebuildSurface() {
    surf = makeSurface(1103, nSummits(), st.rough);
    press = null; sweep = null; pressB = null;
  }
  function pressNow() {
    if (!press) press = pressTo(surf, st.N, mat());
    return press;
  }
  function pressBlock() {
    if (!pressB) pressB = pressTo(surf, patchLoad(), mat());
    return pressB;
  }
  /** real area against load, computed from the model, not from a formula */
  function sweepNow() {
    if (sweep) return sweep;
    const Nmax = 12, K = 10, IT = 36;
    const pts = [[0, 0]], pts4 = [[0, 0]];
    for (let i = 1; i <= K; i++) {
      const N = Nmax * i / K;
      pts.push([N, pressTo(surf, N, mat(), IT).area]);
    }
    /* the same loads on four times the face — a different piece of surface,
     * not the same one counted four times */
    const wide = makeSurface(7717, nSummits() * 4, st.rough);
    for (let i = 1; i <= K; i++) {
      const N = Nmax * i / K;
      pts4.push([N, pressTo(wide, N, mat(), IT).area]);
    }
    sweep = { pts, pts4, Nmax };
    return sweep;
  }
  rebuildSurface();

  /* ---------------------------------------------------------- surfaces */

  const av = surface(AW, AH, { label: 'The friction bench' });
  const gv = surface(GW, GH, { label: 'The record of the pull' });

  const rec = new Recorder(gv, {
    window: 16, xLabel: 't (s)', yLabel: 'pull (N)',
    pad: { l: 58, r: 16, t: 16, b: 46 },
  });
  const sPull = rec.add('pull', 'accent', { width: 2.1 });
  const sStat = rec.add('mu_s N', 'text', { width: 1.2, dash: [6, 5] });
  const sKin = rec.add('mu_k N', 'muted', { width: 1.2, dash: [3, 4] });

  /* ---------------------------------------------------------- readouts */

  const outB = readouts([
    { key: 'N',  label: 'Normal force <i>N</i> = <i>mg</i>' },
    { key: 'lim', label: 'Grip limit <i>μ</i><sub>s</sub><i>N</i>' },
    { key: 'kin', label: 'Sliding force <i>μ</i><sub>k</sub><i>N</i>' },
    { key: 'F',  label: 'Spring balance reads' },
    { key: 'sta', label: 'The block is' },
    { key: 'pk', label: 'Peak pull of the last grip' },
    { key: 'pl', label: 'Mean pull while sliding' },
    { key: 'v',  label: 'Block speed / hand speed' },
    { key: 'gr', label: 'Re-grips so far (the judder)' },
    { key: 'q',  label: 'Heat made by the rubbing' },
  ]);

  const outC = readouts([
    { key: 'app', label: 'Apparent area — the face you can see' },
    { key: 'real', label: 'Real area — what actually touches' },
    { key: 'frac', label: 'Fraction of the face in contact' },
    { key: 'spots', label: 'Summits carrying the load' },
    { key: 'aon', label: 'Real area ÷ load' },
    { key: 'pres', label: 'Pressure on the junctions' },
    { key: 'F', label: 'Force to shear them, <i>F</i> = <i>τA</i><sub>real</sub>' },
    { key: 'mu', label: '<i>μ</i> = <i>τA</i><sub>real</sub>/<i>N</i>  (an output)' },
    { key: 'dbl', label: 'Same load on four times the face' },
    { key: 'law', label: 'Is <i>A</i><sub>real</sub> ∝ <i>N</i>?' },
  ]);

  const outJ = readouts([
    { key: 'eta', label: '<i>η</i> = 4π²<i>U</i><sub>0</sub>/(<i>ka</i>²)' },
    { key: 'reg', label: 'Regime' },
    { key: 'Fmax', label: 'Force just before a slip' },
    { key: 'Fm', label: 'Mean lateral force = friction' },
    { key: 'jn', label: 'Slips so far' },
    { key: 'lost', label: 'Energy lost at the last slip' },
    { key: 'heat', label: 'Total heat the damper took' },
    { key: 'work', label: 'Work the puller has done' },
    { key: 'pos', label: 'Tip position / support position' },
    { key: 'bar', label: 'Barrier the corrugation puts up' },
  ]);

  /* ---------------------------------------------------------- controls */

  function resetBlock() {
    pressB = null;
    st.b = { x: 0, v: 0, t: 0, stuck: true, heat: 0, slid: 0, grips: 0 };
    st.peak = 0; st.lastPeak = 0; st.plateau = 0; st.plateauN = 0;
    rec.clear();
  }
  function resetJunction() {
    st.j = { x: 0, t: 0, diss: 0, work: 0, jumps: 0, lost: 0, inJump: null, peak: 0 };
    st.jF = [];
  }

  const sM = slider({ label: '<i>m</i>', min: 0.2, max: 4, step: 0.05, value: st.m,
    format: v => `${v.toFixed(2)} kg`, onInput: v => { st.m = v; resetBlock(); } });
  const sUs = slider({ label: '<i>μ</i><sub>s</sub>', min: 0.05, max: 1.2, step: 0.01, value: st.us,
    format: v => v.toFixed(2), onInput: v => {
      st.us = v; if (st.uk > v) { st.uk = v; sUk.set(v); } resetBlock();
    } });
  const sUk = slider({ label: '<i>μ</i><sub>k</sub>', min: 0.05, max: 1.2, step: 0.01, value: st.uk,
    format: v => v.toFixed(2), onInput: v => {
      st.uk = v; if (v > st.us) { st.us = v; sUs.set(v); } resetBlock();
    } });
  const sV = slider({ label: 'hand speed', word: true, min: 2, max: 60, step: 1, value: st.vh * 1000,
    format: v => `${v.toFixed(0)} mm s⁻¹`, onInput: v => { st.vh = v / 1000; resetBlock(); } });
  const sKb = slider({ label: 'balance <i>k</i>', word: true, min: 60, max: 600, step: 10, value: st.kb,
    format: v => `${v.toFixed(0)} N m⁻¹`, onInput: v => { st.kb = v; resetBlock(); } });

  const sN = slider({ label: '<i>N</i>', min: 0.5, max: 12, step: 0.25, value: st.N,
    format: v => `${v.toFixed(2)} N`, onInput: v => { st.N = v; press = null; } });
  const sA = slider({ label: 'face area', word: true, min: 0.5, max: 4, step: 0.5, value: 1,
    format: v => `× ${v.toFixed(1)}`, onInput: v => { st.areaMul = v; rebuildSurface(); } });
  const sR = slider({ label: 'roughness', word: true, min: 10, max: 200, step: 5, value: 60,
    format: v => `${v.toFixed(0)} nm`, onInput: v => { st.rough = v * 1e-9; rebuildSurface(); } });
  const sT = slider({ label: '<i>τ</i>', min: 0.1, max: 1.2, step: 0.05, value: 0.54,
    format: v => `${v.toFixed(2)} GPa`, onInput: v => { st.tau = v * 1e9; } });

  const sU0 = slider({ label: '<i>U</i><sub>0</sub>', min: 0.1, max: 2, step: 0.05, value: 0.624,
    format: v => `${v.toFixed(2)} eV`, onInput: v => { st.U0 = v * EV; resetJunction(); } });
  const sKa = slider({ label: 'contact <i>k</i>', word: true, min: 1, max: 60, step: 0.5, value: 11,
    format: v => `${v.toFixed(1)} N m⁻¹`, onInput: v => { st.ka = v; resetJunction(); } });
  const sLat = slider({ label: '<i>a</i>', min: 0.2, max: 0.5, step: 0.01, value: 0.3,
    format: v => `${v.toFixed(2)} nm`, onInput: v => { st.a = v * 1e-9; resetJunction(); } });

  const sS = slider({ label: 'sim speed', word: true, min: 0.25, max: 3, step: 0.25, value: 1,
    format: v => `× ${v.toFixed(2)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bReset = button({ label: 'Start again', onClick: () => {
    resetBlock(); resetJunction(); render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  const stageBtns = {};
  function setStage(s) {
    st.stage = s;
    for (const k in stageBtns) stageBtns[k].setPressed(k === s);
    rowB.style.display = s === 'block' ? '' : 'none';
    rowC.style.display = s === 'contact' ? '' : 'none';
    rowJ.style.display = s === 'junction' ? '' : 'none';
    outB.node.style.display = s === 'block' ? '' : 'none';
    outC.node.style.display = s === 'contact' ? '' : 'none';
    outJ.node.style.display = s === 'junction' ? '' : 'none';
    boxA.querySelector('.ibs-panel__title').innerHTML = TITLES[s][0];
    boxG.querySelector('.ibs-panel__title').innerHTML = TITLES[s][1];
    noteEl.innerHTML = NOTES[s];
    render();
  }
  stageBtns.block = button({ label: '1 · The block', pressed: true, onClick: () => setStage('block') });
  stageBtns.contact = button({ label: '2 · The contact, ×20 000', pressed: false, onClick: () => setStage('contact') });
  stageBtns.junction = button({ label: '3 · One junction, atom by atom', pressed: false, onClick: () => setStage('junction') });

  const TITLES = {
    block: ['The bench — a block dragged through a spring balance',
            'What the spring balance reads, against time'],
    contact: ['The two faces at about ×20 000 — only the summits meet',
              'Real area of contact against the load pressing them together'],
    junction: ['One junction — a single contact on the lattice beneath it',
               'The sideways force on the junction as the support moves'],
  };

  const NOTES = {
    block: '<b>Physics.</b> The table here obeys one rule, and it is the only place in ' +
      'this simulation where a coefficient of friction is written down: it can hold the ' +
      'block with any force up to <i>μ</i><sub>s</sub><i>N</i>, and once the block moves it ' +
      'pushes back with <i>μ</i><sub>k</sub><i>N</i> against the motion. Everything on the ' +
      'trace follows from that and from <i>F</i> = <i>ma</i>, integrated with 4th-order ' +
      'Runge–Kutta at 2000 steps a second. Watch the pull climb while nothing moves — the ' +
      'block is <em>not</em> being pushed by <i>μ</i><sub>s</sub><i>N</i>, it is being held by ' +
      'exactly as much as it needs — and then the balance flicks back the moment it lets go, ' +
      'because sliding takes less. That gap is the judder, and what sets its rhythm is how ' +
      'long the balance takes to be stretched back across it: the time from one lurch to the ' +
      'next is 2(<i>μ</i><sub>s</sub> − <i>μ</i><sub>k</sub>)<i>N</i>/<i>kv</i>, so a stiffer ' +
      'balance or a quicker hand makes the chatter faster, not gentler — which is why a ' +
      'squeaking door and a violin string are the same effect at different pitches. Nothing ' +
      'here explains <em>why</em> the table behaves like this. Bench 2 does.',
    contact: '<b>Physics.</b> There is no coefficient of friction on this bench. Two rough ' +
      'faces are pressed together, the summits are squashed according to Hertz — ' +
      '<i>w</i> = (4/3)<i>E</i>*√<i>R</i> <i>δ</i><sup>3/2</sup> over an area π<i>Rδ</i>, ' +
      'elasticity and geometry with nothing about rubbing in it — and a summit that is ' +
      'pressed past its yield pressure spreads instead. Press harder and the taller summits ' +
      'flatten <em>and</em> shorter ones come into play, and those two effects together make ' +
      'the real area come out proportional to the load. That is Amontons’ first law, and ' +
      'it was not put in. Now make the face four times bigger at the same load: the same ' +
      'real area touches, because the load simply spreads over more, less squashed summits — ' +
      'Amontons’ second law, also not put in. Friction is the force needed to shear those ' +
      'welded junctions, <i>F</i> = <i>τA</i><sub>real</sub>, so ' +
      '<i>μ</i> = <i>τA</i><sub>real</sub>/<i>N</i> is an <em>answer</em>, not a setting.',
    junction: '<b>Physics.</b> Take one of those junctions down to the atoms. The surface ' +
      'underneath is a lattice, so it offers a corrugated potential ' +
      '<i>U</i> = −<i>U</i><sub>0</sub>cos(2π<i>x</i>/<i>a</i>); the junction is held to the ' +
      'body above by a bond of stiffness <i>k</i>, and at this size motion is overdamped. ' +
      'Nothing tells it that friction dissipates energy. The support creeps forward, the tip ' +
      'stays trapped in one well while the bond stretches, and when the well finally loses its ' +
      'barrier the tip snaps into the next one and the stored energy goes into the damper as ' +
      'heat. Friction is not a steady drag — it is a series of snaps, and the lower curve is ' +
      'the sawtooth an atomic force microscope actually records. Watch <i>η</i>: below 1 the ' +
      'barrier never disappears faster than the bond can follow, the tip slides through ' +
      'without snapping, and the friction very nearly vanishes. That is superlubricity, and ' +
      'it is a real effect, not a bug.',
  };

  /* ------------------------------------------------------------ layout */

  const boxA = panelBox(TITLES.block[0], av.el);
  const boxG = panelBox(TITLES.block[1], gv.el);
  const rowB = controls([sM.node, sUs.node, sUk.node, sV.node, sKb.node]);
  const rowC = controls([sN.node, sA.node, sR.node, sT.node]);
  const rowJ = controls([sU0.node, sKa.node, sLat.node]);
  const noteEl = note(NOTES.block);

  root.append(
    heading('The Friction Bench',
            'one phenomenon at three magnifications — the block, the contact, one junction'),
    boxA, boxG,
    controls([el('div', { class: 'ibs-btns' },
      [stageBtns.block.node, stageBtns.contact.node, stageBtns.junction.node])],
      { label: 'bench:' }),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bReset.node, bAnn.node])]),
    rowB, rowC, rowJ,
    controls([sS.node]),
    outB.node, outC.node, outJ.node,
    noteEl,
  );
  rowC.style.display = 'none';
  rowJ.style.display = 'none';
  outC.node.style.display = 'none';
  outJ.node.style.display = 'none';

  /* ================================================================== *
   * advancing the models
   * ================================================================== */

  let accB = 0, accJ = 0;
  const HJ = 2e-14;                       // s, junction substep

  function stepBlock() {
    const p = { m: st.m, k: st.kb, us: st.us, uk: st.uk, vh: st.vh, N: st.m * G };
    const wasStuck = st.b.stuck;
    blockStep(st.b, p, HB);
    const F = pullOf(st.b, p);
    if (st.b.stuck) { if (F > st.peak) st.peak = F; }
    else {
      if (wasStuck) { st.lastPeak = st.peak; st.peak = 0; st.plateau = 0; st.plateauN = 0; }
      st.plateau += F; st.plateauN++;
    }
  }

  function stepJunction() {
    const p = { U0: st.U0, a: st.a, k: st.ka, V: st.V, gamma: st.gamma };
    const j = st.j;
    const { spring } = ptForce(j.x, j.t, p);
    const xn = ptStep(j.x, j.t, p, HJ);
    const v = (xn - j.x) / HJ;
    j.work += spring * p.V * HJ;
    j.diss += p.gamma * v * v * HJ;
    if (!j.inJump && v > 5 * p.V) j.inJump = { d0: j.diss };
    if (j.inJump && v < 2 * p.V) {
      j.jumps++; j.lost = j.diss - j.inJump.d0; j.inJump = null;
    }
    if (Math.abs(spring) > Math.abs(j.peak) && !j.inJump) j.peak = spring;
    j.x = xn; j.t += HJ;
  }

  function advance(dt) {
    const d = Math.min(dt, 0.1) * st.speed;
    if (st.stage === 'block') {
      accB += d;
      let guard = 0;
      while (accB >= HB && guard++ < 6000) { stepBlock(); accB -= HB; }
      const p = { m: st.m, k: st.kb, us: st.us, uk: st.uk, vh: st.vh, N: st.m * G };
      rec.push(st.b.t, [pullOf(st.b, p), st.us * p.N, st.uk * p.N]);
      if (st.b.t > 120) resetBlock();
    } else if (st.stage === 'junction') {
      /* 1.5 ps of junction time per second of wall clock: the whole point is
       * visible at human speed, and every step is still integrated. */
      accJ += d * 2.5e-11;
      let guard = 0;
      while (accJ >= HJ && guard++ < 4000) { stepJunction(); accJ -= HJ; }
      const p = { U0: st.U0, a: st.a, k: st.ka, V: st.V, gamma: st.gamma };
      const { spring } = ptForce(st.j.x, st.j.t, p);
      st.jF.push([st.j.t * p.V * 1e9, spring * 1e9]);
      if (st.jF.length > 1400) st.jF.shift();
      if (st.j.t * p.V > 4.2e-9) resetJunction();
    }
  }

  /* ================================================================== *
   * bench 1 — the block
   * ================================================================== */

  let P = palette(root);

  const TOP = 262;                   // y of the table top
  const PPM = 900;                   // px per metre along the bench
  const BW = 122, BH = 76;
  const X0 = 200;                    // screen x of world x = 0
  const LREST = 116;                  // px, the balance at rest length

  function blockGeom() {
    const xh = st.vh * st.b.t;
    const cam = Math.max(0, st.b.x - 0.10);
    const sx = w => X0 + (w - cam) * PPM;
    const bx = sx(st.b.x);
    /* the hand holds the far end of the balance, so it sits at the block plus
     * the balance's rest length plus however far the spring has been pulled out */
    const ext = (xh - st.b.x) * PPM;
    return { xh, cam, sx, bx, hx: bx + BW + LREST + Math.max(0, ext) };
  }

  function drawTable(ctx, g) {
    ctx.fillStyle = P.soft;
    ctx.fillRect(0, TOP, AW, AH - TOP);
    chatch(ctx, 0, TOP, AW, 0, { color: P.muted, gap: 13, len: 13 });
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, TOP); ctx.lineTo(AW, TOP); ctx.stroke();

    /* centimetre marks on the bench, so the creep is visible */
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const c0 = Math.floor(g.cam * 100), c1 = c0 + Math.ceil(AW / PPM * 100) + 2;
    for (let c = c0; c <= c1; c++) {
      const x = g.sx(c / 100);
      if (x < -10 || x > AW + 10) continue;
      const big = c % 5 === 0;
      ctx.beginPath(); ctx.moveTo(x, TOP + 2); ctx.lineTo(x, TOP + (big ? 13 : 7)); ctx.stroke();
      if (big) ctx.fillText(`${c}`, x, TOP + 15);
    }
    ctext(ctx, 'cm along the bench', AW - 12, TOP + 30,
      { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
  }

  /** the spring balance: a barrel, a coil inside it, and a pointer */
  function drawBalance(ctx, x1, x2, y, F, Fmax) {
    const len = Math.max(54, x2 - x1);
    const bh = 30, by = y - bh / 2;
    ctx.save();
    /* the coil, drawn at the extension it actually has */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath();
    const n = 14, cx0 = x1 + 8, cl = len - 26;
    ctx.moveTo(x1, y); ctx.lineTo(cx0, y);
    for (let i = 0; i < n; i++) {
      ctx.lineTo(cx0 + cl * (i + 0.5) / n, y + (i % 2 ? 9 : -9));
    }
    ctx.lineTo(cx0 + cl, y); ctx.lineTo(x2, y);
    ctx.stroke();
    /* the scale above it */
    const sw = 92, sx = x2 - sw, sy = by - 34;
    croundRect(ctx, sx, sy, sw, 20, 5);
    ctx.fillStyle = P.bg; ctx.fill();
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = P.muted;
    for (let i = 0; i <= 8; i++) {
      const gx = sx + 5 + (sw - 10) * i / 8;
      ctx.beginPath(); ctx.moveTo(gx, sy + 20); ctx.lineTo(gx, sy + (i % 4 === 0 ? 9 : 14));
      ctx.stroke();
    }
    const fr = clamp(F / Fmax, 0, 1);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6;
    const px = sx + 5 + (sw - 10) * fr;
    ctx.beginPath(); ctx.moveTo(px, sy + 19); ctx.lineTo(px, sy + 4); ctx.stroke();
    ctext(ctx, 'spring balance', sx + sw / 2, sy - 6,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });
    ctx.restore();
  }

  /** the hand: a simple grip, moving at a steady speed */
  function drawHand(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = P.accent;
    croundRect(ctx, x, y - 16, 16, 32, 5); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.4; ctx.stroke();
    carrow(ctx, x + 22, y, x + 60, y, { color: P.accent, width: 2.2, head: 9 });
    ctext(ctx, 'steady pull', x + 24, y + 20,
      { font: `500 10.5px ${P.font}`, color: P.muted });
    ctx.restore();
  }

  /**
   * A window of M summits across the interface. A real face touches on a few
   * parts in ten thousand, so a window dropped at random would almost always
   * show nothing happening: this one is placed over a summit that IS carrying
   * load, and the drawings say so.
   */
  function windowAt(pr, M) {
    let first = -1;
    for (let i = 0; i < surf.n; i++) if (surf.h[i] > pr.d) { first = i; break; }
    if (first < 0) first = 0;
    return Math.max(0, Math.min(surf.n - M - 1, first - Math.floor(M / 2)));
  }

  /** the profile, the plane the load sits at, and the junctions, in a box */
  function drawInterface(ctx, x0, y0, wid, hei, pr, M, KX, patchesOnly = false) {
    const m = mat();
    const start = windowAt(pr, M);
    const base = y0 + hei;
    const scale = (hei * 0.62) / Math.max(st.rough * 6, 1e-12);
    const step = wid / M;
    const hgt = i => surf.h[(start + i) % surf.n];

    if (!patchesOnly) {
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(x0, base);
      for (let i = 0; i < M; i++) {
        const x = x0 + step * i;
        ctx.quadraticCurveTo(x + step / 2, base - hgt(i) * scale * 2, x + step, base);
      }
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.10; ctx.fillStyle = P.text;
      ctx.lineTo(x0 + wid, base + 40); ctx.lineTo(x0, base + 40); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    const py = base - pr.d * scale;
    let touching = 0;
    ctx.fillStyle = P.accent;
    for (let i = 0; i < M; i++) {
      const del = hgt(i) - pr.d;
      if (del <= 0) continue;
      touching++;
      const x = x0 + step * i + step / 2;
      const aw = Math.max(3, Math.min(step * 1.5, Math.sqrt(m.R * del) * KX));
      ctx.fillRect(x - aw / 2, py - 4, aw, 8);
    }
    return { py, touching, start, step, base };
  }

  /** a window into the interface under the block */
  function drawLens(ctx, cx, cy) {
    const R = 66;
    const pr = pressBlock();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.fillStyle = P.bg; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const q = drawInterface(ctx, cx - R, cy - R + 24, 2 * R, 2 * R - 40, pr, 9, 7.0e6);
    ctx.fillStyle = P.bg;
    ctx.fillRect(cx - R, q.py - 52, 2 * R, 52);
    ctx.fillStyle = P.soft;
    ctx.fillRect(cx - R, q.py - 52, 2 * R, 52);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - R, q.py); ctx.lineTo(cx + R, q.py); ctx.stroke();
    /* re-draw the junctions so the body does not cover them */
    drawInterface(ctx, cx - R, cy - R + 24, 2 * R, 2 * R - 40, pr, 9, 7.0e6, true);
    ctx.restore();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctext(ctx, 'the interface, hugely magnified', cx, cy - R - 20,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });
    ctext(ctx, 'heights exaggerated', cx, cy - R - 8,
      { font: `500 9.5px ${P.font}`, color: P.muted, align: 'center' });
  }

  function drawBlockBench() {
    const ctx = av.ctx, g = blockGeom();
    const p = { m: st.m, k: st.kb, us: st.us, uk: st.uk, vh: st.vh, N: st.m * G };
    const F = pullOf(st.b, p), W = p.N;

    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);
    drawTable(ctx, g);

    const bx = g.bx, by = TOP - BH, bcx = bx + BW / 2;

    /* where the hand has got to, as a dashed line down to the bench */
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.4; ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(g.hx, by - 52); ctx.lineTo(g.hx, TOP); ctx.stroke();
    ctx.restore();

    /* the block */
    const gr = ctx.createLinearGradient(bx, by, bx + BW, TOP);
    gr.addColorStop(0, '#5fa3ab'); gr.addColorStop(0.35, '#005F6A'); gr.addColorStop(1, '#00272d');
    croundRect(ctx, bx, by, BW, BH, 6);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#fff';
    croundRect(ctx, bx + 8, by + 8, BW - 16, 11, 4); ctx.fill(); ctx.restore();
    ctext(ctx, `${fmt(st.m, 2)} kg`, bcx, by + BH / 2 + 5,
      { font: `600 14px ${P.font}`, color: '#fff', align: 'center' });

    /* the balance and the hand */
    drawBalance(ctx, bx + BW, g.hx, by + BH / 2, F, Math.max(st.us * W * 1.25, 0.5));
    drawHand(ctx, g.hx, by + BH / 2);

    /* the forces on the block: the weight and the normal force clear of the
     * body so they can be read, the friction where it actually acts */
    carrow(ctx, bcx + 30, TOP, bcx + 30, TOP + 62, { color: P.text, width: 2.2, head: 9 });
    ctext(ctx, 'W', bcx + 36, TOP + 58, { font: P.sym(13), color: P.text, halo: P.bg });
    carrow(ctx, bcx - 30, by - 4, bcx - 30, by - 62, { color: P.text, width: 2.2, head: 9 });
    ctext(ctx, 'N', bcx - 44, by - 56, { font: P.sym(13), color: P.text, halo: P.bg });

    const fLen = clamp(F / Math.max(st.us * W, 1e-6) * 78, 0, 92);
    if (carrow(ctx, bx + 4, TOP - 7, bx + 4 - fLen, TOP - 7,
               { color: P.accent, width: 2.6, head: 10, min: 6 })) {
      ctext(ctx, 'f', bx - fLen, TOP - 13, { font: P.sym(14), color: P.accent, halo: P.bg });
    }

    /* the state of the grip, in words — the numbers are in the readouts */
    ctext(ctx, st.b.stuck
      ? 'gripped — the table is holding it with exactly as much as it needs'
      : 'sliding — the table pushes back with the same force however fast it goes',
      AW / 2, AH - 16, { font: `600 12px ${P.font}`, color: st.b.stuck ? P.text : P.accent,
                    align: 'center' });

    drawLens(ctx, 88, 132);

    if (st.ann) {
      callout(ctx, st.b.stuck
        ? ['The pull is climbing but nothing moves.',
           'Static friction is not μs N — it is',
           'whatever balances the pull, up to that.']
        : ['It let go at μs N and now needs only',
           'μk N, so the spring balance flicks back',
           'and the block lurches forward.'],
        AW - 300, AH - 82, bx + 4, TOP - 7, { palette: P });
    }
  }

  /* ================================================================== *
   * bench 2 — the contact
   * ================================================================== */

  function drawContactBench() {
    const ctx = av.ctx, pr = pressNow();
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    const L = 30, Rt = AW - 214, M = 34;
    const top = 82, hei = 156;
    const q = drawInterface(ctx, L, top, Rt - L, hei, pr, M, 8.0e6);
    chatch(ctx, L, q.base + 40, Rt - L, 0, { color: P.muted, gap: 12, len: 11 });

    /* the upper body, resting on the summits that carry the load */
    ctx.fillStyle = P.bg;
    ctx.fillRect(L, q.py - 86, Rt - L, 86);
    ctx.fillStyle = P.soft;
    ctx.fillRect(L, q.py - 86, Rt - L, 86);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
    ctx.strokeRect(L, q.py - 86, Rt - L, 86);
    ctext(ctx, 'the block, pressed down by N', (L + Rt) / 2, q.py - 44,
      { font: `600 12px ${P.font}`, color: P.text, align: 'center' });
    carrow(ctx, (L + Rt) / 2, q.py - 126, (L + Rt) / 2, q.py - 90,
      { color: P.text, width: 2.4, head: 10 });
    ctext(ctx, 'N', (L + Rt) / 2 + 8, q.py - 106, { font: P.sym(14), color: P.text });
    /* the junctions again, so the body does not paint over them */
    drawInterface(ctx, L, top, Rt - L, hei, pr, M, 8.0e6, true);

    ctext(ctx, `a window across ${M} summits, placed where the faces touch — ` +
                `${q.touching} of them are carrying load here`,
      (L + Rt) / 2, q.base + 68, { font: `500 11px ${P.font}`, color: P.muted, align: 'center' });
    ctext(ctx, 'heights hugely exaggerated: a machined face is far flatter than this',
      (L + Rt) / 2, q.base + 84, { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });

    /* the apparent area against the real area, drawn to the same scale */
    const px0 = Rt + 28, pw = AW - px0 - 20, ph = 132, py0 = 96;
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    ctx.strokeRect(px0, py0, pw, ph);
    ctext(ctx, 'the face you can see', px0 + pw / 2, py0 - 26,
      { font: `600 10.5px ${P.font}`, color: P.text, align: 'center' });
    ctext(ctx, `${fmt(appArea() * 1e4, 2)} cm²`, px0 + pw / 2, py0 - 12,
      { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    const frac = pr.area / appArea();
    /* every junction on the face, gathered into one patch, drawn to scale */
    const r = Math.sqrt(frac * pw * ph / Math.PI);
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(px0 + pw / 2, py0 + ph / 2, Math.max(1, r), 0, TAU); ctx.fill();
    if (r < 3) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px0 + pw / 2, py0 + ph / 2, 11, 0, TAU); ctx.stroke();
    }
    ctext(ctx, 'everything that really', px0 + pw / 2, py0 + ph + 16,
      { font: `500 10.5px ${P.font}`, color: P.accent, align: 'center' });
    ctext(ctx, 'touches, gathered into', px0 + pw / 2, py0 + ph + 29,
      { font: `500 10.5px ${P.font}`, color: P.accent, align: 'center' });
    ctext(ctx, 'one patch, to scale', px0 + pw / 2, py0 + ph + 42,
      { font: `500 10.5px ${P.font}`, color: P.accent, align: 'center' });

    if (st.ann) {
      callout(ctx, ['Press harder and two things happen at once:',
                    'the summits already touching flatten, and',
                    'new, shorter ones come into contact. Those',
                    'two together make the real area grow in',
                    'proportion to the load.'],
        22, 18, (L + Rt) / 2, q.py, { palette: P });
    }
  }

  /** real area against load, drawn on the graph surface */
  function drawContactGraph() {
    const ctx = gv.ctx, sw = sweepNow();
    ctx.clearRect(0, 0, GW, GH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW, GH);
    const X0g = 64, X1g = GW - 22, Y0g = 18, Y1g = GH - 46;

    let amax = 0;
    for (const q of sw.pts4) amax = Math.max(amax, q[1]);
    amax = Math.max(amax, 1e-12) * 1.1;
    const TX = N => X0g + N / sw.Nmax * (X1g - X0g);
    const TY = A => Y1g - A / amax * (Y1g - Y0g);

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(X0g, Y0g, X1g - X0g, Y1g - Y0g);
    ctx.strokeStyle = P.line;
    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 1; i <= 4; i++) {
      const N = sw.Nmax * i / 4, gx = TX(N);
      ctx.beginPath(); ctx.moveTo(gx, Y0g); ctx.lineTo(gx, Y1g); ctx.stroke();
      ctx.fillText(fmt(N, 0), gx, Y1g + 5);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('0', X0g - 5, Y1g);
    ctx.fillText((amax * 1e12).toPrecision(2), X0g - 5, Y0g + 5);
    ctx.fillStyle = P.text; ctx.font = P.sym(12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('N (N)', (X0g + X1g) / 2, Y1g + 32);
    ctx.save(); ctx.translate(14, (Y0g + Y1g) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('A real (µm²)', 0, 0); ctx.restore();

    const line = (pts, color, width, dash) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(TX(q[0]), TY(q[1])) : ctx.moveTo(TX(q[0]), TY(q[1]))));
      ctx.stroke(); ctx.restore();
    };
    line(sw.pts4, P.muted, 1.6, [5, 4]);
    line(sw.pts, P.accent, 2.4);

    /* where the sliders are sitting now */
    const pr = pressNow();
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(TX(st.N), TY(pr.area), 4.2, 0, TAU); ctx.fill();

    /* a legend, because the two curves are meant to lie on top of each other */
    const lx = X0g + 22, ly = Y0g + 18;
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 26, ly); ctx.stroke();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(lx, ly + 17); ctx.lineTo(lx + 26, ly + 17); ctx.stroke();
    ctx.restore();
    ctext(ctx, 'this face', lx + 33, ly + 4, { font: `600 11px ${P.font}`, color: P.accent });
    ctext(ctx, 'four times the face — the same line, which is Amontons’ second law',
      lx + 33, ly + 21, { font: `600 11px ${P.font}`, color: P.muted });
  }

  /* ================================================================== *
   * bench 3 — one junction
   * ================================================================== */

  /**
   * How much of a barrier is still in front of the tip. Nothing assumes there
   * is one: the total energy is walked forward from where the tip is sitting
   * and the first turning point that goes back down is the top of the barrier.
   * When the pull has tilted the landscape far enough there is no turning
   * point left, and that is the instant the tip snaps.
   */
  function barrierAhead() {
    const p = { U0: st.U0, a: st.a, k: st.ka, V: st.V };
    const X = p.V * st.j.t, x0 = st.j.x;
    const U = u => -p.U0 * Math.cos(TAU * u / p.a) + 0.5 * p.k * (X - u) * (X - u);
    const u0 = U(x0);
    let prev = u0, rising = false, top = null, xTop = null;
    const n = 300, span = 1.6 * p.a;
    for (let i = 1; i <= n; i++) {
      const u = x0 + span * i / n, e = U(u);
      if (e > prev + 1e-30) rising = true;
      else if (rising) { top = prev; xTop = x0 + span * (i - 1) / n; break; }
      prev = e;
    }
    return top == null ? { dE: 0, xTop: null } : { dE: Math.max(0, top - u0), xTop };
  }

  function drawJunctionBench() {
    const ctx = av.ctx;
    const p = { U0: st.U0, a: st.a, k: st.ka, V: st.V, gamma: st.gamma };
    const j = st.j, X = p.V * j.t;
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    /* The window is a couple of lattice spacings wide. Any wider and the
     * stretched bond's parabola swamps the corrugation, which is exactly the
     * thing that has to be visible. */
    const SPAN = 2.4 * p.a;
    const cx = AW / 2, PX = (AW - 90) / SPAN;       // px per metre
    const centre = j.x;
    const sx = u => cx + (u - centre) * PX;

    /* --- the lattice and the tip, upper half --- */
    const latY = 132;
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    const i0 = Math.floor((centre - SPAN / 2) / p.a) - 1;
    const i1 = Math.ceil((centre + SPAN / 2) / p.a) + 1;
    /* the surface below: a corrugated face with an atom on every crest, at the
     * true spacing a, so the period of the potential is the period you see */
    const surfY = latY + 58, amp = 9;
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let gx = 0; gx <= AW; gx += 3) {
      const u = centre + (gx - cx) / PX;
      const y = surfY - amp * Math.cos(TAU * u / p.a);
      gx === 0 ? ctx.moveTo(gx, y) : ctx.lineTo(gx, y);
    }
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.fillStyle = P.text;
    ctx.lineTo(AW, surfY + 44); ctx.lineTo(0, surfY + 44); ctx.closePath(); ctx.fill();
    ctx.restore();
    const aR = 22;
    for (let i = i0; i <= i1; i++) {
      const x = sx(i * p.a);
      if (x < -40 || x > AW + 40) continue;
      ctx.save();
      ctx.fillStyle = P.soft;
      ctx.beginPath(); ctx.arc(x, surfY - amp + 2, aR, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.muted; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    ctext(ctx, 'the surface underneath — one atom every a, and that spacing is the corrugation',
      AW / 2, surfY + 52, { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });

    /* the body above, creeping along at V */
    const supX = clamp(sx(X), 40, AW - 40);
    const barY = latY - 66;
    ctx.fillStyle = P.soft;
    ctx.fillRect(30, barY, AW - 60, 26);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5;
    ctx.strokeRect(30, barY, AW - 60, 26);
    ctext(ctx, 'the body above', 44, barY + 18,
      { font: `600 11px ${P.font}`, color: P.text });
    carrow(ctx, AW - 140, barY + 14, AW - 46, barY + 14,
      { color: P.accent, width: 2.2, head: 9 });
    ctext(ctx, 'V', AW - 158, barY + 19, { font: P.sym(14), color: P.accent });

    /* where the far end of the bond has got to, and the bond itself */
    const tipX = sx(j.x), tipY = latY + 2;
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(supX, barY + 26); ctx.lineTo(supX, tipY); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = P.accent;
    ctx.beginPath();
    ctx.moveTo(supX, barY + 34); ctx.lineTo(supX - 6, barY + 26); ctx.lineTo(supX + 6, barY + 26);
    ctx.closePath(); ctx.fill();

    ctx.save();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = 10, len = tipX - supX;
    ctx.moveTo(supX, tipY);
    for (let i = 0; i < n; i++) {
      ctx.lineTo(supX + len * (i + 0.5) / n, tipY + (i % 2 ? 9 : -9));
    }
    ctx.lineTo(tipX, tipY);
    ctx.stroke(); ctx.restore();
    ctext(ctx, 'the bond, stiffness k', (supX + tipX) / 2, tipY - 18,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center', halo: P.bg });

    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(tipX, tipY, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5; ctx.stroke();
    ctext(ctx, 'the junction', tipX, tipY + 34,
      { font: `600 11px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });

    /* --- the energy landscape, lower half --- */
    const eY = 354, eH = 86;
    const U = u => -p.U0 * Math.cos(TAU * u / p.a) + 0.5 * p.k * (X - u) * (X - u);
    let lo = Infinity, hi = -Infinity;
    const samples = [];
    for (let i = 0; i <= 260; i++) {
      const u = centre - SPAN / 2 + SPAN * i / 260;
      const e = U(u);
      samples.push([u, e]);
      if (e < lo) lo = e; if (e > hi) hi = e;
    }
    const EY = e => eY - (e - lo) / Math.max(hi - lo, 1e-30) * eH;
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((q, i) => (i ? ctx.lineTo(sx(q[0]), EY(q[1])) : ctx.moveTo(sx(q[0]), EY(q[1]))));
    ctx.stroke();
    /* the barrier still standing in front of it */
    const bar = barrierAhead();
    if (bar.xTop != null && bar.dE > 0) {
      const bxp = sx(bar.xTop);
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bxp, EY(U(bar.xTop))); ctx.lineTo(bxp, EY(U(j.x)));
      ctx.stroke(); ctx.restore();
      ctext(ctx, 'barrier', bxp, EY(U(bar.xTop)) - 10,
        { font: `600 10.5px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });
    }
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(sx(j.x), EY(U(j.x)) - 6, 6.5, 0, TAU); ctx.fill();
    ctext(ctx, 'total energy of the junction: the lattice corrugation plus the stretched bond',
      AW / 2, eY + 30, { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });

    const eta = ptEta(p);
    ctext(ctx, eta > 1
      ? 'the well still has a barrier — the tip is trapped, and the bond is stretching'
      : 'no barrier survives — the tip follows the support without ever snapping',
      AW / 2, 22, { font: `600 12px ${P.font}`, color: eta > 1 ? P.text : P.accent,
                    align: 'center' });

    if (st.ann) {
      callout(ctx, ['The support pulls, the well tilts, and the',
                    'barrier in front of the tip shrinks. When it',
                    'vanishes the tip snaps forward and the energy',
                    'stored in the bond has nowhere to go but heat.'],
        18, AH - 92, sx(j.x), EY(U(j.x)), { palette: P });
    }
  }

  /** the sawtooth: lateral force against how far the support has moved */
  function drawJunctionGraph() {
    const ctx = gv.ctx;
    ctx.clearRect(0, 0, GW, GH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW, GH);
    const X0g = 64, X1g = GW - 18, Y0g = 18, Y1g = GH - 46;
    const span = 4.2;                                 // nm of support travel shown
    let m = 0.2;
    for (const q of st.jF) m = Math.max(m, Math.abs(q[1]));
    m *= 1.15;
    const TX = u => X0g + clamp(u / span, 0, 1) * (X1g - X0g);
    const TY = f => (Y0g + Y1g) / 2 - f / m * (Y1g - Y0g) / 2;

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(X0g, Y0g, X1g - X0g, Y1g - Y0g);
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = P.frame;
    ctx.beginPath(); ctx.moveTo(X0g, TY(0)); ctx.lineTo(X1g, TY(0)); ctx.stroke(); ctx.restore();

    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let u = 1; u <= 4; u++) {
      const gx = TX(u);
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(gx, Y0g); ctx.lineTo(gx, Y1g); ctx.stroke();
      ctx.fillText(String(u), gx, Y1g + 5);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('+' + m.toPrecision(2), X0g - 5, Y0g + 5);
    ctx.fillText('0', X0g - 5, TY(0));
    ctx.fillStyle = P.text; ctx.font = P.sym(12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('support position (nm)', (X0g + X1g) / 2, Y1g + 32);
    ctx.save(); ctx.translate(14, (Y0g + Y1g) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('lateral force (nN)', 0, 0); ctx.restore();

    if (st.jF.length > 60) {
      ctx.save();
      ctx.beginPath(); ctx.rect(X0g, Y0g, X1g - X0g, Y1g - Y0g); ctx.clip();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      st.jF.forEach((q, i) => (i ? ctx.lineTo(TX(q[0]), TY(q[1])) : ctx.moveTo(TX(q[0]), TY(q[1]))));
      ctx.stroke();
      /* the mean, which is what a friction force is */
      let s = 0; for (const q of st.jF) s += q[1];
      const mean = s / st.jF.length;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(X0g, TY(mean)); ctx.lineTo(X1g, TY(mean)); ctx.stroke();
      ctx.restore();
      ctext(ctx, 'mean — this is the friction force', X0g + 8, TY(mean) - 6,
        { font: `600 10.5px ${P.font}`, color: P.text, halo: P.bg });
    }
  }

  /* ================================================================== *
   * readouts
   * ================================================================== */

  function renderBlockReads() {
    const p = { m: st.m, k: st.kb, us: st.us, uk: st.uk, vh: st.vh, N: st.m * G };
    const F = pullOf(st.b, p);
    outB.setAll({
      N: `${fmt(p.N, 2)} N`,
      lim: `${fmt(st.us * p.N, 2)} N`,
      kin: `${fmt(st.uk * p.N, 2)} N`,
      F: `${fmt(F, 2)} N`,
      sta: st.b.stuck ? 'gripped' : 'sliding',
      pk: st.lastPeak ? `${fmt(st.lastPeak, 3)} N` : 'not let go yet',
      pl: st.plateauN ? `${fmt(st.plateau / st.plateauN, 3)} N` : '—',
      v: `${fmt(st.b.v * 1000, 1)} / ${fmt(st.vh * 1000, 1)} mm s⁻¹`,
      gr: `${st.b.grips}`,
      q: `${fmt(st.b.heat * 1000, 1)} mJ over ${fmt(st.b.slid * 100, 2)} cm`,
    });
  }

  function renderContactReads() {
    const pr = pressNow(), app = appArea();
    const F = st.tau * pr.area, mu = st.N > 0 ? F / st.N : 0;
    const sw = sweepNow();
    /* is it a straight line through the origin? measured off the drawn curve,
     * with the slope taken from the far end and every point tested against it */
    const slope = sw.pts[sw.pts.length - 1][1] / sw.Nmax;
    let worst = 0;
    for (const q of sw.pts) if (q[0] > 0) worst = Math.max(worst, Math.abs(q[1] - slope * q[0]) / q[1]);
    const a4 = sw.pts4[sw.pts4.length - 1][1], a1 = sw.pts[sw.pts.length - 1][1];
    outC.setAll({
      app: `${fmt(app * 1e4, 2)} cm²`,
      real: `${fmt(pr.area * 1e12, 0)} µm²  (${fmt(Math.sqrt(pr.area) * 1e6, 0)} µm square)`,
      frac: `${sci(pr.area / app, 2)}  = ${fmt(pr.area / app * 100, 4)} %`,
      spots: `${pr.spots} of ${surf.n}`,
      aon: `${fmt(pr.area / Math.max(st.N, 1e-9) * 1e12, 0)} µm² N⁻¹`,
      pres: `${fmt(st.N / Math.max(pr.area, 1e-18) / 1e6, 0)} MPa  (nominal ` +
            `${fmt(st.N / app / 1e3, 1)} kPa)`,
      F: `${fmt(F, 3)} N`,
      mu: `${fmt(mu, 3)}`,
      dbl: `${fmt(a4 * 1e12, 0)} µm² against ${fmt(a1 * 1e12, 0)} µm² at ${sw.Nmax} N`,
      law: `departs by at most ${fmt(worst * 100, 2)} %`,
    });
  }

  function renderJunctionReads() {
    const p = { U0: st.U0, a: st.a, k: st.ka, V: st.V, gamma: st.gamma };
    const j = st.j, eta = ptEta(p);
    let s = 0; for (const q of st.jF) s += q[1];
    const mean = st.jF.length ? s / st.jF.length : 0;   // already in nN
    const bar = barrierAhead().dE;
    outJ.setAll({
      eta: `${fmt(eta, 2)}`,
      reg: eta > 1 ? 'stick–slip: the tip snaps from well to well'
                   : 'superlubric: it slides through without snapping',
      Fmax: `${fmt(j.peak * 1e9, 3)} nN`,
      Fm: `${fmt(mean, 3)} nN`,
      jn: `${j.jumps}`,
      lost: j.lost ? `${fmt(j.lost / EV, 2)} eV` : '—',
      heat: `${fmt(j.diss / EV, 2)} eV`,
      work: `${fmt(j.work / EV, 2)} eV`,
      pos: `${fmt(j.x * 1e9, 3)} / ${fmt(p.V * j.t * 1e9, 3)} nm`,
      bar: bar > 0 ? `${fmt(bar / EV, 3)} eV still in front of the tip`
                   : 'none left — it has just been tilted away',
    });
  }

  /* ================================================================== *
   * frame
   * ================================================================== */

  function render() {
    if (st.stage === 'block') { drawBlockBench(); drawBlockGraph(); renderBlockReads(); }
    else if (st.stage === 'contact') { drawContactBench(); drawContactGraph(); renderContactReads(); }
    else { drawJunctionBench(); drawJunctionGraph(); renderJunctionReads(); }
  }

  function drawBlockGraph() {
    const N = st.m * G;
    rec.yMin = -0.06 * st.us * N;
    rec.yMax = 1.25 * st.us * N;
    rec.draw(st.b.t, P);
  }

  function frame(dt) {
    if (st.playing) advance(dt);
    render();
  }

  function fitAll() { P = palette(root); av.fit(); gv.fit(); render(); }
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = 0;
    const ro = new ResizeObserver(e => {
      const nw = Math.round(e[0].contentRect.width);
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
    _stage: s => setStage(s),
    _set: q => {
      Object.assign(st, q);
      if (q.rough != null || q.areaMul != null) rebuildSurface();
      if (q.N != null) press = null;
      if (q.us != null) sUs.set(st.us);
      if (q.uk != null) sUk.set(st.uk);
      if (q.m != null || q.kb != null || q.vh != null) resetBlock();
      if (q.U0 != null || q.ka != null || q.a != null) resetJunction();
      render();
    },
    /** run the block bench with the very stepper the animation uses, through
     *  the very function the animation loop calls, so the readouts fill in */
    _runBlock: seconds => {
      const p = { m: st.m, k: st.kb, us: st.us, uk: st.uk, vh: st.vh, N: st.m * G };
      const n = Math.round(seconds / HB);
      let peak = 0, sum = 0, cnt = 0, grips0 = st.b.grips;
      for (let i = 0; i < n; i++) {
        const F = pullOf(st.b, p);
        if (st.b.stuck) peak = Math.max(peak, F); else { sum += F; cnt++; }
        stepBlock();
      }
      render();
      return {
        peak, meanSliding: cnt ? sum / cnt : null, grips: st.b.grips - grips0,
        heat: st.b.heat, slid: st.b.slid, t: st.b.t,
        x: st.b.x, v: st.b.v, stuck: st.b.stuck,
        F: pullOf(st.b, p), N: p.N, limit: st.us * p.N, kinetic: st.uk * p.N,
      };
    },
    _blockStepper: (p, seconds, h) => {
      const s = { x: 0, v: 0, t: 0, stuck: true, heat: 0, slid: 0, grips: 0 };
      const n = Math.round(seconds / h);
      let peak = 0, sum = 0, cnt = 0, released = false;
      let fmin = Infinity, fmax = -Infinity;
      for (let i = 0; i < n; i++) {
        const F = pullOf(s, p);
        if (s.stuck) peak = Math.max(peak, F); else { sum += F; cnt++; released = true; }
        if (released) { fmin = Math.min(fmin, F); fmax = Math.max(fmax, F); }
        blockStep(s, p, h);
      }
      return { peak, mean: cnt ? sum / cnt : null, x: s.x, v: s.v, heat: s.heat,
               slid: s.slid, grips: s.grips, t: s.t,
               swing: released ? fmax - fmin : 0 };
    },
    _contact: (N, mul, rough) => {
      const sf = makeSurface(1103, Math.round(NBASE * (mul ?? st.areaMul)), rough ?? st.rough);
      const pr = pressTo(sf, N, mat());
      return {
        ...pr, apparent: sf.n * CELL, n: sf.n,
        F: st.tau * pr.area, mu: st.tau * pr.area / N,
      };
    },
    _sweep: () => sweepNow(),
    /** the summit heights themselves, so a check can redo the contact
     *  mechanics on this very surface without guessing at the random numbers */
    _heights: () => Array.from(surf.h),
    _mat: () => ({ ...mat(), CELL, NBASE, BLOCK_FACE, tau: st.tau }),
    _press: N => pressTo(surf, N, mat()),
    _barrier: () => barrierAhead(),
    _junction: (q, travel) => {
      const p = { U0: st.U0, a: st.a, k: st.ka, V: st.V, gamma: st.gamma, ...q };
      const T = travel / p.V;
      const n = Math.round(T / HJ);
      let x = 0, t = 0, work = 0, diss = 0, jumps = 0, inJump = null, inJumpHeat = 0;
      let sum = 0, peak = 0;
      for (let i = 0; i < n; i++) {
        const { spring } = ptForce(x, t, p);
        const xn = ptStep(x, t, p, HJ);
        const v = (xn - x) / HJ;
        work += spring * p.V * HJ;
        diss += p.gamma * v * v * HJ;
        if (!inJump && v > 5 * p.V) inJump = diss;
        if (inJump != null && v < 2 * p.V) { jumps++; inJumpHeat += diss - inJump; inJump = null; }
        if (spring > peak) peak = spring;
        sum += spring;
        x = xn; t += HJ;
      }
      const stored = (-p.U0 * Math.cos(TAU * x / p.a) + 0.5 * p.k * Math.pow(p.V * t - x, 2))
                   - (-p.U0);
      return { eta: ptEta(p), mean: sum / n, peak, jumps, work, diss, stored,
               inJumps: inJumpHeat, x, t };
    },
    _state: () => ({
      stage: st.stage, m: st.m, us: st.us, uk: st.uk, vh: st.vh, kb: st.kb,
      N: st.N, areaMul: st.areaMul, rough: st.rough, tau: st.tau,
      U0: st.U0, ka: st.ka, a: st.a, eta: ptEta({ U0: st.U0, a: st.a, k: st.ka }),
      block: { ...st.b }, junction: { ...st.j },
    }),
    _reads: () => ({
      block: outB, contact: outC, junction: outJ,
    }),
  };
}
