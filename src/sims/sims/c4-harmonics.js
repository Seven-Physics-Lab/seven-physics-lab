/* ============================================================================
 * C4-2  Harmonics on Strings and in Pipes
 * IB Physics C.4 Standing Waves and Resonance
 *
 * Follows straight on from C4-1. There, two waves crossed anywhere along an
 * endless medium. Here the medium has ENDS, and the ends are what decide which
 * standing waves are allowed to exist at all.
 *
 * ---------------------------------------------------------------------------
 * THE ARGUMENT THIS SIMULATION MAKES
 *
 * A standing wave survives on a real string or in a real pipe only if it
 * satisfies the boundary condition at both ends. That is the whole of the
 * harmonics topic. Everything else — the formulae, the octave, the missing
 * even harmonics of a closed pipe — falls out of it.
 *
 *   string, both ends fixed    node at each end
 *   pipe, both ends open       displacement antinode at each end
 *   pipe, one end closed       node at the closed end, antinode at the open one
 *
 * The second panel is the point of the sim: it draws the first six modes and
 * lets the boundary condition reject the ones that do not fit. On a closed
 * pipe the even ones are drawn as an honest attempt that fails — the curve is
 * pinned to a node at the closed end and then arrives at the open end with
 * zero displacement, which a free end cannot have. That is a much better
 * reason for "only odd harmonics" than being told to memorise it.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * Displacement of a point of the medium, at position x from the left end:
 *
 *   string, fixed-fixed     y = A sin(nπx/L) cos(ωt)     λ = 2L/n,  n = 1,2,3…
 *   pipe, open-open         y = A cos(nπx/L) cos(ωt)     λ = 2L/n,  n = 1,2,3…
 *   pipe, closed-open       y = A sin(nπx/2L) cos(ωt)    λ = 4L/n,  n = 1,3,5…
 *
 * and in every case f = v/λ, so
 *
 *   f_n = n v / 2L    (string, open pipe)
 *   f_n = n v / 4L    (closed pipe, odd n only)
 *
 * Note the two consequences the syllabus asks about. A closed pipe of the same
 * length has HALF the fundamental frequency of an open one — an octave lower —
 * and it is missing every even harmonic, which is why a stopped organ pipe and
 * a flute of the same length sound nothing like each other.
 *
 * WAVE SPEED
 *
 * Not a free parameter. On the string it comes from the tension and the mass
 * per unit length,
 *
 *   v = sqrt(T / μ)
 *
 * so f_n ∝ sqrt(T): quadrupling the tension only doubles the pitch, which is
 * the answer to the standard "why is tuning so touchy" question. In the pipes
 * it is the speed of sound in air, which depends on absolute temperature,
 *
 *   v = 331.3 sqrt(1 + θ/273.15)   m s⁻¹,  θ in °C
 *
 * (the familiar 331 + 0.6θ is the linearisation of this). A wind instrument
 * therefore goes sharp as it warms up, and a string one goes flat. Both are
 * computed here rather than typed in.
 *
 * PRESSURE
 *
 * For the pipes the curve drawn is the DISPLACEMENT of the air, which is what
 * the boundary conditions are stated in. The pressure variation is
 *
 *   p ∝ −∂y/∂x
 *
 * so it is a quarter cycle out of step in space: a pressure node sits exactly
 * where a displacement antinode does. The toggle swaps between them, because
 * mixing the two up is the single most common mistake in this topic.
 *
 * ANIMATION SPEED
 *
 * A real fundamental is of the order of a hundred hertz and would be a blur on
 * screen. The animation is slowed so the fundamental of whichever system is
 * selected always appears at 0.45 Hz; every other mode is then slowed by the
 * same factor, so the n-th harmonic really is n times faster on screen than
 * the first. The factor is printed in the readouts rather than hidden.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, chatch, callout,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;
const HA = 288, HB = 64 + 6 * 52 + 8;

const L_MIN = 0.20, L_MAX = 1.20;
const T_MIN = 10,   T_MAX = 200;      // N, string tension
const MU     = 4.0e-3;                // kg m⁻¹, the string, fixed
const TH_MIN = -10, TH_MAX = 40;      // °C, air temperature

const N_LADDER = 6;                   // modes shown in the ladder
const A_PX = 46;                      // displacement amplitude, panel A
const TUBE_R = 64;                    // half-height of the pipe, panel A
const MID_A = 124;
/* N and A are lettered in their own row clear of the apparatus. Putting them
 * next to the markers is the obvious thing and it is wrong: at both ends of a
 * string the node sits exactly where the bridge is, so the letter lands on a
 * solid black triangle and cannot be read at all. */
