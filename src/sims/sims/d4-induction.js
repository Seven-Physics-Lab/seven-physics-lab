/* ============================================================================
 * D4-1  The Faraday Bench — a magnet by hand, and a generator
 * IB Physics D.4 Induction
 *
 * Two things on one bench.
 *
 * THE MAGNET AND THE COIL. You pick up a bar magnet and move it about near
 * a coil. The coil is wired in series with a resistor and an ammeter, and a
 * voltmeter is across its ends. Push the magnet in and both needles kick one
 * way; pull it out and they kick the other; hold it still, even deep inside
 * the coil, and they sit on zero. That is the whole of Faraday's law, and the
 * bench does not tell you it — it works out, from the magnet up, how much of
 * the magnet's flux the coil is linking at each instant, and the meters read
 * how fast that is changing.
 *
 * THE GENERATOR. A rectangular coil turns steadily between two poles. Its
 * emf is worked out the way a charge in the wire would feel it — each piece
 * of wire is moving, so a charge in it feels v × B — and the flux is worked
 * out separately by adding up the field over the coil's area. That the first
 * is minus the rate of change of the second is a result, not an input.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does not contain Φ = BA cos θ, or ε = NBAω sin ωt, or V₀/√2, or
 * "average power is half the peak", or the dipole field of a magnet, or the
 * direction of the induced current. The magnet is a sheet of current round
 * its surface (d4-core.js), its flux through the coil is ∮A·dl summed over
 * every turn, and the emf is minus the change in that flux from one instant
 * to the next. The direction the current goes, which end of the coil turns
 * into a north pole, and the push the coil gives back on your hand all come
 * out of the sign of that difference.
 *
 * WHAT IS DECLARED
 *
 *   · The coil has hundreds of turns and is drawn with a handful. Every sum
 *     uses the real number; the drawing says so.
 *   · The coil's own inductance is left out. For these coils it holds the
 *     current back by well under a millisecond — far quicker than any hand.
 *   · A real meter's needle has mass and a spring, so it cannot jump. The
 *     needles here are driven by the true current through a damped response
 *     a few hundredths of a second long, like a lab meter. The exact numbers
 *     are always in the readouts.
 *   · The magnet follows your hand with a short lag, because a hand is not
 *     infinitely quick; the emf is computed from where the magnet actually
 *     went, not from where the pointer was.
 *   · The generator's picture turns 25 times slower than the frequency the
 *     numbers are worked out for. 50 turns a second is a blur.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, ctext, croundRect,
} from '../sim-kit.js';
import {
  MU0, MAG_A, MAG_L, COIL_R, COIL_L, WIRE,
  buildH, linkage, magnetPsi, magnetFits, motionalEmf, coilFlux,
} from './d4-core.js';

export { MU0 };

const TAU = Math.PI * 2;
const MW = 1120, NARROW = 760;
const HG = 400, HG_SM = 470;         // the instruments
const SLOW = 25;                     // the generator's picture, slowed

const COIL_X = 0.03, COIL_Y = 0;     // where the coil sits on the bench
const Y_MAX = 0.034;                 // how far off the axis the magnet can go
const WORLD_H = 0.09;                // metres of bench shown top to bottom
const T_HAND = 0.045;                // how quickly the magnet follows the hand
const V_HAND = 1.4;                  // m s⁻¹, the quickest hand
const WIN = 8;                       // seconds of history on the traces

const BR_LO = 0.2, BR_HI = 1.4;
const N_LO = 50, N_HI = 1000;
const R_LO = 2, R_HI = 100;

const GF_LO = 10, GF_HI = 100;       // Hz
const GN_LO = 1, GN_HI = 20;
const GB_LO = 0.05, GB_HI = 0.5;     // T
const GA_LO = 0.1, GA_HI = 1.0;      // m²
const GR_LO = 5, GR_HI = 50;         // Ω

const MODES = {
  coil: { name: 'A magnet and a coil' },
  gen:  { name: 'A generator' },
  load: { name: 'The generator lighting a load' },
};

/* shared once: the table is a property of the magnet and the coil's shapes */
let TBL = null;
const table = () => (TBL || (TBL = buildH()));

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'd4-faraday', title: 'The Faraday Bench', theme: options.theme || 'auto',
    shadow: !!options.shadow,
  });
  const T = table();

  const st = {
    mode: 'coil',
    /* the magnet and the coil */
    Br: 1.0, turns: 400, Rc: 20, flip: false, lines: false,
    x: -0.09, y: 0, tx: -0.09, ty: 0, drag: false,
    lam: 0, emf: 0, I: 0, Fx: 0, Fy: 0, W: 0, Q: 0, t: 0,
    hist: [], dot: 0,
    nA: { th: 0, om: 0 }, nV: { th: 0, om: 0 },
    /* the generator */
    g: { f: 50, N: 10, B: 0.21, A: 0.5, R: 16, th: 0, playing: true, dbl: false },
  };

  /* ------------------------------------------------------------ physics */

  const sgn = () => (st.flip ? -1 : 1);
  const lamAt = (x, y) => linkage(T, x - COIL_X, y - COIL_Y, st.Br, st.turns, sgn());

  /** the push the coil's current gives the magnet: I ∇Λ, from energy */
  function pushOn(x, y, I) {
    const h = 1e-4;
    const gx = (lamAt(x + h, y) - lamAt(x - h, y)) / (2 * h);
    const gy = (lamAt(x, y + h) - lamAt(x, y - h)) / (2 * h);
    return { Fx: I * gx, Fy: I * gy, gx, gy };
  }

  /* the world's edges, from the layout */
  function bounds() {
    const g = GB();
    return {
      x0: g.wx0 + 0.5 * MAG_L + 0.004, x1: g.wx1 - 0.5 * MAG_L - 0.004,
      y0: -Y_MAX, y1: Y_MAX,
    };
  }
  const fits = (x, y) => magnetFits(x, y, COIL_X, COIL_Y);

  /** one substep of the hand: move toward the target, never through the coil */
  function stepHand(h, target) {
    const b = bounds();
    const tx = clamp(target.x, b.x0, b.x1), ty = clamp(target.y, b.y0, b.y1);
    let vx = (tx - st.x) / T_HAND, vy = (ty - st.y) / T_HAND;
    const sp = Math.hypot(vx, vy);
    if (sp > V_HAND) { vx *= V_HAND / sp; vy *= V_HAND / sp; }
    let nx = st.x + vx * h, ny = st.y + vy * h;
    if (!fits(nx, ny)) {
      if (fits(nx, st.y)) ny = st.y;
      else if (fits(st.x, ny)) nx = st.x;
      else { nx = st.x; ny = st.y; }
    }
    return { x: nx, y: ny };
  }

  /** advance to a new magnet position over time h: Faraday, and nothing else */
  function moveTo(nx, ny, h) {
    const lam0 = st.lam, x0 = st.x, y0 = st.y;
    const lam1 = lamAt(nx, ny);
    const emf = -(lam1 - lam0) / h;
    const I = emf / st.Rc;
    /* the push, at the middle of the step, and the work the hand did on it */
    const mx = 0.5 * (x0 + nx), my = 0.5 * (y0 + ny);
    const p = pushOn(mx, my, I);
    st.W += -(p.Fx * (nx - x0) + p.Fy * (ny - y0));
    st.Q += I * I * st.Rc * h;
    st.vx = (nx - x0) / h; st.vy = (ny - y0) / h;
    st.x = nx; st.y = ny; st.lam = lam1;
    st.emf = emf; st.I = I; st.Fx = p.Fx; st.Fy = p.Fy;
    st.t += h;
    st.dot += I * h;
    needle(st.nA, I / ampFS(), h);
    needle(st.nV, emf / voltFS(), h);
  }

  /* a meter needle: a damped rotor pulled toward the reading */
  const W_N = TAU * 4, Z_N = 0.62;
  function needle(n, u, h) {
    const target = clamp(u, -1.12, 1.12);
    n.om += (W_N * W_N * (target - n.th) - 2 * Z_N * W_N * n.om) * h;
    n.th += n.om * h;
    if (n.th > 1.12) { n.th = 1.12; n.om = 0; }
    if (n.th < -1.12) { n.th = -1.12; n.om = 0; }
  }

  /* the meters' ranges follow the settings, as a demonstrator would choose */
  let FS = { V: 1, A: 0.05 };
  const LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function nice(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (LADDER.find(q => m <= q + 1e-9) ?? 10) * p;
  }
  function setRanges() {
    let gm = 0;
    for (let d = -0.1; d <= 0.1; d += 0.002) {
      const g = Math.abs(linkage(T, d + 1e-4, 0, st.Br, st.turns)
                       - linkage(T, d - 1e-4, 0, st.Br, st.turns)) / 2e-4;
      gm = Math.max(gm, g);
    }
    FS.V = nice(gm * 0.45);
    FS.A = nice(FS.V / st.Rc);
  }
  const voltFS = () => FS.V, ampFS = () => FS.A;

  const lamMax = () => Math.abs(linkage(T, 0, 0, st.Br, st.turns));
  const canFlip = () => Math.abs(st.lam) < 0.03 * lamMax();

  function resetBench() {
    st.lam = lamAt(st.x, st.y);
    st.emf = 0; st.I = 0; st.Fx = 0; st.Fy = 0;
    st.W = 0; st.Q = 0; st.t = 0; st.hist = [];
    st.nA = { th: 0, om: 0 }; st.nV = { th: 0, om: 0 };
    pushHist();
  }
  function pushHist() {
    st.hist.push({ t: st.t, lam: st.lam, emf: st.emf, I: st.I });
    while (st.hist.length > 2 && st.hist[0].t < st.t - WIN - 0.5) st.hist.shift();
  }

  /* ---------------------------------------------------- the generator */

  const gwh = () => 0.5 * Math.sqrt(st.g.A);         // a square coil of area A
  const gOmega = (f = st.g.f) => TAU * f;
  const gEmf = (th, f = st.g.f) =>
    motionalEmf(th, gOmega(f), st.g.B, gwh(), gwh(), st.g.N);
  const gFlux = th => coilFlux(th, st.g.B, gwh(), gwh(), st.g.N);

  /** the numbers that are MEASURED: one whole turn, sampled finely */
  function gMeasure(f = st.g.f) {
    const n = 720, T_ = 1 / f;
    let vmax = 0, fmax = 0, s2 = 0, sI = 0, sP = 0, pmax = 0;
    for (let i = 0; i < n; i++) {
      const th = TAU * i / n;
      const e = gEmf(th, f), fl = gFlux(th);
      const I = e / st.g.R, P = e * I;
      vmax = Math.max(vmax, Math.abs(e)); fmax = Math.max(fmax, Math.abs(fl));
      pmax = Math.max(pmax, P);
      s2 += e * e; sI += I; sP += P;
    }
    return { V0: vmax, lam0: fmax, rms: Math.sqrt(s2 / n), Iav: sI / n,
             Pav: sP / n, P0: pmax, I0: vmax / st.g.R, T: T_ };
  }

  /* -------------------------------------------------------------- the UI */

  const bMode = Object.keys(MODES).map(k => button({
    label: MODES[k].name, pressed: k === st.mode, onClick: () => setMode(k),
  }));

  const bLines = button({ label: 'Field lines', pressed: false, onClick: () => {
    st.lines = !st.lines; syncButtons(); render();
  } });
  const bFlip = button({ label: 'Flip the magnet', onClick: () => {
    if (!canFlip()) return;
    st.flip = !st.flip;
    /* done in no time and far from the coil: start the books again from here */
    const keepT = st.t;
    st.lam = lamAt(st.x, st.y);
    st.emf = 0; st.I = 0;
    st.t = keepT; pushHist();
    syncButtons(); render();
  } });
  const bClear = button({ label: 'Clear the traces', onClick: () => {
    resetBench(); render();
  } });

  const bPlay = button({ label: 'Pause', onClick: () => {
    st.g.playing = !st.g.playing; syncButtons();
  } });
  const bEx = button({ label: 'The worked example (330 V)',
    onClick: () => {
      Object.assign(st.g, { f: 50, N: 10, B: 0.21, A: 0.5, R: 16 });
      syncSliders(); render();
    } });
  const bDbl = button({ label: 'Compare: double the frequency', pressed: false,
    onClick: () => { st.g.dbl = !st.g.dbl; syncButtons(); render(); } });

  const sBr = slider({
    label: '<i>B</i><sub>r</sub>', min: BR_LO, max: BR_HI, step: 0.05, value: st.Br,
    format: v => `${fmt(v, 2)} T — how strong the magnet is`,
    onInput: v => { st.Br = v; setRanges(); resetBench(); render(); },
  });
  const sN = slider({
    label: '<i>N</i>', min: N_LO, max: N_HI, step: 10, value: st.turns,
    format: v => `${fmt(v, 0)} turns on the coil`,
    onInput: v => { st.turns = v; setRanges(); resetBench(); render(); },
  });
  const sR = slider({
    label: '<i>R</i>', min: R_LO, max: R_HI, step: 1, value: st.Rc,
    format: v => `${fmt(v, 0)} Ω in the circuit`,
    onInput: v => { st.Rc = v; setRanges(); resetBench(); render(); },
  });

  const sGf = slider({
    label: '<i>f</i>', min: GF_LO, max: GF_HI, step: 1, value: st.g.f,
    format: v => `${fmt(v, 0)} turns a second`,
    onInput: v => { st.g.f = v; render(); },
  });
  const sGN = slider({
    label: '<i>N</i>', min: GN_LO, max: GN_HI, step: 1, value: st.g.N,
    format: v => `${fmt(v, 0)} turn${v === 1 ? '' : 's'} on the coil`,
    onInput: v => { st.g.N = v; render(); },
  });
  const sGB = slider({
    label: '<i>B</i>', min: GB_LO, max: GB_HI, step: 0.01, value: st.g.B,
    format: v => `${fmt(v, 2)} T between the poles`,
    onInput: v => { st.g.B = v; render(); },
  });
  const sGA = slider({
    label: '<i>A</i>', min: GA_LO, max: GA_HI, step: 0.05, value: st.g.A,
    format: v => `${fmt(v, 2)} m² of coil`,
    onInput: v => { st.g.A = v; render(); },
  });
  const sGR = slider({
    label: '<i>R</i>', min: GR_LO, max: GR_HI, step: 1, value: st.g.R,
    format: v => `${fmt(v, 0)} Ω of load`,
    onInput: v => { st.g.R = v; render(); },
  });

  function syncSliders() {
    sGf.set(st.g.f); sGN.set(st.g.N); sGB.set(st.g.B); sGA.set(st.g.A);
    sGR.set(st.g.R);
    sBr.set(st.Br); sN.set(st.turns); sR.set(st.Rc);
  }

  const outC = readouts([
    { key: 'where', label: 'Where the magnet is' },
    { key: 'lam',   label: 'The flux the coil links, <i>N</i>Φ' },
    { key: 'emf',   label: 'The voltmeter: the emf across the coil' },
    { key: 'I',     label: 'The ammeter: the current round the circuit' },
    { key: 'push',  label: 'How hard the coil pushes back on the magnet' },
    { key: 'lenz',  label: 'Which end of the coil has become a north pole' },
    { key: 'books', label: 'The work your hand did against that push — and the heat in the resistor' },
    { key: 'flip',  label: 'Flipping the magnet' },
  ]);
  const outG = readouts([
    { key: 'lam0', label: 'The most flux the coil links, found by turning it' },
    { key: 'e0',   label: 'The peak emf, read off the trace' },
    { key: 'cmp',  label: 'And <i>NBA</i>ω, worked out here only to compare' },
    { key: 'T',    label: 'How long one turn takes' },
    { key: 'now',  label: 'Right now: the angle, the flux, and the emf' },
    { key: 'why',  label: 'Where the emf is biggest' },
  ]);
  const outL = readouts([
    { key: 'I0',   label: 'The peak current, read off the trace' },
    { key: 'Iav',  label: 'The current averaged over a whole turn' },
    { key: 'P0',   label: 'The peak power into the load' },
    { key: 'Pav',  label: 'The power averaged over a whole turn — and half the peak, to compare' },
    { key: 'rms',  label: 'The rms voltage, measured — and <i>V</i>₀/√2, to compare' },
    { key: 'dbl',  label: 'What doubling the frequency did' },
  ]);

  const bv = surface(MW, 520, { label: 'the bench' });
  const gv = surface(MW, HG, { label: 'what the instruments say' });

  const rowC = controls([el('div', { class: 'ibs-btns' }, [bLines.node, bFlip.node, bClear.node])]);
  const rowCs = controls([sBr.node, sN.node, sR.node]);
  const rowG = controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bEx.node, bDbl.node])]);
  const rowGs = controls([sGf.node, sGN.node, sGB.node, sGA.node, sGR.node]);

  const noteC = note('<b>Grab the magnet and move it.</b> Push it into the coil and '
    + 'both needles swing one way; pull it out and they swing the other; stop, '
    + 'anywhere — even right inside the coil — and they fall back to zero. The '
    + 'meters are not measuring how much of the magnet\'s field is in the coil. '
    + 'They are measuring how fast that amount is <b>changing</b>, and that is the '
    + 'whole of Faraday\'s law: ε = −d(<i>N</i>Φ)/d<i>t</i>. Move faster and the '
    + 'swing is bigger; add turns and it is bigger again, because every turn links '
    + 'the same flux and they add. Go past the end of the coil, up over the top of '
    + 'it, and the flux can even go <b>backwards</b> — the field of a bar magnet '
    + 'loops round outside it, and a coil beside the magnet catches the return. '
    + '<b>The minus sign is Lenz.</b> The current that flows turns the coil into a '
    + 'magnet of its own, and the end facing yours is always the one that fights '
    + 'what you are doing: a north pole to push back an approaching north, a south '
    + 'pole to hold on to a retreating one. The panel works out that push from the '
    + 'current, and it always points against your hand — so you have to do work to '
    + 'make the current, and the readouts show that work coming out, joule for '
    + 'joule, as heat in the resistor. The voltmeter hangs across the coil and '
    + 'carries no current, which is why there are no moving charges in its leads.');
  const noteG = note('<b>Nothing here is told that the flux is <i>NBA</i> cos θ.</b> '
    + 'The flux is added up over the coil\'s area, square by square, as the coil '
    + 'turns. The emf is worked out a different way entirely — every piece of wire is '
    + 'moving through the field, so a charge in it feels a push <i>v</i> × <i>B</i>, and '
    + 'the emf is that push added up round the loop. Only the two long sides do '
    + 'anything: the short ones move along their own length\'s direction relative to '
    + 'the push, and contribute nothing. That the emf traced this way is exactly minus '
    + 'the slope of the flux traced the other way is Faraday\'s law, arrived at rather '
    + 'than assumed. <b>Read the two graphs against each other.</b> Where the flux is '
    + 'at its biggest — the coil face-on to the field — the emf is zero, because at '
    + 'that instant the long sides are moving along the field and cut nothing. Where '
    + 'the flux passes through zero — the coil edge-on — the emf is biggest, because '
    + 'the long sides are moving straight across the field. The peak emf grows with '
    + 'every one of <i>N</i>, <i>B</i>, <i>A</i> — and with the frequency itself, '
    + 'because turning faster changes the flux faster. The picture turns 25 times '
    + 'slower than the frequency the numbers are for.');
  const noteL = note('<b>The current goes one way, then the other, and averages to '
    + 'nothing — but the resistor never stops getting warm.</b> The power is the '
    + 'current times the voltage, and the two change sign together, so their '
    + 'product never goes negative: the charges bump into the lattice whichever way '
    + 'they are drifting. Averaged over a whole turn it comes out at exactly half '
    + 'the peak, and the steady voltage that would heat the resistor just as fast — '
    + 'the rms — comes out at the peak over √2. Both are measured off the traces '
    + 'here, not quoted. <b>Double the frequency</b> and the peak voltage doubles, '
    + 'the current doubles with it, and so the power goes up four times.');

  root.append(
    heading('The Faraday Bench',
            'pick the magnet up and move it — the meters read how fast the flux '
            + 'through the coil is changing, and nothing else'),
    controls([el('div', { class: 'ibs-btns' }, bMode.map(b => b.node))],
             { label: 'on the bench:' }),
    panelBox('<span data-t="b">The magnet, the coil, and the two meters</span>', bv.el),
    panelBox('<span data-t="g">What the instruments say</span>', gv.el),
    rowC, rowCs, rowG, rowGs,
    outC.node, outG.node, outL.node,
    noteC, noteG, noteL);

  const titleB = root.querySelector('[data-t="b"]');
  const titleG = root.querySelector('[data-t="g"]');
  const show = (n, on) => { n.style.display = on ? '' : 'none'; };

  function setMode(k) {
    st.mode = k;
    bMode.forEach((b, i) => b.setPressed(Object.keys(MODES)[i] === k));
    const c = k === 'coil';
    show(rowC, c); show(rowCs, c); show(outC.node, c); show(noteC, c);
    show(rowG, !c); show(rowGs, !c);
    show(outG.node, k === 'gen'); show(noteG, k === 'gen');
    show(outL.node, k === 'load'); show(noteL, k === 'load');
    show(sGR.node, k === 'load');
    titleB.textContent = c ? 'The magnet, the coil, and the two meters'
      : k === 'gen' ? 'A coil turning between the poles — and the same coil, looking down its axle'
      : 'The generator drives a resistor';
    titleG.textContent = c ? 'What the instruments say'
      : k === 'gen' ? 'The flux the coil links, and the emf — on the same clock'
      : 'Voltage, current and power in the load';
    fitAll();
  }

  function syncButtons() {
    bLines.setPressed(st.lines);
    bFlip.disable(!canFlip());
    bFlip.el.title = canFlip() ? '' : 'move the magnet away from the coil first';
    bPlay.setLabel(st.g.playing ? 'Pause' : 'Turn');
    bDbl.setPressed(st.g.dbl);
  }

  /* ============================================================= drawing */

  let P = palette(root);
  const neg = s => String(s).replace(/-/g, '−');
  let TEXTS = [], BOXES = [], PAN = 'b';

  function colText(ctx, str, x, y, maxW, size, weight, color, maxLines = 2,
                   align = 'left') {
    let px = size;
    ctx.font = `${weight} ${px}px ${P.font}`;
    while (px > size - 1.5 && ctx.measureText(str).width > maxW) {
      px -= 0.5; ctx.font = `${weight} ${px}px ${P.font}`;
    }
    const lines = [];
    let cur = '';
    for (const w of str.split(' ')) {
      const trial = cur ? cur + ' ' + w : w;
      if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
      else { lines.push(cur); cur = w; }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines) lines.push(cur);
    while (lines.length > maxLines) lines.pop();
    let last = lines[lines.length - 1];
    if (ctx.measureText(last).width > maxW) {
      while (last.length > 1 && ctx.measureText(last + '…').width > maxW) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = last + '…';
    }
    lines.forEach((ln, i) => {
      const yy = y + i * (px + 3);
      const w = ctx.measureText(ln).width;
      const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ctext(ctx, ln, x, yy, { font: `${weight} ${px}px ${P.font}`, color, align });
      TEXTS.push({ p: PAN, str: ln, x: x0, y: yy - px * 0.8, w, h: px * 1.05 });
    });
    return lines.length * (px + 3);
  }

  function arrowHead(ctx, x, y, ux, uy, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + ux * size, y + uy * size);
    ctx.lineTo(x - ux * size * 0.6 - uy * size * 0.55, y - uy * size * 0.6 + ux * size * 0.55);
    ctx.lineTo(x - ux * size * 0.6 + uy * size * 0.55, y - uy * size * 0.6 - ux * size * 0.55);
    ctx.closePath(); ctx.fill();
  }
  function arrow(ctx, x1, y1, x2, y2, color, w = 2, head = 9) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (L < 4) return;
    const ux = dx / L, uy = dy / L;
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * head * 0.7, y2 - uy * head * 0.7);
    ctx.stroke();
    arrowHead(ctx, x2 - ux * head * 0.4, y2 - uy * head * 0.4, ux, uy, head * 0.9, color);
  }

  /* ---------------------------------------------------- the bench layout */

  const bandH = sm => (sm ? 158 : 196);
  const benchScale = W => (W < NARROW ? (W - 20) / 0.16 : Math.min((W - 40) / 0.22, 4300));
  function benchHeight(W) {
    const sm = W < NARROW;
    return Math.round(bandH(sm) + 10 + WORLD_H * benchScale(W) + 12);
  }

  function GB() {
    const W = bv.w, sm = W < NARROW;
    const band = bandH(sm);
    const s = benchScale(W);
    const top = band + 10;
    const ymid = top + WORLD_H * s / 2;
    const xcp = Math.round(W * (sm ? 0.6 : 0.58));
    const X = x => xcp + (x - COIL_X) * s, Y = y => ymid - (y - COIL_Y) * s;
    const wx0 = COIL_X + (10 - xcp) / s, wx1 = COIL_X + (W - 10 - xcp) / s;
    /* the meters */
    const rd = sm ? 44 : 72;
    const fw = rd * 2.35, fh = rd * 1.45;
    const acx = sm ? W * 0.23 : clamp(xcp - 300, fw / 2 + 14, W);
    const vcx = sm ? W * 0.77 : clamp(xcp + 300, 0, W - fw / 2 - 14);
    const ty = 12;
    const postY = ty + fh + 8;
    const yV = postY + 12, yRail = postY + 26, yLow = postY + 42;
    const resC = sm ? W * 0.5 : xcp, resH = sm ? 18 : 26;
    return { W, H: bv.h, sm, s, X, Y, xcp, ymid, top, band, wx0, wx1,
             rd, fw, fh, acx, vcx, ty, postY, yV, yRail, yLow, resC, resH };
  }

  /* ---------------------------------------------------------- field lines */

  let FL = null;
  function fieldLines() {
    if (FL) return FL;
    /* ψ on a grid in the magnet's own frame: r across, z along */
    const NR = 90, NZ = 181, RM = 0.075, ZM = 0.16;
    const psi = new Float64Array(NR * NZ);
    for (let i = 0; i < NR; i++) {
      const r = (i / (NR - 1)) * RM;
      for (let j = 0; j < NZ; j++) {
        const z = -ZM + (j / (NZ - 1)) * 2 * ZM;
        psi[i * NZ + j] = magnetPsi(r, z);
      }
    }
    const at = (r, z) => magnetPsi(r, z);
    const pmax = at(MAG_A * 0.999, 0);
    const levels = [0.06, 0.16, 0.3, 0.46, 0.64, 0.84].map(f => f * pmax);
    /* marching squares: segments of each contour, in (r, z) */
    const segs = levels.map(() => []);
    const rr = i => (i / (NR - 1)) * RM, zz = j => -ZM + (j / (NZ - 1)) * 2 * ZM;
    for (let i = 0; i < NR - 1; i++) {
      for (let j = 0; j < NZ - 1; j++) {
        const v = [psi[i * NZ + j], psi[(i + 1) * NZ + j],
                   psi[(i + 1) * NZ + j + 1], psi[i * NZ + j + 1]];
        const pts = [[rr(i), zz(j)], [rr(i + 1), zz(j)],
                     [rr(i + 1), zz(j + 1)], [rr(i), zz(j + 1)]];
        levels.forEach((L, k) => {
          const cut = [];
          for (let e = 0; e < 4; e++) {
            const a = v[e] - L, b = v[(e + 1) % 4] - L;
            if ((a < 0) !== (b < 0)) {
              const t = a / (a - b), p0 = pts[e], p1 = pts[(e + 1) % 4];
              cut.push([p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]);
            }
          }
          if (cut.length === 2) segs[k].push(cut[0], cut[1]);
          else if (cut.length === 4) segs[k].push(cut[0], cut[1], cut[2], cut[3]);
        });
      }
    }
    /* where each line crosses the magnet's middle plane, outside it: the
     * returning field there points from N back towards S */
    const marks = levels.map(L => {
      let lo = MAG_A * 1.001, hi = RM;
      if (at(hi, 0) > L) return null;
      for (let it = 0; it < 40; it++) {
        const m = 0.5 * (lo + hi);
        if (at(m, 0) > L) lo = m; else hi = m;
      }
      return 0.5 * (lo + hi);
    });
    FL = { segs, marks };
    return FL;
  }

  function drawFieldLines(ctx, g) {
    const fl = fieldLines();
    const sx = st.flip ? -1 : 1;
    const mx = g.X(st.x), my = g.Y(st.y);
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const seg of fl.segs) {
      for (let k = 0; k < seg.length; k += 2) {
        const [r0, z0] = seg[k], [r1, z1] = seg[k + 1];
        for (const side of [1, -1]) {
          ctx.moveTo(mx + z0 * g.s, my - side * r0 * g.s);
          ctx.lineTo(mx + z1 * g.s, my - side * r1 * g.s);
        }
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    /* arrows at the middle plane: outside the magnet the field runs N → S */
    for (const r of fl.marks) {
      if (r == null) continue;
      for (const side of [1, -1]) {
        arrowHead(ctx, mx, my - side * r * g.s, -sx, 0, 6, P.accent);
      }
    }
    ctx.restore();
  }

  /* -------------------------------------------------------------- the coil */

  const drawnTurns = () => clamp(Math.round(st.turns / 60), 3, 14);

  /** a point on the drawn helix, φ from 0 to 2π·n, left end to right end */
  function helix(g, phi, n) {
    const x = COIL_X - COIL_L / 2 + COIL_L * phi / (TAU * n);
    const rx = COIL_R * g.s * 0.3;
    return { x: g.X(x) + rx * Math.sin(phi),
             y: g.Y(COIL_Y) - COIL_R * g.s * Math.cos(phi),
             front: ((phi % TAU) + TAU) % TAU < Math.PI };
  }

  function drawCoilHalf(ctx, g, front) {
    const n = drawnTurns();
    ctx.lineCap = 'round';
    ctx.strokeStyle = front ? P.text : P.muted;
    ctx.lineWidth = front ? (g.sm ? 3 : 4.5) : (g.sm ? 2 : 3);
    const steps = 48;
    for (let k = 0; k < n; k++) {
      const a0 = k * TAU + (front ? 0 : Math.PI);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const q = helix(g, a0 + Math.PI * i / steps, n);
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      }
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------- the meters */

  function drawMeter(ctx, g, cx, which) {
    const { rd, fw, fh, ty, postY } = g;
    const x0 = cx - fw / 2;
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    croundRect(ctx, x0, ty, fw, fh, 10); ctx.fill(); ctx.stroke();
    BOXES.push({ p: 'b', x0, y0: ty, x1: x0 + fw, y1: ty + fh });
    const px = cx, py = ty + fh - 12;
    const R = rd * 0.92, span = 55 * Math.PI / 180;
    /* the scale */
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(px, py, R, -Math.PI / 2 - span, -Math.PI / 2 + span); ctx.stroke();
    for (let k = -10; k <= 10; k++) {
      const a = -Math.PI / 2 + span * k / 10, big = k % 5 === 0;
      const r0 = R - (big ? 9 : 5);
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
      ctx.lineTo(px + Math.cos(a) * R, py + Math.sin(a) * R);
      ctx.stroke();
    }
    const fs = which === 'A' ? ampFS() : voltFS();
    const unit = which === 'A' ? (fs < 1 ? 'mA' : 'A') : (fs < 1 ? 'mV' : 'V');
    const fsv = which === 'A' ? (fs < 1 ? fs * 1000 : fs) : (fs < 1 ? fs * 1000 : fs);
    const f = g.sm ? 9 : 10.5;
    const lab = v => (Math.abs(v) >= 10 ? fmt(v, 0) : fmt(v, v % 1 ? 1 : 0));
    const ends = [[-1, `−${lab(fsv)}`], [0, '0'], [1, lab(fsv)]];
    for (const [k, s] of ends) {
      const a = -Math.PI / 2 + span * k;
      ctext(ctx, s, px + Math.cos(a) * (R - 18), py + Math.sin(a) * (R - 18) + 4,
            { font: `600 ${f}px ${P.font}`, color: P.muted, align: 'center' });
    }
    /* the meter's name, in the corner, clear of the needle's sweep */
    ctext(ctx, which, x0 + 10, ty + fh - 9, { font: `700 ${g.sm ? 14 : 18}px ${P.font}`,
          color: P.accent });
    ctext(ctx, unit, x0 + fw - 10, ty + fh - 9,
          { font: `600 ${f}px ${P.font}`, color: P.muted, align: 'right' });
    /* the needle */
    const nd = which === 'A' ? st.nA.th : st.nV.th;
    const a = -Math.PI / 2 + span * nd;
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * (R - 3), py + Math.sin(a) * (R - 3)); ctx.stroke();
    ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    /* the terminals */
    for (const [dx, s] of [[-1, '−'], [1, '+']]) {
      const tx = cx + dx * fw * 0.32;
      ctx.fillStyle = dx > 0 ? P.accent : P.text;
      ctx.beginPath(); ctx.arc(tx, postY, 4.5, 0, TAU); ctx.fill();
      ctext(ctx, s, tx + dx * 11, postY + 4, { font: `700 12px ${P.font}`,
            color: P.text, align: 'center' });
    }
  }

  function circuit(g) {
    const n = drawnTurns();
    const tL = helix(g, 0, n), tR = helix(g, TAU * n, n);
    const xL = tL.x, xR = tR.x;
    const aP = g.acx + g.fw * 0.32, aM = g.acx - g.fw * 0.32;
    const vP = g.vcx + g.fw * 0.32, vM = g.vcx - g.fw * 0.32;
    const rR = g.resC + g.resH, rL = g.resC - g.resH;
    const xj = rL - (g.sm ? 22 : 30);
    /* the series loop, in the direction a positive current goes round it */
    const series = [
      [xR, tR.y], [xR, g.yRail], [rR, g.yRail], [rL, g.yRail], [aP, g.yRail],
      [aP, g.postY], null, [aM, g.postY], [aM, g.yLow], [xL, g.yLow], [xL, tL.y],
    ];
    const volt = [
      [[xR, g.yRail], [vP, g.yRail], [vP, g.postY]],
      [[xj, g.yRail], [xj, g.yV], [vM, g.yV], [vM, g.postY]],
    ];
    return { series, volt, xL, xR, tL, tR, rL, rR, xj };
  }

  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return L;
  }
  function polyAt(pts, s) {
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (s <= L) {
        const t = L > 0 ? s / L : 0;
        return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
                pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
      }
      s -= L;
    }
    return pts[pts.length - 1];
  }

  /** where the moving charges are drawn, so the verifier can ask */
  let DOTS = [];

  function drawBench() {
    const g = GB(), ctx = bv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = TEXTS.filter(q => q.p !== 'b'); BOXES = BOXES.filter(q => q.p !== 'b');
    PAN = 'b';
    if (st.mode !== 'coil') { drawGenerator(ctx, g); return; }

    /* a rule, because the bench is to scale */
    const rx = g.sm ? 12 : 18, ry = g.Y(-0.04);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(rx, ry - 4); ctx.lineTo(rx, ry + 4);
    ctx.moveTo(rx, ry); ctx.lineTo(rx + 0.02 * g.s, ry);
    ctx.moveTo(rx + 0.02 * g.s, ry - 4); ctx.lineTo(rx + 0.02 * g.s, ry + 4);
    ctx.stroke();
    colText(ctx, '2 cm', rx + 0.02 * g.s + 6, ry + 4, 60, 11, 600, P.text, 1);

    if (st.lines) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, g.top, g.W, g.H - g.top); ctx.clip();
      drawFieldLines(ctx, g);
      ctx.restore();
    }

    const cir = circuit(g);
    /* wires first, so the magnet can pass in front of the leads */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const stroke = pts => {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (!p) { pen = false; continue; }
        if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
      }
      ctx.stroke();
    };
    stroke(cir.series);
    ctx.lineWidth = 1.5; ctx.strokeStyle = P.muted;
    for (const v of cir.volt) stroke(v);
    /* the junctions */
    ctx.fillStyle = P.text;
    for (const [x, y] of [[cir.xR, g.yRail], [cir.xj, g.yRail]]) {
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
    }
    /* the resistor */
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.fillRect(cir.rL, g.yRail - 8, cir.rR - cir.rL, 16);
    ctx.strokeRect(cir.rL, g.yRail - 8, cir.rR - cir.rL, 16);
    ctext(ctx, 'R', g.resC, g.yRail - 12, { font: P.sym(13), color: P.text, align: 'center' });

    drawMeter(ctx, g, g.acx, 'A');
    drawMeter(ctx, g, g.vcx, 'V');

    /* the coil: back halves, then the magnet, then front halves */
    drawCoilHalf(ctx, g, false);
    drawMagnet(ctx, g);
    drawCoilHalf(ctx, g, true);

    /* the moving charges: conventional current, round the series loop and
     * the drawn winding, at a speed that follows the current */
    DOTS = [];
    const segsOut = [];
    let cur = [];
    for (const p of cir.series) {
      if (!p) { segsOut.push(cur); cur = []; } else cur.push(p);
    }
    segsOut.push(cur);
    const n = drawnTurns();
    const coilPts = [];
    for (let i = 0; i <= n * 40; i++) {
      const q = helix(g, TAU * n * i / (n * 40), n);
      coilPts.push([q.x, q.y, q.front]);
    }
    const phase = st.dot / Math.max(1e-9, ampFS()) * 60;   // px
    const gap = 16;
    const drawAlong = (pts, withFront) => {
      const L = polyLen(pts);
      if (L < 1) return;
      const off = ((phase % gap) + gap) % gap;
      for (let s = off; s < L; s += gap) {
        const [x, y] = polyAt(pts, s);
        let front = true;
        if (withFront) {
          const k = Math.min(pts.length - 1, Math.round(s / L * (pts.length - 1)));
          front = pts[k][2];
        }
        ctx.fillStyle = front ? P.accent : P.line || 'rgba(0,95,106,.35)';
        ctx.beginPath(); ctx.arc(x, y, front ? 3 : 2.3, 0, TAU); ctx.fill();
        DOTS.push({ x, y });
      }
    };
    if (Math.abs(st.I) > 1e-4 * ampFS()) {
      for (const sg of segsOut) drawAlong(sg, false);
      drawAlong(coilPts, true);
    }

    /* the coil's push on the magnet, as an arrow, and no number on it */
    const F = Math.hypot(st.Fx, st.Fy);
    const Fs = 0.3 * ampFS() * voltFS() / 0.45;             // a scale for the arrow
    if (F > 0.01 * Fs) {
      const L = Math.sqrt(clamp(F / Fs, 0, 1)) * 70 + 14;
      const cx = g.X(st.x), cy = g.Y(st.y) - MAG_A * g.s - 16;
      arrow(ctx, cx, cy, cx + st.Fx / F * L, cy - st.Fy / F * L, P.text, 2.4, 10);
    }

    /* two captions, outside everything */
    colText(ctx, `drawn with ${n} turns — every sum uses all ${st.turns}`,
            g.W - 12, g.H - 8, g.sm ? g.W * 0.6 : 330, g.sm ? 10 : 11, 500,
            P.muted, 1, 'right');
  }

  function drawMagnet(ctx, g) {
    const x0 = g.X(st.x - MAG_L / 2), x1 = g.X(st.x + MAG_L / 2);
    const y0 = g.Y(st.y + MAG_A), y1 = g.Y(st.y - MAG_A);
    const xm = 0.5 * (x0 + x1);
    const nRight = !st.flip;
    ctx.lineWidth = 2;
    /* N half solid, S half outlined */
    ctx.fillStyle = P.accent;
    if (nRight) ctx.fillRect(xm, y0, x1 - xm, y1 - y0);
    else ctx.fillRect(x0, y0, xm - x0, y1 - y0);
    ctx.fillStyle = P.bg;
    if (nRight) ctx.fillRect(x0, y0, xm - x0, y1 - y0);
    else ctx.fillRect(xm, y0, x1 - xm, y1 - y0);
    ctx.strokeStyle = P.accent;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const f = `700 ${Math.round(clamp((y1 - y0) * 0.55, 10, 20))}px ${P.font}`;
    ctext(ctx, 'N', nRight ? (xm + x1) / 2 : (x0 + xm) / 2, (y0 + y1) / 2 + 6,
          { font: f, color: '#fff', align: 'center' });
    ctext(ctx, 'S', nRight ? (x0 + xm) / 2 : (xm + x1) / 2, (y0 + y1) / 2 + 6,
          { font: f, color: P.accent, align: 'center' });
    if (st.drag) {
      ctx.strokeStyle = P.text; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
      ctx.setLineDash([]);
    }
  }

  /* ------------------------------------------------------- the generator */

  function genLayout(W) {
    const sm = W < NARROW;
    if (st.mode === 'load') {
      const k = sm ? Math.min((W - 16) / 640, 1) : 1;
      return { H: Math.round(sm ? 44 + 210 * k + 40 : 290) };
    }
    if (!sm) return { H: 430 };
    const k1 = Math.min((W - 16) / 560, 1), k2 = Math.min((W - 16) / 440, 0.9);
    return { H: Math.round(10 + 400 * k1 + 14 + 400 * k2 + 8) };
  }

  function drawGenerator(ctx, g) {
    if (st.mode === 'load') { drawLoad(ctx, g); return; }
    const sm = g.sm;
    const th = st.g.th;
    /* the pseudo-3D view, designed in a 560 × 400 box */
    const k1 = sm ? Math.min((g.W - 16) / 560, 1) : Math.min((g.W * 0.56) / 560, 1);
    const o1x = sm ? (g.W - 560 * k1) / 2 : 14, o1y = sm ? 10 : 14;
    const k2 = sm ? Math.min((g.W - 16) / 440, 0.9) : Math.min((g.W * 0.4) / 440, 1);
    const o2x = sm ? (g.W - 440 * k2) / 2 : g.W - 440 * k2 - 14;
    const o2y = sm ? 10 + 400 * k1 + 14 : 14;

    const T3 = (x, y) => [o1x + x * k1, o1y + y * k1];
    const cx = 280, cy = 205;
    const proj = (x, y, z) => T3(cx + x + z * 0.42, cy + y - z * 0.2);

    /* the pole pieces */
    const pole = (x, solid, letter) => {
      const [px, py] = T3(x, cy - 100);
      ctx.fillStyle = solid ? P.accent : P.bg; ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.6;
      croundRect(ctx, px, py, 64 * k1, 200 * k1, 6); ctx.fill(); ctx.stroke();
      ctext(ctx, letter, px + 32 * k1, py + 108 * k1,
            { font: `700 ${Math.round(22 * k1)}px ${P.font}`,
              color: solid ? '#fff' : P.accent, align: 'center' });
    };
    pole(cx - 262, true, 'N');
    pole(cx + 198, false, 'S');
    /* the field */
    ctx.save();
    for (const yy of [-66, -22, 22, 66]) {
      const [a0, b0] = T3(cx - 190, cy + yy), [a1, b1] = T3(cx + 190, cy + yy);
      arrow(ctx, a0, b0, a1, b1, P.line || 'rgba(0,95,106,.35)', 1.8, 9);
    }
    ctx.restore();
    const [bxl, byl] = T3(cx + 176, cy - 76);
    ctext(ctx, 'B', bxl, byl, { font: P.sym(Math.round(15 * k1)), color: P.accent });

    /* the coil: a square, turning about a vertical axle */
    const hw = 108, hh = 82;
    /* ê_u = (−sin θ, 0, cos θ): the direction across the coil's face */
    const eux = -Math.sin(th), euz = Math.cos(th);
    const P1 = proj(-hw * eux, -hh, -hw * euz), P2 = proj(hw * eux, -hh, hw * euz);
    const P3 = proj(hw * eux, hh, hw * euz), P4 = proj(-hw * eux, hh, -hw * euz);
    ctx.fillStyle = P.soft || 'rgba(0,95,106,.08)';
    ctx.beginPath(); ctx.moveTo(...P1); ctx.lineTo(...P2); ctx.lineTo(...P3);
    ctx.lineTo(...P4); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = P.text; ctx.lineWidth = 4.5 * k1;
    ctx.beginPath(); ctx.moveTo(...P1); ctx.lineTo(...P2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...P4); ctx.lineTo(...P3); ctx.stroke();
    ctx.strokeStyle = P.accent;
    ctx.beginPath(); ctx.moveTo(...P2); ctx.lineTo(...P3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...P1); ctx.lineTo(...P4); ctx.stroke();
    /* which way the current goes in the long sides, from the sign of the emf */
    const e = gEmf(th);
    const eMax = gEmf(Math.PI / 2);
    if (Math.abs(e) > 0.05 * Math.abs(eMax)) {
      const d = Math.sign(e);
      /* positive circulation goes down the side at +ê_u and up the side at −ê_u */
      const chev = (pa, pb) => {
        for (const q of [0.35, 0.65]) {
          const x = pa[0] + (pb[0] - pa[0]) * q, y = pa[1] + (pb[1] - pa[1]) * q;
          const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
          arrowHead(ctx, x, y, (pb[0] - pa[0]) / L, (pb[1] - pa[1]) / L, 7, '#fff');
        }
      };
      if (d > 0) { chev(P2, P3); chev(P4, P1); } else { chev(P3, P2); chev(P1, P4); }
    }
    /* the axle, slip rings and brushes */
    const top = proj(0, -hh, 0), bot = proj(0, hh, 0);
    ctx.strokeStyle = P.text; ctx.lineWidth = 3 * k1;
    ctx.beginPath(); ctx.moveTo(top[0], top[1] - 24 * k1); ctx.lineTo(top[0], top[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bot[0], bot[1]); ctx.lineTo(bot[0], bot[1] + 58 * k1); ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3.2 * k1;
    for (const dy of [20, 36]) {
      ctx.beginPath();
      ctx.ellipse(bot[0], bot[1] + dy * k1, 10 * k1, 4.2 * k1, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = P.text;
    ctx.fillRect(bot[0] - 25 * k1, bot[1] + 16 * k1, 10 * k1, 8 * k1);
    ctx.fillRect(bot[0] + 15 * k1, bot[1] + 32 * k1, 10 * k1, 8 * k1);
    /* the turning arrow */
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(top[0], top[1] - 30 * k1, 17 * k1, 7 * k1, 0, -2.6, 0.5); ctx.stroke();
    arrowHead(ctx, top[0] + 15 * k1, top[1] - 26 * k1, 0.3, 0.95, 7, P.text);
    ctext(ctx, 'ω', top[0] + 28 * k1, top[1] - 26 * k1, { font: P.sym(Math.round(14 * k1)),
          color: P.text });
    const [lx, ly] = T3(cx + 70, cy + hh + 58);
    colText(ctx, 'slip rings and brushes', lx, ly, 200 * k1, 10.5, 500, P.muted, 1);

    /* the view down the axle, designed in a 440 × 400 box */
    const T2 = (x, y) => [o2x + x * k2, o2y + y * k2];
    const sx = 220, sy = 205, LR = 118;
    for (const yy of [-78, 0, 78]) {
      const [a0, b0] = T2(sx - 180, sy + yy), [a1, b1] = T2(sx + 180, sy + yy);
      arrow(ctx, a0, b0, a1, b1, P.line || 'rgba(0,95,106,.35)', 1.8, 9);
    }
    const [bb0, bb1] = T2(sx + 168, sy - 88);
    ctext(ctx, 'B', bb0, bb1, { font: P.sym(Math.round(15 * k2)), color: P.accent });
    /* looking down from above: x to the right, the depth axis down the page */
    const nx = Math.cos(th), ny = Math.sin(th);
    const ex = -ny, ey = nx;
    const [c0x, c0y] = T2(sx, sy);
    ctx.strokeStyle = P.text; ctx.lineWidth = 5 * k2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c0x - ex * LR * k2, c0y - ey * LR * k2);
    ctx.lineTo(c0x + ex * LR * k2, c0y + ey * LR * k2); ctx.stroke();
    ctx.fillStyle = P.accent;
    for (const sgn2 of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(c0x + sgn2 * ex * LR * k2, c0y + sgn2 * ey * LR * k2, 6 * k2, 0, TAU);
      ctx.fill();
    }
    arrow(ctx, c0x, c0y, c0x + nx * 78 * k2, c0y + ny * 78 * k2, P.text, 2.4, 10);
    ctext(ctx, 'n̂', c0x + nx * 92 * k2, c0y + ny * 92 * k2 + 5,
          { font: P.sym(Math.round(15 * k2)), color: P.text, align: 'center' });
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8;
    const thw = ((th % TAU) + TAU) % TAU;
    ctx.beginPath(); ctx.arc(c0x, c0y, 34 * k2, 0, thw, false); ctx.stroke();
    ctext(ctx, 'θ', c0x + 48 * k2 * Math.cos(thw / 2), c0y + 48 * k2 * Math.sin(thw / 2) + 5,
          { font: P.sym(Math.round(14 * k2)), color: P.accent, align: 'center' });
    const [capx, capy] = T2(sx, 26);
    colText(ctx, 'looking down the axle: θ is the angle between the coil\'s normal and the field',
            capx, capy, 420 * k2, 11.5, 600, P.accent, 2, 'center');
    const [c2x, c2y] = T2(sx, 392);
    colText(ctx, `the picture turns ${SLOW} times slower than the numbers`,
            c2x, c2y, 420 * k2, 10.5, 500, P.muted, 1, 'center');
  }

  function drawLoad(ctx, g) {
    const sm = g.sm;
    const k = sm ? Math.min((g.W - 16) / 640, 1) : Math.min((g.W - 40) / 1060, 1);
    const ox = sm ? (g.W - 640 * k) / 2 : (g.W - 1060 * k) / 2;
    const Tt = (x, y) => [ox + x * k, 44 + (y - 50) * k];
    const e = gEmf(st.g.th), I = e / st.g.R;
    const I0 = Math.abs(gEmf(Math.PI / 2)) / st.g.R;
    /* the circuit: a rectangle, the generator on the left, the load on the right */
    const L = sm ? 40 : 60, R_ = sm ? 600 : 620, Tp = 50, Bt = 250;
    const [ax, ay] = Tt(L, Tp), [bx, by] = Tt(R_, Bt);
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
    const [gx, gy] = Tt(L, 150);
    ctx.fillStyle = P.bg; ctx.beginPath(); ctx.arc(gx, gy, 30 * k, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(gx, gy, 30 * k, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let q = 0; q <= 24; q++) {
      const x = gx - 16 * k + q * 32 * k / 24, y = gy - 9 * k * Math.sin(q / 24 * TAU);
      if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    const [rx, ry] = Tt(R_, 150);
    ctx.fillStyle = P.bg; ctx.fillRect(rx - 20 * k, ry - 46 * k, 40 * k, 92 * k);
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.strokeRect(rx - 20 * k, ry - 46 * k, 40 * k, 92 * k);
    ctext(ctx, 'R', rx + 32 * k, ry + 5, { font: P.sym(15), color: P.text });
    /* the charges drift to and fro: their displacement is the integral of I */
    const disp = -Math.cos(st.g.th);
    const per = 2 * ((bx - ax) + (by - ay));
    for (let q = 0; q < 30; q++) {
      let s = ((q / 30) * per + disp * 34 * k + per) % per;
      let x, y;
      const w = bx - ax, h = by - ay;
      if (s < w) { x = ax + s; y = ay; }
      else if (s < w + h) { x = bx; y = ay + (s - w); }
      else if (s < 2 * w + h) { x = bx - (s - w - h); y = by; }
      else { x = ax; y = by - (s - 2 * w - h); }
      /* not drawn inside the generator or the load */
      if (Math.hypot(x - gx, y - gy) < 34 * k) continue;
      if (Math.abs(x - rx) < 24 * k && Math.abs(y - ry) < 50 * k) continue;
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
    }
    /* which way the current is going now, as an arrow with no number */
    const midx = (ax + bx) / 2;
    if (Math.abs(I) > 0.06 * I0) {
      const d = Math.sign(I);
      arrow(ctx, midx - 40 * d, ay - 20, midx + 40 * d, ay - 20, P.accent, 2.6, 11);
    }
    colText(ctx, Math.abs(I) > 0.06 * I0 ? 'the current, this instant'
                                          : 'the current is reversing',
            midx, ay - 34, 260, 11, 600, Math.abs(I) > 0.06 * I0 ? P.accent : P.muted,
            1, 'center');
    /* inside the resistor, if there is room: charges and the lattice */
    if (!sm) {
      const [m0x, m0y] = Tt(700, 110), [m1x, m1y] = Tt(1040, 190);
      ctx.fillStyle = P.soft || 'rgba(0,95,106,.08)';
      ctx.fillRect(m0x, m0y, m1x - m0x, m1y - m0y);
      ctx.strokeStyle = P.frame; ctx.strokeRect(m0x, m0y, m1x - m0x, m1y - m0y);
      BOXES.push({ p: 'b', x0: m0x, y0: m0y, x1: m1x, y1: m1y });
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = P.muted;
          ctx.beginPath();
          ctx.arc(m0x + 24 + i * (m1x - m0x - 48) / 7, m0y + 22 + j * (m1y - m0y - 44), 5, 0, TAU);
          ctx.fill();
        }
      }
      for (let q = 0; q < 10; q++) {
        const xx = m0x + 14 + ((q * 37 + disp * 30 + 400) % (m1x - m0x - 28));
        const yy = m0y + 14 + ((q * 19) % (m1y - m0y - 28));
        ctx.fillStyle = P.accent;
        ctx.beginPath(); ctx.arc(xx, yy, 2.8, 0, TAU); ctx.fill();
      }
      colText(ctx, 'inside the load: the charges hit the lattice whichever way they drift — so it heats either way',
              (m0x + m1x) / 2, m1y + 20, m1x - m0x, 11, 500, P.muted, 2, 'center');
    }
    colText(ctx, 'the generator', gx + 40 * k, gy + 4, 140, 11, 500, P.muted, 1);
  }

  /* ------------------------------------------------- the instrument panel */

  const roundUp = v => nice(v);

  function stripBox(ctx, g, y0, y1, title, value, why) {
    const x0 = g.x0, x1 = g.x1;
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
    BOXES.push({ p: 'g', x0, y0, x1, y1 });
    const maxW = x0 - 12 - 14;
    colText(ctx, title, 12, y0 + (g.sm ? 13 : 15), maxW, g.sm ? 10.5 : 12.5, 600, P.accent, 2);
    colText(ctx, value, 12, y0 + (g.sm ? 42 : 38), maxW, g.sm ? 12.5 : 16, 700, P.text, 1);
    if (!g.sm && why) colText(ctx, why, 12, y0 + 58, maxW, 10.5, 500, P.muted, 3);
  }

  function traceIn(ctx, g, y0, y1, xs, ys, lo, hi, color, width, dash) {
    const Yv = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    ctx.save();
    croundRect(ctx, g.x0, y0, g.x1 - g.x0, y1 - y0, 6); ctx.clip();
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.x0, Yv(0)); ctx.lineTo(g.x1, Yv(0)); ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i) ctx.lineTo(xs[i], Yv(ys[i])); else ctx.moveTo(xs[i], Yv(ys[i]));
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  function scaleLabels(ctx, g, y0, y1, hi, lo, show, left) {
    ctext(ctx, show(hi), g.x1 - 4, y0 + 12,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, show(lo), g.x1 - 4, y1 - 4,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    if (left) ctext(ctx, left, g.x0 + 6, y1 - 4,
                    { font: `500 10px ${P.font}`, color: P.muted });
  }

  const GG = () => {
    const W = gv.w, sm = W < NARROW, H = gv.h;
    return { W, H, sm, x0: sm ? 118 : 250, x1: W - (sm ? 12 : 28), y0: 14, y1: H - 16 };
  };

  function unitV(v) {
    const a = Math.abs(v);
    if (a >= 100) return `${neg(fmt(v, 1))} V`;
    if (a >= 1 || a === 0) return `${neg(fmt(v, 3))} V`;
    if (a >= 1e-3) return `${neg(fmt(v * 1e3, 1))} mV`;
    return `${neg(fmt(v * 1e6, 0))} μV`;
  }
  function unitA(v) {
    const a = Math.abs(v);
    if (a >= 1 || a === 0) return `${neg(fmt(v, 3))} A`;
    if (a >= 1e-3) return `${neg(fmt(v * 1e3, 2))} mA`;
    return `${neg(fmt(v * 1e6, 0))} μA`;
  }
  const unitWb = v => (Math.abs(v) >= 0.01 || v === 0 ? `${neg(fmt(v, 4))} Wb`
                                                    : `${neg(sci(v, 3))} Wb`);
  /** an axis end: the nice number the scale was rounded to, said shortly */
  function axisLab(v, unit) {
    const a = Math.abs(v);
    let k = 1, u = unit;
    if (unit !== 'Wb' && a > 0 && a < 1) { k = 1e3; u = 'm' + unit; }
    if (unit === 'W' && a >= 1000) { k = 1e-3; u = 'kW'; }
    const x = v * k;
    const t = Number(x.toPrecision(2));
    return `${neg(String(t))} ${u}`;
  }
  const axWb = v => axisLab(v, 'Wb'), axV = v => axisLab(v, 'V');
  const axA = v => axisLab(v, 'A'), axW = v => axisLab(v, 'W');

  function drawGraph() {
    const g = GG(), ctx = gv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = TEXTS.filter(q => q.p !== 'g'); BOXES = BOXES.filter(q => q.p !== 'g');
    PAN = 'g';
    if (st.mode === 'coil') drawCoilGraph(ctx, g);
    else if (st.mode === 'gen') drawGenGraph(ctx, g);
    else drawLoadGraph(ctx, g);
  }

  function drawCoilGraph(ctx, g) {
    const H3 = (g.y1 - g.y0) / 3;
    const h = st.hist;
    const tNow = st.t, t0 = tNow - WIN;
    const X = t => g.x0 + (t - t0) / WIN * (g.x1 - g.x0);
    const xs = h.map(q => X(q.t));
    const lamTop = roundUp(Math.max(lamMax() * 1.05, 1e-9));
    const rows = [
      ['The flux the coil links', unitWb(st.lam),
       'how much of the magnet\'s field threads the coil, times the turns',
       h.map(q => q.lam), -lamTop, lamTop, axWb],
      ['The voltmeter: the emf', unitV(st.emf),
       'minus the rate that the line above is changing — flat line, no volts',
       h.map(q => q.emf), -voltFS(), voltFS(), axV],
      ['The ammeter: the current', unitA(st.I),
       'the emf divided by the resistance — the same shape, a different size',
       h.map(q => q.I), -ampFS(), ampFS(), axA],
    ];
    rows.forEach((r, k) => {
      const y0 = g.y0 + k * H3 + 5, y1 = g.y0 + (k + 1) * H3 - 5;
      stripBox(ctx, g, y0, y1, r[0], r[1], r[2]);
      traceIn(ctx, g, y0, y1, xs, r[3].map(v => clamp(v, r[4] * 1.1, r[5] * 1.1)),
              r[4], r[5], P.accent, 2.4);
      scaleLabels(ctx, g, y0, y1, r[5], r[4], r[6], `last ${WIN} s`);
    });
  }

  function phaseTrace(g, f, fn, nPts = 480) {
    /* two whole turns at the frequency now on the dial, ending at this instant */
    const xs = [], ys = [];
    const win = 2 * TAU;
    for (let i = 0; i <= nPts; i++) {
      const p = i / nPts;
      const ph = st.g.th + (p - 1) * win;
      xs.push(g.x0 + p * (g.x1 - g.x0));
      ys.push(fn(ph * (f / st.g.f)));
    }
    return { xs, ys };
  }

  function drawGenGraph(ctx, g) {
    const H2 = (g.y1 - g.y0) / 2;
    const m = gMeasure();
    const dbl = st.g.dbl;
    const fTop = roundUp(m.lam0 * 1.05);
    const vTop = roundUp(m.V0 * (dbl ? 2 : 1) * 1.05);
    const tWin = 2 / st.g.f;
    const lbl = `${fmt(tWin * 1000, 0)} ms`;
    const rows = [
      ['The flux the coil links, NΦ', unitWb(gFlux(st.g.th)),
       'added up over the coil\'s area as it turns', th => gFlux(th), fTop,
       axWb],
      ['The emf round the coil', unitV(gEmf(st.g.th)),
       'the push v × B on the charges, added up round the wire', th => gEmf(th), vTop,
       axV],
    ];
    rows.forEach((r, k) => {
      const y0 = g.y0 + k * H2 + 5, y1 = g.y0 + (k + 1) * H2 - 5;
      stripBox(ctx, g, y0, y1, r[0], r[1], r[2]);
      const tr = phaseTrace(g, st.g.f, r[3]);
      if (dbl) {
        const t2 = phaseTrace(g, 2 * st.g.f,
          k === 0 ? r[3] : (th => gEmf(th, 2 * st.g.f)));
        traceIn(ctx, g, y0, y1, t2.xs, t2.ys, -r[4], r[4],
                P.line || 'rgba(0,95,106,.35)', 2, [5, 4]);
      }
      traceIn(ctx, g, y0, y1, tr.xs, tr.ys, -r[4], r[4], P.accent, 2.4);
      scaleLabels(ctx, g, y0, y1, r[4], -r[4], r[5], lbl);
    });
    /* guides where the flux is at an extreme: the emf is zero there */
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    const win = 2 * TAU;
    for (let mm = Math.ceil((st.g.th - win) / Math.PI); mm <= Math.floor(st.g.th / Math.PI); mm++) {
      const p = (mm * Math.PI - st.g.th) / win + 1;
      if (p < 0 || p > 1) continue;
      const x = g.x0 + p * (g.x1 - g.x0);
      ctx.beginPath(); ctx.moveTo(x, g.y0 + 5); ctx.lineTo(x, g.y1 - 5); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLoadGraph(ctx, g) {
    const H3 = (g.y1 - g.y0) / 3;
    const m = gMeasure(), dbl = st.g.dbl;
    const m2 = dbl ? gMeasure(2 * st.g.f) : null;
    const k = dbl ? 2 : 1;
    const vTop = roundUp(m.V0 * k * 1.05), iTop = roundUp(m.I0 * k * 1.05);
    const pTop = roundUp(m.P0 * k * k * 1.05);
    const lbl = `${fmt(2000 / st.g.f, 0)} ms`;
    const unitP = v => (Math.abs(v) >= 1000 ? `${fmt(v / 1000, 2)} kW` : `${fmt(v, 1)} W`);
    const R = st.g.R;
    const rows = [
      ['The voltage across the load', unitV(gEmf(st.g.th)),
       'the generator\'s emf, straight across the resistor', th => gEmf(th),
       f2 => (th => gEmf(th, f2)), -vTop, vTop, axV],
      ['The current through it', unitA(gEmf(st.g.th) / R),
       'the voltage over R: in step with it, never ahead or behind',
       th => gEmf(th) / R, f2 => (th => gEmf(th, f2) / R), -iTop, iTop, axA],
      ['The power into it', unitP(gEmf(st.g.th) ** 2 / R),
       'current times voltage — two things that change sign together',
       th => gEmf(th) ** 2 / R, f2 => (th => gEmf(th, f2) ** 2 / R), 0, pTop, axW],
    ];
    rows.forEach((r, kk) => {
      const y0 = g.y0 + kk * H3 + 5, y1 = g.y0 + (kk + 1) * H3 - 5;
      stripBox(ctx, g, y0, y1, r[0], r[1], r[2]);
      if (dbl) {
        const t2 = phaseTrace(g, 2 * st.g.f, r[4](2 * st.g.f));
        traceIn(ctx, g, y0, y1, t2.xs, t2.ys, r[5], r[6],
                P.line || 'rgba(0,95,106,.35)', 2, [5, 4]);
      }
      const tr = phaseTrace(g, st.g.f, r[3]);
      traceIn(ctx, g, y0, y1, tr.xs, tr.ys, r[5], r[6], P.accent, 2.4);
      if (kk === 2) {
        /* the measured average, as a dashed line across */
        const Yv = v => y1 - (v - r[5]) / (r[6] - r[5]) * (y1 - y0);
        ctx.save();
        ctx.strokeStyle = P.text; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(g.x0, Yv(m.Pav)); ctx.lineTo(g.x1, Yv(m.Pav)); ctx.stroke();
        if (m2) {
          ctx.strokeStyle = P.muted;
          ctx.beginPath(); ctx.moveTo(g.x0, Yv(m2.Pav)); ctx.lineTo(g.x1, Yv(m2.Pav)); ctx.stroke();
        }
        ctx.restore();
      }
      scaleLabels(ctx, g, y0, y1, r[6], r[5], r[7], lbl);
    });
  }

  /* ---------------------------------------------------------- the numbers */

  function fillReadouts() {
    if (st.mode === 'coil') {
      const dx = (st.x - COIL_X) * 100, dy = (st.y - COIL_Y) * 100;
      const side = Math.abs(dx) < 0.05 ? 'level with the coil\'s middle'
        : `${fmt(Math.abs(dx), 1)} cm ${dx < 0 ? 'left of' : 'right of'} the coil's middle`;
      const up = Math.abs(dy) < 0.05 ? 'on its axis'
        : `${fmt(Math.abs(dy), 1)} cm ${dy > 0 ? 'above' : 'below'} its axis`;
      const inside = Math.abs(st.x - COIL_X) < 0.5 * (MAG_L + COIL_L)
        && Math.abs(st.y - COIL_Y) + MAG_A < COIL_R;
      const F = Math.hypot(st.Fx, st.Fy);
      const against = (st.Fx * (st.vx || 0) + st.Fy * (st.vy || 0)) < 0;
      /* which end of the coil is a north pole: its own field points out of
       * that end, and a positive current makes the field point along +x */
      let lenz = 'neither — no current, so the coil is not a magnet at all';
      if (Math.abs(st.I) > 1e-3 * ampFS()) {
        const rightN = st.I > 0;
        const magFacing = st.x < COIL_X ? (st.flip ? 'south' : 'north')
                                        : (st.flip ? 'north' : 'south');
        const coilFacing = st.x < COIL_X ? (rightN ? 'south' : 'north')
                                         : (rightN ? 'north' : 'south');
        const verb = coilFacing === magFacing ? 'pushing it away' : 'pulling it back';
        lenz = `the ${rightN ? 'right' : 'left'} end — so the end facing the magnet's `
             + `${magFacing} pole is a ${coilFacing}, ${verb}`;
      }
      outC.setAll({
        where: `${side}, ${up}${inside ? ' — inside the coil' : ''}`,
        lam: unitWb(st.lam),
        emf: unitV(st.emf),
        I: unitA(st.I),
        push: F > 0 ? `${fmt(F * 1000, 2)} mN${against ? ', against the way it is moving' : ''}`
                    : '0 mN — nothing is changing, so nothing pushes',
        lenz,
        books: `${fmt(st.W * 1000, 3)} mJ of work · ${fmt(st.Q * 1000, 3)} mJ of heat`,
        flip: canFlip() ? 'ready — the magnet is far enough from the coil'
                        : 'move the magnet away from the coil first',
      });
    } else if (st.mode === 'gen') {
      const m = gMeasure();
      const th = ((st.g.th % TAU) + TAU) % TAU;
      outG.setAll({
        lam0: unitWb(m.lam0),
        e0: unitV(m.V0),
        cmp: `${fmt(st.g.N * st.g.B * st.g.A * gOmega(), 1)} V`,
        T: `${fmt(m.T * 1000, 1)} ms, so ${fmt(st.g.f, 0)} turns a second`,
        now: `θ = ${fmt(th * 180 / Math.PI, 0)}° · ${unitWb(gFlux(st.g.th))} · ${unitV(gEmf(st.g.th))}`,
        why: 'when the coil is edge-on to the field, and the flux through it is passing through zero',
      });
    } else {
      const m = gMeasure();
      const m2 = gMeasure(2 * st.g.f);
      const unitP = v => (Math.abs(v) >= 1000 ? `${fmt(v / 1000, 3)} kW` : `${fmt(v, 2)} W`);
      outL.setAll({
        I0: `${unitA(m.I0)} — and V₀/R = ${unitA(m.V0 / st.g.R)}`,
        Iav: `${unitA(Math.abs(m.Iav) < 1e-12 ? 0 : m.Iav)} — yet the load keeps heating`,
        P0: unitP(m.P0),
        Pav: `${unitP(m.Pav)} · half the peak is ${unitP(m.P0 / 2)}`,
        rms: `${unitV(m.rms)} · V₀/√2 = ${unitV(m.V0 / Math.SQRT2)}`,
        dbl: `V₀ × ${fmt(m2.V0 / m.V0, 3)} · I₀ × ${fmt(m2.I0 / m.I0, 3)} · `
           + `P₀ × ${fmt(m2.P0 / m.P0, 3)} · T × ${fmt(m2.T / m.T, 3)}`,
      });
    }
  }

  const render = () => { drawBench(); drawGraph(); fillReadouts(); syncButtons(); };

  /* ------------------------------------------------------------ the hand */

  bv.el.style.touchAction = 'none';
  let grab = null;
  const world = (g, pt) => ({ x: COIL_X + (pt.x - g.xcp) / g.s,
                             y: COIL_Y + (g.ymid - pt.y) / g.s });
  function overMagnet(g, pt) {
    const x0 = g.X(st.x - MAG_L / 2), x1 = g.X(st.x + MAG_L / 2);
    const y0 = g.Y(st.y + MAG_A), y1 = g.Y(st.y - MAG_A);
    return pt.x > x0 - 8 && pt.x < x1 + 8 && pt.y > y0 - 8 && pt.y < y1 + 8;
  }
  bv.el.addEventListener('pointerdown', e => {
    if (st.mode !== 'coil') return;
    const g = GB(), pt = bv.at(e);
    if (!overMagnet(g, pt)) return;
    const w = world(g, pt);
    grab = { dx: st.x - w.x, dy: st.y - w.y };
    st.drag = true; st.tx = st.x; st.ty = st.y;
    try { bv.el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  bv.el.addEventListener('pointermove', e => {
    if (st.mode !== 'coil') return;
    const g = GB(), pt = bv.at(e);
    if (!grab) { bv.el.style.cursor = overMagnet(g, pt) ? 'grab' : 'default'; return; }
    const w = world(g, pt);
    st.tx = w.x + grab.dx; st.ty = w.y + grab.dy;
    e.preventDefault();
  });
  const letGo = () => { if (grab) { grab = null; st.drag = false; } };
  bv.el.addEventListener('pointerup', letGo);
  bv.el.addEventListener('pointercancel', letGo);

  /* ------------------------------------------------------- the animation */

  const SUB = 8;
  let frame = 0;
  function stepBench(dt) {
    if (!(dt > 1e-6)) return;
    const h = dt / SUB;
    for (let i = 0; i < SUB; i++) {
      const target = st.drag ? { x: st.tx, y: st.ty } : { x: st.x, y: st.y };
      const p = stepHand(h, target);
      moveTo(p.x, p.y, h);
    }
    pushHist();
  }
  const anim = loop(dt => {
    const d = Math.min(dt, 0.05);
    if (st.mode === 'coil') stepBench(d);
    else if (st.g.playing) st.g.th += TAU * st.g.f / SLOW * d;
    drawBench(); drawGraph();
    if ((frame++ % 6) === 0) { fillReadouts(); syncButtons(); }
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  function fitAll() {
    P = palette(root);
    const cw = Math.round(bv.el.clientWidth || root.clientWidth || MW);
    const w = clamp(cw > 0 ? cw : MW, 340, MW);
    const hb = st.mode === 'coil' ? benchHeight(w) : genLayout(w).H;
    bv.setLogical(w, hb);
    const sm = w < NARROW;
    gv.setLogical(w, st.mode === 'coil' ? (sm ? HG_SM : HG)
                   : st.mode === 'gen' ? (sm ? 340 : 300) : (sm ? HG_SM : HG));
    bv.fit(); gv.fit();
    /* the magnet must stay on the bench if the bench got narrower */
    const b = bounds();
    const nx = clamp(st.x, b.x0, b.x1);
    if (nx !== st.x) {
      /* not a motion: the bench got narrower, so the magnet is put back on it */
      st.x = nx; st.lam = lamAt(st.x, st.y);
    }
    st.tx = st.x;
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

  setRanges();
  resetBench();
  setMode('coil');

  /* ------------------------------------------------------- test surface */

  return {
    destroy,
    _set: q => {
      const m = q.mode;
      const g = q.g; delete q.g;
      Object.assign(st, q);
      if (g) Object.assign(st.g, g);
      syncSliders(); setRanges();
      if ('x' in q || 'y' in q) { st.tx = st.x; st.ty = st.y; }
      resetBench();
      if (m) setMode(m); else render();
    },
    /** drive the magnet along straight legs [x, y, seconds], by the same code */
    _path: (legs, fdt = 1 / 240) => {
      const rows = [];
      for (const [x, y, secs] of legs) {
        const n = Math.max(1, Math.round(secs / fdt));
        const x0 = st.x, y0 = st.y;
        for (let i = 1; i <= n; i++) {
          const wx = x0 + (x - x0) * i / n, wy = y0 + (y - y0) * i / n;
          let nx = wx, ny = wy;
          if (!fits(nx, ny)) {
            if (fits(nx, st.y)) ny = st.y;
            else if (fits(st.x, ny)) nx = st.x;
            else { nx = st.x; ny = st.y; }
          }
          moveTo(nx, ny, fdt);
          rows.push({ t: st.t, x: st.x, y: st.y, lam: st.lam, emf: st.emf,
                      I: st.I, Fx: st.Fx, Fy: st.Fy, W: st.W, Q: st.Q,
                      nA: st.nA.th, nV: st.nV.th });
        }
        pushHist();
      }
      render();
      return rows;
    },
    /** the hand: set a target and let the panel's own dynamics chase it */
    _hand: (tx, ty, secs, fdt = 1 / 60) => {
      st.drag = true; st.tx = tx; st.ty = ty;
      const rows = [];
      const n = Math.round(secs / fdt);
      for (let i = 0; i < n; i++) {
        stepBench(fdt);
        rows.push({ t: st.t, x: st.x, y: st.y, lam: st.lam, emf: st.emf, I: st.I });
      }
      st.drag = false;
      render();
      return rows;
    },
    _state: () => ({
      mode: st.mode, Br: st.Br, turns: st.turns, Rc: st.Rc, flip: st.flip,
      x: st.x, y: st.y, lam: st.lam, emf: st.emf, I: st.I, Fx: st.Fx, Fy: st.Fy,
      W: st.W, Q: st.Q, t: st.t, FSV: voltFS(), FSA: ampFS(),
      nA: st.nA.th, nV: st.nV.th, canFlip: canFlip(), lines: st.lines,
      g: { ...st.g },
    }),
    _lam: (x, y) => lamAt(x, y),
    _fits: (x, y) => fits(x, y),
    _flip: () => { bFlip.el.click(); return st.flip; },
    _gen: (thetas, f) => thetas.map(th => ({ th, emf: gEmf(th, f ?? st.g.f),
                                             flux: gFlux(th) })),
    _genMeasure: f => gMeasure(f),
    _genStep: dth => { st.g.th += dth; render(); return st.g.th; },
    _dots: () => DOTS.map(q => ({ ...q })),
    _circuit: () => { const c = circuit(GB()); return { series: c.series }; },
    _setLines: on => { st.lines = !!on; render(); return fieldLines().marks.length; },
    _texts: () => TEXTS.map(q => ({ ...q })),
    _boxes: () => BOXES.map(q => ({ ...q })),
    _geomB: () => { const g = GB(); return { W: g.W, H: g.H, sm: g.sm, s: g.s,
                                            xcp: g.xcp, ymid: g.ymid }; },
    _bounds: () => bounds(),
    _consts: () => ({ MW, NARROW, MU0, MAG_A, MAG_L, COIL_R, COIL_L, WIRE,
                      COIL_X, COIL_Y, Y_MAX, SLOW, T_HAND, V_HAND,
                      BR_LO, BR_HI, N_LO, N_HI, R_LO, R_HI,
                      GF_LO, GF_HI, GN_LO, GN_HI, GB_LO, GB_HI, GA_LO, GA_HI,
                      GR_LO, GR_HI }),
  };
}