const LBL_DY = 78, DIM_DY = 106, HALF_DY = 140;
const A_MINI = 13, TUBE_MINI = 19;    // the ladder lanes
/* Room for two wrapped lines of explanation is reserved whether or not the
 * second one is used: a header that changes height when the medium changes
 * would make every lane jump under the pointer. */
const LANE_H = 52, LANE_TOP = 64;

/* Gutters. On a phone the sim is given about 390 logical pixels, and a fixed
 * 66-pixel gutter at each end would throw away a third of the drawing to
 * white space — so they shrink, down to what the hatching on a closed end and
 * a single letter on the right actually need. */
const PAD_L = 66, PAD_R = 58, PAD_L_SM = 30, PAD_R_SM = 22;
const LANE_LABEL = 128, LANE_RIGHT = 104, LANE_LABEL_SM = 92, LANE_RIGHT_SM = 74;
const NARROW = 640;

const SYSTEMS = {
  string: {
    name: 'string, both ends fixed',
    short: 'string',
    allows: () => true,
    /** node at each end */
    shape: (u, n) => Math.sin(n * Math.PI * u),
    lamOf: (L, n) => 2 * L / n,
    ends: ['fixed', 'fixed'],
  },
  open: {
    name: 'pipe, both ends open',
    short: 'open pipe',
    allows: () => true,
    /** displacement antinode at each end */
    shape: (u, n) => Math.cos(n * Math.PI * u),
    lamOf: (L, n) => 2 * L / n,
    ends: ['open', 'open'],
  },
  closed: {
    name: 'pipe, one end closed',
    short: 'closed pipe',
    allows: n => n % 2 === 1,
    /** node at the closed end; only odd n also give an antinode at the open one */
    shape: (u, n) => Math.sin(n * Math.PI * u / 2),
    lamOf: (L, n) => 4 * L / n,
    ends: ['closed', 'open'],
  },
};

/** speed of sound in air, from the absolute temperature */
export function vSound(theta) { return 331.3 * Math.sqrt(1 + theta / 273.15); }
/** speed of a transverse wave on a stretched string */
export function vString(T, mu) { return Math.sqrt(T / mu); }

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c4-harmonics',
    title: 'Harmonics on strings and in pipes',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    sys: 'string',
    n: 1,
    L: 0.65,
    T: 100,            // N
    theta: 20,         // °C
    pressure: false,   // pipes: draw pressure instead of displacement
    ghosts: true,
    ann: false,
    playing: true,
    speed: 1,
    t: 0,
  };

  const S = () => SYSTEMS[st.sys];
  const isPipe = () => st.sys !== 'string';
  const vOf = () => (st.sys === 'string' ? vString(st.T, MU) : vSound(st.theta));
  const lamOf = n => S().lamOf(st.L, n);
  const fOf = n => vOf() / lamOf(n);
  /** the lowest mode this system actually allows */
  const nFund = () => 1;
  const ratio = n => fOf(n) / fOf(nFund());

  /** displacement as a fraction of the amplitude, u = x/L in [0,1] */
  const shape = (u, n) => S().shape(u, n);
  /**
   * Pressure variation, p ∝ −∂y/∂x, normalised so its peak is also 1.
   * Differentiating each shape by hand keeps this exact rather than a
   * finite difference that would smear the nodes.
   */
  function pshape(u, n) {
    if (st.sys === 'string') return shape(u, n);        // not meaningful; unused
    if (st.sys === 'open')   return Math.sin(n * Math.PI * u);
    return -Math.cos(n * Math.PI * u / 2);
  }
  const curve = (u, n) => (isPipe() && st.pressure ? pshape(u, n) : shape(u, n));

  /**
   * Node and antinode positions, as fractions of L.
   *
   * These are written down rather than searched for. A numerical sweep would
   * have missed the node at the far end of a string every single time: the
   * shape there is sin(nπ), and in floating point that is 1.2e-16, not zero,
   * so no sign change is ever seen and the end node silently disappears. The
   * positions are elementary, so there is no excuse for finding them badly.
   *
   *   string   y = sin(nπu)       nodes u = j/n,        antinodes u = (j+½)/n
   *   open     y = cos(nπu)       nodes u = (2j+1)/2n,  antinodes u = j/n
   *   closed   y = sin(nπu/2)     nodes u = 2j/n,       antinodes u = (2j+1)/n
   *
   * Pressure is p ∝ −∂y/∂x, and every shape here is sinusoidal in x, so the
   * pressure pattern is the displacement pattern with nodes and antinodes
   * interchanged — exactly, everywhere. Hence the swap rather than a second
   * derivation. That interchange is the fact the toggle exists to teach.
   */
  const seq = (count, f) => Array.from({ length: Math.max(0, count) }, (_, j) => f(j));
  function marks(n) {
    let nodes, antis;
    if (st.sys === 'string') {
      nodes = seq(n + 1, j => j / n);
      antis = seq(n, j => (j + 0.5) / n);
    } else if (st.sys === 'open') {
      nodes = seq(n, j => (2 * j + 1) / (2 * n));
      antis = seq(n + 1, j => j / n);
    } else {
      const h = Math.floor((n + 1) / 2);
      nodes = seq(h, j => 2 * j / n);
      antis = seq(h, j => (2 * j + 1) / n);
    }
    return (isPipe() && st.pressure) ? { nodes: antis, antis: nodes } : { nodes, antis };
  }
  const zeros  = n => marks(n).nodes;
  const extrema = n => marks(n).antis;

  /** how much slower than reality the animation runs */
  const SLOW_BASE = 0.45;                           // Hz on screen, fundamental
  const fVis = n => SLOW_BASE * ratio(n);
  const slowFactor = () => fOf(st.n) / fVis(st.n);

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, { label: 'The instrument, with the selected mode standing on it' });
  const bv = surface(MW, HB, { label: 'The first six modes, and which of them the ends allow' });

  const MA = () => (av.w < NARROW
    ? { X0: PAD_L_SM, X1: av.w - PAD_R_SM }
    : { X0: PAD_L,    X1: av.w - PAD_R });
  const MB = () => (bv.w < NARROW
    ? { X0: LANE_LABEL_SM, X1: bv.w - LANE_RIGHT_SM }
    : { X0: LANE_LABEL,    X1: bv.w - LANE_RIGHT });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'sys', label: 'What the ends demand' },
    { key: 'v',   label: 'Wave speed <i>v</i>, and where it comes from' },
    { key: 'lam', label: 'Wavelength of this mode, <i>λ</i>' },
    { key: 'fit', label: 'How that fits the length <i>L</i>' },
    { key: 'f',   label: 'Frequency <i>f</i> = <i>v</i>/<i>λ</i>' },
    { key: 'rat', label: 'Against the fundamental, <i>f</i>/<i>f</i>₁' },
    { key: 'na',  label: 'Nodes and antinodes on the medium' },
    { key: 'slo', label: 'Animation, against real time' },
  ]);

  /* ---------------------------------------------------------- controls */

  const bSys = Object.keys(SYSTEMS).map(k => button({
    label: SYSTEMS[k].name, pressed: k === st.sys,
    onClick: () => setSys(k),
  }));

  const sL = slider({ label: '<i>L</i>', min: L_MIN, max: L_MAX, step: 0.01, value: st.L,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.L = v; } });
  const sT = slider({ label: '<i>T</i>', min: T_MIN, max: T_MAX, step: 1, value: st.T,
    format: v => `${v.toFixed(0)} N`, onInput: v => { st.T = v; } });
  const sTh = slider({ label: '<i>θ</i>', min: TH_MIN, max: TH_MAX, step: 1, value: st.theta,
    format: v => `${v.toFixed(0)} °C`, onInput: v => { st.theta = v; } });
  const sN = slider({ label: 'mode', word: true, min: 1, max: N_LADDER, step: 1, value: 1,
    format: v => `n = ${v}`, onInput: v => { pick(Math.round(v)); } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.2, max: 1.6, step: 0.1, value: 1,
    format: v => `×${v.toFixed(1)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bGh = button({ label: 'Ghosts of earlier instants', pressed: true, onClick: b => {
    st.ghosts = !st.ghosts; b.setAttribute('aria-pressed', String(st.ghosts));
  } });
  const bPr = button({ label: 'Show pressure, not displacement', pressed: false, onClick: b => {
    st.pressure = !st.pressure; b.setAttribute('aria-pressed', String(st.pressure));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });

  /* One strip, not two. The tension slider belongs to the string and the
   * thermometer to the pipes, so the pair that does not apply is hidden
   * rather than the whole row being rebuilt: the other three sliders keep
   * their identity, and so does anything the user has grabbed. */
  const ctlRow = controls([sL.node, sT.node, sTh.node, sN.node, sS.node]);

  function setSys(k) {
    st.sys = k;
    bSys.forEach((b, i) => b.setPressed(Object.keys(SYSTEMS)[i] === k));
    if (!S().allows(st.n)) {
      st.n = st.n + 1 <= N_LADDER && S().allows(st.n + 1) ? st.n + 1 : 1;
      sN.set(st.n);
    }
    sT.node.hidden  = k !== 'string';
    sTh.node.hidden = k === 'string';
    bPr.node.hidden = k === 'string';
    if (k === 'string') st.pressure = false;
    bPr.setPressed(st.pressure);
    render();
  }
  function pick(n) {
    n = clamp(Math.round(n), 1, N_LADDER);
    if (!S().allows(n)) return;          // a mode the ends forbid cannot be selected
    st.n = n; sN.set(n); render();
  }

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Harmonics on Strings and in Pipes',
            'the ends of the medium decide which standing waves are allowed'),
    controls([el('div', { class: 'ibs-btns' }, bSys.map(b => b.node))], { label: 'the medium:' }),
    panelBox('The instrument, with the chosen mode standing on it', av.el),
    panelBox('The first six modes — and whether the ends let them exist', bv.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bGh.node, bPr.node, bAnn.node])]),
    ctlRow,
    out.node,
    note('<b>Boundary conditions.</b> A standing wave only survives on a real medium if it ' +
         'fits the ends. A fixed end must be a <b>node</b>; a free, open end must be a ' +
         '<b>displacement antinode</b>. That single requirement gives every result in this ' +
         'topic. A string and an open pipe both need a whole number of half wavelengths, ' +
         '<i>L</i> = <i>nλ</i>/2, so <i>f<sub>n</sub></i> = <i>nv</i>/2<i>L</i> and every ' +
         'harmonic exists. A pipe closed at one end needs a node there and an antinode at the ' +
         'other, so it fits an <b>odd</b> number of quarter wavelengths, ' +
         '<i>L</i> = <i>nλ</i>/4 with <i>n</i> odd, and ' +
         '<i>f<sub>n</sub></i> = <i>nv</i>/4<i>L</i>. Two things follow that examiners like: ' +
         'a closed pipe sounds an <b>octave lower</b> than an open pipe of the same length, ' +
         'and it has <b>no even harmonics at all</b> — switch to it and watch modes 2, 4 and 6 ' +
         'be rejected. The speed is never a free number: on the string ' +
         '<i>v</i> = √(<i>T</i>/<i>μ</i>), in the pipes it is the speed of sound, which rises ' +
         'with temperature, so a wind instrument goes sharp as it warms. ' +
         '(A real pipe also behaves as if slightly longer than it is — the end correction — ' +
         'which is why measured frequencies come out a little low.)')
  );

  /* ================================================================== *
   * drawing — panel A, the instrument
   * ================================================================== */

  let P = palette(root);

  const uPix = (u, m) => m.X0 + u * (m.X1 - m.X0);

  /** the medium's outline: bridges for a string, walls for a pipe */
  function drawBody(ctx, m, mid, r, lw, mini = false) {
    const [e0, e1] = S().ends;
    if (st.sys === 'string') {
      /* two bridges on a sonometer board */
      ctx.fillStyle = P.text;
      for (const [px, dir] of [[m.X0, -1], [m.X1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(px, mid - r * 0.34);
        ctx.lineTo(px + dir * r * 0.40, mid + r * 0.86);
        ctx.lineTo(px - dir * r * 0.40, mid + r * 0.86);
        ctx.closePath(); ctx.fill();
      }
      if (!mini) {
        /* the board the bridges stand on — drawn once, full size only: six
         * hatched boards stacked in the ladder would be all anyone saw */
        chatch(ctx, m.X0 - r * 0.6, mid + r * 0.86, (m.X1 - m.X0) + r * 1.2, 0,
               { color: P.muted, gap: 10, len: 10, width: 1 });
      }
      return;
    }
    /* pipe walls */
    ctx.strokeStyle = P.text; ctx.lineWidth = lw; ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(m.X0, mid - r); ctx.lineTo(m.X1, mid - r);
    ctx.moveTo(m.X0, mid + r); ctx.lineTo(m.X1, mid + r);
    ctx.stroke();
    if (e0 === 'closed') {
      ctx.beginPath(); ctx.moveTo(m.X0, mid - r); ctx.lineTo(m.X0, mid + r); ctx.stroke();
      chatch(ctx, m.X0, mid - r, 0, 2 * r,
             { color: P.muted, side: 'left', gap: Math.max(8, r * 0.30),
               len: Math.max(7, r * 0.26), width: 1 });
    }
    if (e1 === 'closed') {
      ctx.beginPath(); ctx.moveTo(m.X1, mid - r); ctx.lineTo(m.X1, mid + r); ctx.stroke();
    }
  }

  function drawA() {
    const ctx = av.ctx, m = MA(), W = av.w;
    ctx.clearRect(0, 0, W, HA);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HA);

    const mid = MID_A, n = st.n;

    drawBody(ctx, m, mid, TUBE_R, 2.4);

    /* the axis */
    ctx.save();
    ctx.setLineDash([4, 5]); ctx.globalAlpha = 0.35; ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.X0, mid); ctx.lineTo(m.X1, mid); ctx.stroke();
    ctx.restore();

    const env = u => curve(u, n) * A_PX;
    const drawCurve = (phase, color, width, alpha) => {
      ctx.save();
      if (alpha !== 1) ctx.globalAlpha = alpha;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let px = m.X0; px <= m.X1; px += 2) {
        const u = (px - m.X0) / (m.X1 - m.X0);
        const yy = mid - env(u) * phase;
        px === m.X0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
      }
      ctx.stroke(); ctx.restore();
    };

    /* the envelope: the shape a student is asked to sketch */
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.fillStyle = P.accent;
    ctx.beginPath();
    for (let px = m.X0; px <= m.X1; px += 3) {
      const u = (px - m.X0) / (m.X1 - m.X0);
      ctx.lineTo(px, mid - Math.abs(env(u)));
    }
    for (let px = m.X1; px >= m.X0; px -= 3) {
      const u = (px - m.X0) / (m.X1 - m.X0);
      ctx.lineTo(px, mid + Math.abs(env(u)));
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();

    const ph = Math.cos(TAU * fVis(n) * st.t);
    if (st.ghosts) {
      for (let i = 1; i <= 5; i++) {
        const p = Math.cos(TAU * fVis(n) * (st.t - i / (12 * fVis(n))));
        drawCurve(p, P.accent, 1.2, 0.20 * (1 - i / 7));
      }
    }
    drawCurve(ph, P.accent, 2.9, 1);

    /* nodes and antinodes: marker on the axis, letter in its own clear row */
    const nd = zeros(n), an = extrema(n);
    const lblY = mid + LBL_DY;
    const letter = (u, ch, color) => {
      const px = uPix(u, m);
      ctx.save();
      ctx.globalAlpha = 0.30; ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(px, mid + 10); ctx.lineTo(px, lblY - 11); ctx.stroke();
      ctx.restore();
      ctext(ctx, ch, px, lblY, { font: `600 11.5px ${P.font}`, color, align: 'center' });
    };
    for (const u of an) {
      const px = uPix(u, m);
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(px, mid, 3.4, 0, TAU); ctx.fill();
      letter(u, 'A', P.accent);
    }
    for (const u of nd) {
      const px = uPix(u, m);
      ctx.beginPath(); ctx.arc(px, mid, 4.8, 0, TAU);
      ctx.fillStyle = P.bg; ctx.fill();
      ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.stroke();
      letter(u, 'N', P.text);
    }

    /* what is being drawn, and what each end demands */
    ctext(ctx, isPipe() && st.pressure ? 'pressure variation of the air'
          : isPipe() ? 'displacement of the air' : 'displacement of the string',
      m.X0, 26, { font: `600 12px ${P.font}`, color: P.accent });
    /* In pressure the conditions invert, and saying "open → antinode" over a
     * pressure curve that is plainly zero there would teach the exact mistake
     * the toggle exists to prevent. */
    const pr = isPipe() && st.pressure;
    const demand = e => e === 'fixed' ? 'fixed → node'
      : e === 'closed' ? (pr ? 'closed → pressure antinode' : 'closed → node')
      : (pr ? 'open → pressure node' : 'open → antinode');
    ctext(ctx, demand(S().ends[0]), m.X0, mid - TUBE_R - 12,
      { font: `600 11.5px ${P.font}`, color: P.text });
    ctext(ctx, demand(S().ends[1]), m.X1, mid - TUBE_R - 12,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right' });
    if (isPipe() && st.pressure) {
      ctext(ctx, 'a pressure node sits where the displacement antinode is',
        m.X1, 26, { font: `500 11.5px ${P.font}`, color: P.muted, align: 'right' });
    }

    /* the length, as a dimension line */
    const dy = mid + DIM_DY;
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(m.X0, dy - 7); ctx.lineTo(m.X0, dy + 7);
    ctx.moveTo(m.X1, dy - 7); ctx.lineTo(m.X1, dy + 7);
    ctx.stroke();
    carrow(ctx, m.X0, dy, m.X1, dy, { color: P.text, width: 1.2, head: 7, min: 4 });
    carrow(ctx, m.X1, dy, m.X0, dy, { color: P.text, width: 1.2, head: 7, min: 4 });
    ctext(ctx, `L = ${fmt(st.L, 2)} m`, (m.X0 + m.X1) / 2, dy - 10,
      { font: P.sym(13.5), color: P.text, align: 'center', halo: P.bg });

    /* and the piece of a wavelength the medium is measured in: node to node is
     * half of one; when there is only a single node — the fundamental of a
     * closed pipe — node to antinode is a quarter, which is exactly the
     * relation that mode exists to demonstrate */
    let u0 = null, u1 = null, part = '';
    if (nd.length >= 2)      { u0 = nd[0]; u1 = nd[1]; part = 'λ/2'; }
    else if (nd.length && an.length) { u0 = nd[0]; u1 = an[0]; part = 'λ/4'; }
    if (u0 !== null) {
      const a = uPix(Math.min(u0, u1), m), b = uPix(Math.max(u0, u1), m);
      const hy = mid + HALF_DY;
      const val = lamOf(n) * (part === 'λ/2' ? 0.5 : 0.25);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a, hy - 6); ctx.lineTo(a, hy + 6);
      ctx.moveTo(b, hy - 6); ctx.lineTo(b, hy + 6);
      ctx.stroke();
      carrow(ctx, a, hy, b, hy, { color: P.accent, width: 1.1, head: 6, min: 4 });
      carrow(ctx, b, hy, a, hy, { color: P.accent, width: 1.1, head: 6, min: 4 });
      ctext(ctx, `${part} = ${fmt(val, 3)} m`, (a + b) / 2, hy - 9,
        { font: P.sym(12), color: P.accent, align: 'center', halo: P.bg });
    }

    if (st.ann) {
      callout(ctx, [`${S().name}.`,
                    `This is mode n = ${n}: ${fitWords()}.`,
                    `f = ${fmt(fOf(n), 1)} Hz, which is ${fmt(ratio(n), 0)}× the fundamental.`],
        m.X0 + 40, 44, uPix(an[0] ?? 0.5, m), mid - A_PX, { palette: P });
    }
  }

  /** L written in terms of the wavelength, the way the fitting is argued */
  function fitWords() {
    const n = st.n;
    if (st.sys === 'closed') {
      return n === 1 ? 'L = λ/4' : `L = ${n}λ/4`;
    }
    if (n === 2) return 'L = λ';
    return n % 2 === 0 ? `L = ${n / 2}λ` : (n === 1 ? 'L = λ/2' : `L = ${n}λ/2`);
  }

  /* ================================================================== *
   * drawing — panel B, the ladder of modes
   * ================================================================== */

  const laneTop = i => LANE_TOP + i * LANE_H;
  const laneMid = i => laneTop(i) + LANE_H / 2;

  /* Said once, in the header, rather than repeated on every rejected lane:
   * six copies of the same sentence in a 52-pixel row is how a panel stops
   * being read at all. */
  const WHY = {
    string: 'each mode fits a whole number of half wavelengths between the two fixed ends',
    open:   'each mode fits a whole number of half wavelengths, with an antinode at each open end',
    closed: 'an even mode would put a node at the open end, where the air is free to move — so it cannot exist',
  };

  function drawB() {
    const ctx = bv.ctx, m = MB(), W = bv.w;
    ctx.clearRect(0, 0, W, HB);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HB);

    ctext(ctx, 'mode', 14, 20, { font: `600 11px ${P.font}`, color: P.muted });
    ctext(ctx, (S().allows(2) ? 'every harmonic fits' : 'only the odd harmonics fit') +
               (isPipe() && st.pressure ? ' — drawn as pressure' : ''),
      m.X0, 20, { font: `600 11.5px ${P.font}`, color: P.accent });
    ctext(ctx, 'frequency', W - 14, 20,
      { font: `600 11px ${P.font}`, color: P.muted, align: 'right' });
    ctx.font = `500 11px ${P.font}`;
    wrap(ctx, WHY[st.sys], W - 28, 2).forEach((line, j) =>
      ctext(ctx, line, 14, 38 + j * 14, { font: `500 11px ${P.font}`, color: P.muted }));

    for (let i = 0; i < N_LADDER; i++) {
      const n = i + 1, ok = S().allows(n), sel = n === st.n;
      const my = laneMid(i);

      if (sel) {
        ctx.fillStyle = P.soft;
        ctx.fillRect(6, laneTop(i) + 1, W - 12, LANE_H - 2);
      }
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6, laneTop(i)); ctx.lineTo(W - 6, laneTop(i)); ctx.stroke();

      /* the label */
      ctext(ctx, `n = ${n}`, 14, my - 2,
        { font: sel ? `700 12.5px ${P.font}` : `600 12.5px ${P.font}`,
          color: ok ? (sel ? P.accent : P.text) : P.muted });
      ctext(ctx, ok ? ordinal(n) + ' harmonic' : 'does not fit', 14, my + 13,
        { font: `500 10.5px ${P.font}`, color: P.muted });

      /* the medium and the attempted mode */
      const mm = { X0: m.X0, X1: m.X1 };
      ctx.save();
      if (!ok) ctx.globalAlpha = 0.45;
      drawBody(ctx, mm, my, TUBE_MINI, 1.6, true);
      ctx.save();
      ctx.setLineDash([3, 4]); ctx.globalAlpha = (ok ? 1 : 0.45) * 0.3;
      ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mm.X0, my); ctx.lineTo(mm.X1, my); ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = ok ? (sel ? P.accent : P.text) : P.muted;
      ctx.lineWidth = sel ? 2.4 : 1.6;
      if (!ok) ctx.setLineDash([5, 4]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let px = mm.X0; px <= mm.X1; px += 2) {
        const u = (px - mm.X0) / (mm.X1 - mm.X0);
        const yy = my - curve(u, n) * A_MINI;
        px === mm.X0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      if (!ok) {
        /* say exactly which end rejects it, and mark the spot */
        const px = mm.X1;
        ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(px - 5, my - 5); ctx.lineTo(px + 5, my + 5);
        ctx.moveTo(px + 5, my - 5); ctx.lineTo(px - 5, my + 5);
        ctx.stroke();
        ctext(ctx, 'rejected', W - 14, my + 4,
          { font: `600 11px ${P.font}`, color: P.muted, align: 'right' });
      } else {
        ctext(ctx, `${fmt(fOf(n), 1)} Hz`, W - 14, my - 2,
          { font: sel ? `700 12px ${P.font}` : `500 12px ${P.font}`,
            color: sel ? P.accent : P.text, align: 'right' });
        ctext(ctx, `${fmt(ratio(n), 0)} × f₁`, W - 14, my + 13,
          { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right' });
      }
    }
  }

  function ordinal(n) {
    return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  }

  /**
   * Break a sentence to fit a width, measured in the font the caller has
   * already set on the context. Canvas will happily draw text straight off
   * the right-hand edge without complaining, so anything of sentence length
   * has to be measured before it is drawn.
   */
  function wrap(ctx, text, maxW, maxLines) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      if (ctx.measureText(trial).width <= maxW || !cur) { cur = trial; continue; }
      lines.push(cur); cur = w;
      if (lines.length === maxLines) return lines;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines);
  }

  /* ------------------------------------------------------- pick a lane */

  const laneAt = e => {
    const y = bv.at(e).y;
    for (let i = 0; i < N_LADDER; i++) {
      if (y >= laneTop(i) && y < laneTop(i) + LANE_H) return i + 1;
    }
    return 0;
  };
  const onClick = e => { const n = laneAt(e); if (n) pick(n); };
  const onHover = e => {
    const n = laneAt(e);
    bv.el.style.cursor = n && S().allows(n) ? 'pointer' : 'default';
  };
  bv.el.addEventListener('click', onClick);
  bv.el.addEventListener('pointermove', onHover);
  onDestroy(() => {
    bv.el.removeEventListener('click', onClick);
    bv.el.removeEventListener('pointermove', onHover);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) st.t += Math.min(dt, 0.1) * st.speed;
    render();
  }

  function render() {
    drawA(); drawB();
    const n = st.n, nd = zeros(n), an = extrema(n);
    const demand = S().ends.map(e =>
      e === 'open' ? 'an antinode' : 'a node');
    out.setAll({
      sys: `${demand[0]} at the left, ${demand[1]} at the right`,
      v: st.sys === 'string'
        ? `${fmt(vOf(), 1)} m s⁻¹  = √(${fmt(st.T, 0)} N / ${fmt(MU * 1000, 1)} g m⁻¹)`
        : `${fmt(vOf(), 1)} m s⁻¹  = speed of sound at ${fmt(st.theta, 0)} °C`,
      lam: `${fmt(lamOf(n), 3)} m`,
      fit: `${fitWords()},  so λ = ` +
           (st.sys === 'closed' ? (n === 1 ? '4L' : `4L/${n}`)
                                : (n === 1 ? '2L' : `2L/${n}`)),
      f: `${fmt(fOf(n), 1)} Hz`,
      rat: `${fmt(ratio(n), 0)}  (${ordinal(n)} harmonic)`,
      na: isPipe() && st.pressure
        ? `${nd.length} pressure node${nd.length === 1 ? '' : 's'}, ` +
          `${an.length} pressure antinode${an.length === 1 ? '' : 's'}`
        : `${nd.length} node${nd.length === 1 ? '' : 's'}, ` +
          `${an.length} antinode${an.length === 1 ? '' : 's'}`,
      slo: `slowed ×${fmt(slowFactor(), 0)}`,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(av.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      av.setLogical(clamp(cw, 360, MW), HA);
      bv.setLogical(clamp(cw, 360, MW), HB);
    }
    av.fit(); bv.fit();
    render();
  }
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

  setSys(st.sys);
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      if (p.sys && p.sys !== st.sys) { Object.assign(st, p); setSys(p.sys); }
      else Object.assign(st, p);
      if (p.n != null) sN.set(st.n);
      render();
    },
    _state: () => ({
      sys: st.sys, n: st.n, L: st.L, T: st.T, theta: st.theta, mu: MU,
      v: vOf(), lam: lamOf(st.n), f: fOf(st.n), ratio: ratio(st.n),
      pressure: st.pressure, t: st.t, slow: slowFactor(),
    }),
    _allows: n => S().allows(n),
    _shape: (u, n) => shape(u, n),
    _pshape: (u, n) => pshape(u, n),
    _curve: (u, n) => curve(u, n),
    _zeros: n => zeros(n),
    _extrema: n => extrema(n),
    _f: n => fOf(n),
    _lam: n => lamOf(n),
    _consts: () => ({ L_MIN, L_MAX, T_MIN, T_MAX, MU, TH_MIN, TH_MAX,
                      N_LADDER, A_PX, TUBE_R, MID_A, HA, HB, MW,
                      ...MA(), laneTop: LANE_TOP, laneH: LANE_H }),
    _v: { sound: vSound, string: vString },
  };
}
