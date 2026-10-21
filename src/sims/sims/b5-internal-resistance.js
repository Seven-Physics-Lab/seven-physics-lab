/* ============================================================================
 * B5-1  Cells, Internal Resistance and the Potential Divider
 * IB Physics B.5 Current and circuits
 *
 * A cell is not a source of constant voltage. It is a source of constant emf
 * with a resistance inside it, and the difference between those two sentences
 * is most of this topic: why a torch dims as the battery ages, why a car's
 * headlights dip when the starter turns, why a potential divider sags the
 * moment you connect anything to it, and why the maximum power you can draw
 * from a supply comes with exactly half the energy thrown away as heat inside.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does NOT contain I = ε/(R + r). It does not contain R = R₁ + R₂,
 * or 1/R = 1/R₁ + 1/R₂, or V_out = εR₂/(R₁ + R₂). None of the results of this
 * topic are written down anywhere in it.
 *
 * What it contains is Kirchhoff's two laws, as a matrix:
 *
 *     at every node        Σ I = 0            (charge does not pile up)
 *     across every branch  I = ΔV / R         (Ohm)
 *     at every source      ΔV = ε             (the emf is what it is)
 *
 * assembled by modified nodal analysis and solved by Gaussian elimination.
 * Every arrangement below — one resistor, two in series, two in parallel, a
 * loaded potential divider — is the SAME solver given a different netlist, so
 * the combination rules are not assumptions in the model, they are things that
 * come out of it. The readouts print them beside what the solver found, and
 * the verification script closes both of Kirchhoff's laws in Python from the
 * node voltages the solver returns.
 *
 * WHAT THE PICTURE IS FOR
 *
 * A circuit diagram is not a picture of anything. The wires have no length,
 * the components no size, and moving one across the panel changes nothing. So
 * only two things on this panel carry a quantity, and both are exact:
 *
 *   the bar         the emf, divided into the volts you get out and the volts
 *                   lost inside the cell. It is drawn to scale, so at R = r it
 *                   is visibly half and half.
 *   the dots        spaced evenly along the wires and moving at a speed
 *                   proportional to the current, so the RATE at which they
 *                   pass any point is proportional to the current. In the
 *                   parallel arrangement the two branches run at different
 *                   speeds, and the rates add to the rate in the main wire.
 *                   They are not electrons, and their spacing means nothing.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, ctext, callout, croundRect,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;
const HC = 372, HC_SM = 600;      // the circuit panel
const HG = 330;                   // the graph panel
const NARROW = 760;

const E_MIN = 0.5, E_MAX = 12;    // volts
const R_MIN = 0.05, R_MAX = 6;    // ohms, the internal resistance
const L_MIN = 0.2, L_MAX = 60;    // ohms, a load
const T_MIN = 1, T_MAX = 200;     // ohms, the divider track

/* the loads the "work through eight" button steps over */
const LOADS = [0.5, 1, 2, 3, 5, 8, 14, 30];

const MODES = {
  single:   { name: 'one resistor' },
  series:   { name: 'two in series' },
  parallel: { name: 'two in parallel' },
  divider:  { name: 'a potential divider' },
};

/**
 * Modified nodal analysis.
 *
 * Unknowns are the voltage at every node but the reference (node 0), followed
 * by the current through every ideal voltage source. Resistors stamp their
 * conductance into the node block; sources stamp a 1 and a −1 into the border
 * and set their own row to the emf. The result is the smallest honest
 * statement of Kirchhoff's laws a computer can be handed:
 *
 *     [ G  B ] [ v ]   [ 0 ]
 *     [ Bᵀ 0 ] [ i ] = [ e ]
 *
 * Solved by Gaussian elimination with partial pivoting. Nothing here knows
 * anything about the circuit it is being given.
 *
 * @param parts  [{ type:'R'|'V', a, b, value }] with node 0 as the reference
 * @param nNodes how many nodes there are, counting node 0
 * @returns { v: node voltages (v[0] = 0), i: source currents }
 */
export function solveNetwork(parts, nNodes) {
  const srcs = parts.filter(c => c.type === 'V');
  const n = nNodes - 1, m = srcs.length, N = n + m;
  const A = [];
  for (let i = 0; i < N; i++) A.push(new Float64Array(N + 1));

  for (const c of parts) {
    if (c.type !== 'R') continue;
    const g = 1 / c.value, a = c.a - 1, b = c.b - 1;
    if (a >= 0) A[a][a] += g;
    if (b >= 0) A[b][b] += g;
    if (a >= 0 && b >= 0) { A[a][b] -= g; A[b][a] -= g; }
  }
  srcs.forEach((c, k) => {
    const row = n + k, a = c.a - 1, b = c.b - 1;
    if (a >= 0) { A[a][row] += 1; A[row][a] += 1; }
    if (b >= 0) { A[b][row] -= 1; A[row][b] -= 1; }
    A[row][N] += c.value;
  });

  for (let col = 0; col < N; col++) {
    let piv = col;
    for (let r = col + 1; r < N; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-300) continue;
    const t = A[col]; A[col] = A[piv]; A[piv] = t;
    for (let r = 0; r < N; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let k = col; k <= N; k++) A[r][k] -= f * A[col][k];
    }
  }
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = A[i][N] / A[i][i];

  const v = new Float64Array(nNodes);
  for (let i = 0; i < n; i++) v[i + 1] = x[i];
  /* the source current is defined out of the + terminal, which is the
   * opposite sign to the convention MNA stamps, so it is negated here */
  const iSrc = Array.from({ length: m }, (_, k) => -x[n + k]);
  return { v, i: iSrc };
}

/** the current from node a to node b through a resistor, from the solution */
export const branchI = (sol, c) => (sol.v[c.a] - sol.v[c.b]) / c.value;

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'b5-internal-resistance',
    title: 'Cells, internal resistance and the potential divider',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    mode: 'single',
    emf: 6,
    r: 1.2,
    R1: 3,          // the load, or the first of a pair
    R2: 6,          // the second of a pair
    track: 100,     // the divider's track, in ohms
    frac: 0.4,      // where the slider sits on it
    load: 100,      // what is hung across the output
    loaded: true,   // is anything hung across it at all
    graph: 'vi',    // 'vi' or 'power'
    t: 0, playing: true, ann: false,
    data: [],       // recorded [{R, I, V}]
  };

  /* ---------------------------------------------------------- the model */

  /**
   * The netlist for the arrangement now set up. Node 0 is the cell's negative
   * terminal, node 1 its positive plate, node 2 the terminal you can actually
   * reach — the difference between 1 and 2 is the internal resistance, which
   * is exactly what makes this topic what it is.
   */
  function netlist(over = {}) {
    const s = { ...st, ...over };
    const parts = [{ type: 'V', a: 1, b: 0, value: s.emf }];
    /* with a perfect cell there is nothing between the plate and the terminal,
     * so the two nodes are the same node and no resistor is stamped at all */
    const T = s.r > 1e-12 ? 2 : 1;
    let nodes = T === 2 ? 3 : 2;
    if (T === 2) parts.push({ type: 'R', a: 1, b: 2, value: s.r, tag: 'r' });

    if (s.mode === 'single') {
      parts.push({ type: 'R', a: T, b: 0, value: s.R1, tag: 'R1' });
    } else if (s.mode === 'series') {
      parts.push({ type: 'R', a: T, b: nodes, value: s.R1, tag: 'R1' });
      parts.push({ type: 'R', a: nodes, b: 0, value: s.R2, tag: 'R2' });
      nodes += 1;
    } else if (s.mode === 'parallel') {
      parts.push({ type: 'R', a: T, b: 0, value: s.R1, tag: 'R1' });
      parts.push({ type: 'R', a: T, b: 0, value: s.R2, tag: 'R2' });
    } else {
      const up = Math.max((1 - s.frac) * s.track, 1e-9);
      const dn = Math.max(s.frac * s.track, 1e-9);
      parts.push({ type: 'R', a: T, b: nodes, value: up, tag: 'up' });
      parts.push({ type: 'R', a: nodes, b: 0, value: dn, tag: 'dn' });
      if (s.loaded) parts.push({ type: 'R', a: nodes, b: 0, value: s.load, tag: 'RL' });
      nodes += 1;
    }
    return { parts, nodes, T, tap: s.mode === 'divider' ? (T === 2 ? 3 : 2) : null };
  }

  /** everything about the circuit now drawn, solved rather than quoted */
  function solve(over = {}) {
    const s = { ...st, ...over };
    const net = netlist(over);
    const sol = solveNetwork(net.parts, net.nodes);
    const I = sol.i[0];                         // out of the cell's + terminal
    const term = sol.v[net.T];                  // the terminal pd
    const cur = {};
    for (const c of net.parts) if (c.type === 'R') cur[c.tag] = branchI(sol, c);
    const Pout = I * term, Pin = s.emf * I, Plost = Pin - Pout;
    return {
      ...net, sol, I, term, cur,
      lost: s.emf - term,
      Rext: I !== 0 ? term / I : Infinity,
      Pout, Pin, Plost,
      eff: Pin !== 0 ? Pout / Pin : 0,
      vTap: net.tap === null ? null : sol.v[net.tap],
    };
  }

  /* the external resistance, without asking the solver: used only to LABEL
   * the axis of the power graph, never to compute a current */
  const nominalR = (over = {}) => {
    const s = { ...st, ...over };
    if (s.mode === 'single') return s.R1;
    if (s.mode === 'series') return s.R1 + s.R2;
    if (s.mode === 'parallel') return 1 / (1 / s.R1 + 1 / s.R2);
    const up = (1 - s.frac) * s.track, dn = s.frac * s.track;
    return up + (s.loaded ? 1 / (1 / dn + 1 / s.load) : dn);
  };

  /* ---------------------------------------------------------- surfaces */

  const cv = surface(MW, HC, {
    label: 'The circuit, and the emf divided into the volts you get and the volts lost inside',
  });
  const gv = surface(MW, HG, { label: 'What the experiment measures' });

  const GC = () => {
    const W = cv.w, sm = W < NARROW, H = sm ? HC_SM : HC;
    return sm
      ? { W, H, sm, xL: 76, xR: Math.round(W * (st.mode === 'single' ? 0.66
                                               : st.mode === 'divider' ? 0.40 : 0.48)),
          yT: 78, yB: 300,
          bx: 16, by: 344, bw: W - 32, bh: H - 360 }
      : { W, H, sm, xL: 126,
          xR: Math.round(W * (st.mode === 'single' ? 0.44
                            : st.mode === 'divider' ? 0.27 : 0.34)),
          yT: 84, yB: 292,
          bx: Math.round(W * 0.62), by: 52, bw: Math.round(W * 0.35), bh: H - 100 };
  };
  const GG = () => {
    const W = gv.w, sm = W < NARROW;
    return { W, sm, x0: sm ? 58 : 84, x1: W - (sm ? 20 : 44), yT: 40, yB: HG - 62,
             ax: HG - 54 };
  };

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'ce', label: 'The cell: its emf, and the resistance inside it' },
    { key: 'ex', label: 'What is across it, as the solver found it' },
    { key: 'cb', label: 'And what the combination rule says it should be' },
    { key: 'cu', label: 'Current out of the cell' },
    { key: 'tv', label: 'Terminal pd <i>V</i>, and the volts lost inside' },
    { key: 'ki', label: 'The audit: Kirchhoff’s two laws, as residuals' },
    { key: 'po', label: 'Power delivered to the outside, <i>VI</i>' },
    { key: 'pl', label: 'Power wasted inside as heat, <i>I</i>²<i>r</i>, and the efficiency' },
    { key: 'mx', label: 'The most power you could ever draw, and what it costs' },
    { key: 'sc', label: 'Short circuit: what the cell can give at most' },
    { key: 'gr', label: 'From the graph: gradient → <i>r</i>, intercept → emf' },
    { key: 'dv', label: 'The divider: what it gives loaded, and unloaded' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sE = slider({ label: 'ε', min: E_MIN, max: E_MAX, step: 0.1, value: st.emf,
    format: v => `${v.toFixed(1)} V`, onInput: v => { st.emf = v; render(); } });
  const sR = slider({ label: '<i>r</i>', min: 0, max: R_MAX, step: 0.05, value: st.r,
    format: v => v < 1e-9 ? 'a perfect cell' : `${v.toFixed(2)} Ω`,
    onInput: v => { st.r = v; render(); } });
  const s1 = slider({ label: '<i>R</i>₁', min: L_MIN, max: L_MAX, step: 0.1, value: st.R1,
    format: v => `${v.toFixed(1)} Ω`, onInput: v => { st.R1 = v; render(); } });
  const s2 = slider({ label: '<i>R</i>₂', min: L_MIN, max: L_MAX, step: 0.1, value: st.R2,
    format: v => `${v.toFixed(1)} Ω`, onInput: v => { st.R2 = v; render(); } });
  const sT = slider({ label: 'track', word: true, min: T_MIN, max: T_MAX, step: 1,
    value: st.track, format: v => `${v.toFixed(0)} Ω`,
    onInput: v => { st.track = v; render(); } });
  const sFr = slider({ label: 'slider', word: true, min: 0, max: 1, step: 0.01,
    value: st.frac, format: v => `${(v * 100).toFixed(0)}% up from the bottom`,
    onInput: v => { st.frac = v; render(); } });
  const sLd = slider({ label: '<i>R</i><sub>L</sub>', min: 1, max: 2000, step: 1,
    value: st.load, format: v => `${v.toFixed(0)} Ω`,
    onInput: v => { st.load = v; render(); } });

  const bMode = Object.keys(MODES).map(k => button({
    label: MODES[k].name, pressed: k === st.mode, onClick: () => setMode(k),
  }));

  function setMode(k) {
    st.mode = k;
    bMode.forEach((b, i) => b.setPressed(Object.keys(MODES)[i] === k));
    s1.node.hidden = !(k === 'single' || k === 'series' || k === 'parallel');
    s2.node.hidden = !(k === 'series' || k === 'parallel');
    sT.node.hidden = k !== 'divider';
    sFr.node.hidden = k !== 'divider';
    sLd.node.hidden = k !== 'divider';
    bLoad.node.hidden = k !== 'divider';
    s1.node.querySelector('label').innerHTML = k === 'single' ? '<i>R</i>' : '<i>R</i>₁';
    render();
  }

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bMatch = button({ label: 'Match the load to the cell, R = r', onClick: () => {
    if (st.mode === 'single') { st.R1 = clamp(st.r, L_MIN, L_MAX); s1.set(st.R1); }
    else { setMode('single'); st.R1 = clamp(st.r, L_MIN, L_MAX); s1.set(st.R1); }
    render();
  } });
  const bLoad = button({ label: 'Connect a load to the output', pressed: true,
    onClick: b => {
      st.loaded = !st.loaded;
      b.textContent = st.loaded ? 'Take the load off again' : 'Connect a load to the output';
      b.setAttribute('aria-pressed', String(st.loaded));
      render();
    } });
  const bGraph = button({ label: 'Power instead', pressed: false, onClick: b => {
    st.graph = st.graph === 'vi' ? 'power' : 'vi';
    b.textContent = st.graph === 'vi' ? 'Power instead' : 'Back to V against I';
    b.setAttribute('aria-pressed', String(st.graph === 'power'));
    render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  const bRec = button({ label: 'Record this reading', onClick: () => {
    record(nominalR(), solve());
  } });
  const bAll = button({ label: 'Work through eight loads', onClick: () => {
    st.data = [];
    if (st.mode !== 'single') setMode('single');
    for (const R of LOADS) {
      const s = solve({ R1: R, mode: 'single' });
      st.data.push({ R, I: s.I, V: s.term });
    }
    st.R1 = LOADS[LOADS.length - 1]; s1.set(st.R1);
    render();
  } });
  const bClr = button({ label: 'Clear the readings', onClick: () => {
    st.data = []; render();
  } });

  function record(R, s) {
    st.data = st.data.filter(d => Math.abs(d.R - R) > 1e-9)
      .concat([{ R, I: s.I, V: s.term }])
      .sort((a, b) => a.I - b.I);
    render();
  }

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Cells, Internal Resistance and the Potential Divider',
            'nothing here uses <i>I</i> = ε/(<i>R</i>+<i>r</i>), or the series and '
            + 'parallel rules — Kirchhoff’s laws are solved, and the rules come out'),
    controls([el('div', { class: 'ibs-btns' }, bMode.map(b => b.node))],
             { label: 'across the cell:' }),
    panelBox('The circuit — and the emf split into what you get and what you lose', cv.el),
    panelBox('What the experiment measures', gv.el),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bGraph.node, bMatch.node, bLoad.node, bAnn.node])]),
    controls([el('div', { class: 'ibs-btns' }, [bRec.node, bAll.node, bClr.node])],
             { label: 'readings:' }),
    controls([sE.node, sR.node, s1.node, s2.node, sT.node, sFr.node, sLd.node]),
    out.node,
    note('<b>A cell has a resistance inside it.</b> The chemistry sets the <b>emf</b>, the '
      + 'energy given to each coulomb, and that never changes. But the current has to get '
      + 'through the cell as well as round the circuit, and the cell’s own resistance '
      + 'takes its share: <i>V</i> = ε − <i>Ir</i>. The bar on the panel is that '
      + 'sentence drawn to scale. Draw a big current and the teal part shrinks — which '
      + 'is why a torch dims as its battery ages (<i>r</i> rises) and why the headlights dip '
      + 'when the starter motor turns. <b>The experiment</b> is the graph: plot the terminal '
      + 'pd against the current and you get a straight line whose <b>intercept is the emf</b> '
      + '— the voltage you would get if you drew no current at all — and whose '
      + '<b>gradient is −<i>r</i></b>. Press <b>work through eight loads</b> and read '
      + 'them both off. <b>Power.</b> Switch the graph over and put <i>R</i> = <i>r</i>: the '
      + 'power delivered outside is the largest it can ever be, and at exactly that point '
      + 'half of everything the cell produces is being wasted heating the cell itself. '
      + 'Maximum power and good efficiency are opposite requests, which is why the grid is '
      + 'run nowhere near matched. <b>And the divider.</b> Two resistors share the supply in '
      + 'proportion to their resistance, so a tap between them gives a fraction of it. Then '
      + 'connect something across the output and watch the reading fall: the load is in '
      + 'parallel with the lower resistor, so it lowers it, and the divider no longer divides '
      + 'where you set it. Make the track resistance small compared with the load and the sag '
      + 'goes away — at the cost of a bigger current wasted in the track itself.'));

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);
  const ohms = v => v >= 1000 ? `${fmt(v / 1000, 2)} kΩ` : `${fmt(v, v < 10 ? 2 : 1)} Ω`;
  const amps = a => Math.abs(a) < 0.1 ? `${fmt(a * 1000, 1)} mA` : `${fmt(a, 3)} A`;
  const watts = w => Math.abs(w) < 0.1 ? `${fmt(w * 1000, 1)} mW` : `${fmt(w, 3)} W`;

  /* the wires, as polylines each carrying one branch current, and the
   * components sitting on them — built fresh each frame so the dots and the
   * drawing can never disagree about where the circuit is */
  let WIRES = [], COMPS = [];

  function buildCircuit(g, s) {
    const { xL, xR, yT, yB } = g;
    const W = [], C = [];
    const wire = (pts, I, id) => W.push({ pts, I, id });
    const comp = (o) => C.push(o);

    /* the cell, on the left rail */
    const cyc = (yT + yB) / 2;
    comp({ kind: 'cell', x: xL, y: cyc, I: s.I });
    if (s.T === 2) comp({ kind: 'res', x: xL, y: cyc + 56, vertical: true,
                          label: 'r', value: st.r, inside: true });

    /* Every polyline below is declared in the direction the conventional
     * current actually runs, because the dots march along the point list in
     * array order: out of the long plate (+) at the top of the cell, up the
     * left rail, left to right along the top, down through whatever is on the
     * right, right to left along the bottom, and back up into the short
     * plate (−). One circulation, no segment against it. */
    const rTop = s.T === 2 ? cyc + 82 : cyc + 26;
    wire([[xL, cyc - 26], [xL, yT]], s.I, 'up');
    wire([[xL, yB], [xL, rTop]], s.I, 'dn');
    wire([[xL, yT], [xR, yT]], s.I, 'top');
    wire([[xR, yB], [xL, yB]], s.I, 'bot');

    comp({ kind: 'meter', x: (xL + xR) / 2, y: yT, letter: 'A',
           read: amps(Math.abs(s.I)) });

    if (st.mode === 'single') {
      comp({ kind: 'res', x: xR, y: (yT + yB) / 2, vertical: true,
             label: 'R', value: st.R1, I: s.cur.R1 });
      wire([[xR, yT], [xR, (yT + yB) / 2 - 26]], s.I, 'r1a');
      wire([[xR, (yT + yB) / 2 + 26], [xR, yB]], s.I, 'r1b');
    } else if (st.mode === 'series') {
      const y1 = yT + (yB - yT) * 0.30, y2 = yT + (yB - yT) * 0.70;
      comp({ kind: 'res', x: xR, y: y1, vertical: true, label: 'R₁', value: st.R1 });
      comp({ kind: 'res', x: xR, y: y2, vertical: true, label: 'R₂', value: st.R2 });
      wire([[xR, yT], [xR, y1 - 26]], s.I, 'sa');
      wire([[xR, y1 + 26], [xR, y2 - 26]], s.I, 'sb');
      wire([[xR, y2 + 26], [xR, yB]], s.I, 'sc');
    } else if (st.mode === 'parallel') {
      const xa = xR, xb = xR + (g.sm ? 78 : 104), ym = (yT + yB) / 2;
      comp({ kind: 'res', x: xa, y: ym, vertical: true, label: 'R₁', value: st.R1,
             I: s.cur.R1 });
      comp({ kind: 'res', x: xb, y: ym, vertical: true, label: 'R₂', value: st.R2,
             I: s.cur.R2 });
      /* the link across the top carries only what branch 2 takes — the rest
       * of the main current has already turned down branch 1 at that node */
      wire([[xa, yT], [xb, yT]], s.cur.R2, 'ptop');
      wire([[xb, yB], [xa, yB]], s.cur.R2, 'pbot');
      wire([[xa, yT], [xa, ym - 26]], s.cur.R1, 'pa1');
      wire([[xa, ym + 26], [xa, yB]], s.cur.R1, 'pa2');
      wire([[xb, yT], [xb, ym - 26]], s.cur.R2, 'pb1');
      wire([[xb, ym + 26], [xb, yB]], s.cur.R2, 'pb2');
    } else {
      const y1 = yT + (yB - yT) * 0.28, y2 = yT + (yB - yT) * 0.72;
      const yTap = (y1 + y2) / 2;
      const up = (1 - st.frac) * st.track, dn = st.frac * st.track;
      comp({ kind: 'res', x: xR, y: y1, vertical: true, value: up, left: true,
             label: g.sm ? 'up' : 'upper' });
      comp({ kind: 'res', x: xR, y: y2, vertical: true, value: dn, left: true,
             label: g.sm ? 'low' : 'lower' });
      wire([[xR, yT], [xR, y1 - 26]], s.I, 'da');
      if (st.loaded) {
        /* with a load on the tap the track between the two resistors has to be
         * cut there: above the tap it carries the whole current, below it only
         * what the lower resistor takes, and the difference is what leaves
         * through the load */
        wire([[xR, y1 + 26], [xR, yTap]], s.cur.dn + s.cur.RL, 'db');
        wire([[xR, yTap], [xR, y2 - 26]], s.cur.dn, 'db2');
      } else {
        wire([[xR, y1 + 26], [xR, y2 - 26]], s.cur.dn, 'db');
      }
      wire([[xR, y2 + 26], [xR, yB]], s.cur.dn, 'dc');
      if (st.loaded) {
        const xl = xR + (g.sm ? 96 : 132);
        comp({ kind: 'res', x: xl, y: y2, vertical: true, label: 'Rʟ', value: st.load,
               I: s.cur.RL, left: true });
        wire([[xR, yTap], [xl, yTap]], s.cur.RL, 'dl1');
        wire([[xl, yTap], [xl, y2 - 26]], s.cur.RL, 'dl2');
        wire([[xl, y2 + 26], [xl, yB]], s.cur.RL, 'dl3');
        wire([[xl, yB], [xR, yB]], s.cur.RL, 'dl4');
      }
      comp({ kind: 'tap', x: xR, y: yTap });
      if (g.sm) {
        /* at this width there is no room for another meter, so the tap is
         * simply labelled with what a meter across it would read */
        comp({ kind: 'note', x: xR + (st.loaded ? 96 : 0) + 26, y: yTap - 10,
               text: `V\u2092\u1d64\u209c = ${fmt(s.vTap, 3)} V` });
      } else {
        comp({ kind: 'meter', x: xR + (st.loaded ? 132 : 0) + 88,
               y: (yTap + yB) / 2, letter: 'V',
               read: `${fmt(s.vTap, 3)} V`, small: true,
               tie: [[xR, yTap], [xR, yB]], out: 'V\u2092\u1d64\u209c' });
      }
    }

    /* the voltmeter across the terminals */
    const vx = xL - (g.sm ? 52 : 62);
    comp({ kind: 'meter', x: vx, y: (yT + yB) / 2, letter: 'V',
           read: `${fmt(s.term, 3)} V`, tie: [[xL, yT], [xL, yB]], leads: [yT, yB] });

    WIRES = W; COMPS = C;
  }

  function drawWire(ctx, pts) {
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
  }

  /** evenly spaced dots, moving at a speed proportional to the current */
  function drawDots(ctx, w, phase) {
    if (!(Math.abs(w.I) > 1e-9)) return;
    const segs = [];
    let total = 0;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a, b, len, at: total });
      total += len;
    }
    if (total < 1) return;
    const SPACING = 26;
    const off = ((phase * w.I * 46) % SPACING + SPACING) % SPACING;
    ctx.fillStyle = P.accent;
    for (let d = off; d < total; d += SPACING) {
      const sg = segs.find(s => d >= s.at && d <= s.at + s.len) || segs[segs.length - 1];
      const u = (d - sg.at) / (sg.len || 1);
      ctx.beginPath();
      ctx.arc(sg.a[0] + (sg.b[0] - sg.a[0]) * u, sg.a[1] + (sg.b[1] - sg.a[1]) * u,
              3, 0, TAU);
      ctx.fill();
    }
  }

  function drawComp(ctx, c, g) {
    if (c.kind === 'cell') {
      const long = 17, short = 9;
      ctx.strokeStyle = P.text; ctx.lineCap = 'butt';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(c.x - long, c.y - 7); ctx.lineTo(c.x + long, c.y - 7);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(c.x - short, c.y + 7); ctx.lineTo(c.x + short, c.y + 7);
      ctx.stroke();
      ctext(ctx, `ε ${fmt(st.emf, 2)} V`, c.x + 34, c.y - (GC().sm ? 12 : -3),
        { font: `600 12px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
      return;
    }
    if (c.kind === 'note') {
      ctext(ctx, c.text, c.x, c.y,
        { font: `600 11.5px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
      return;
    }
    if (c.kind === 'note') {
      ctext(ctx, c.text, c.x, c.y,
        { font: `600 11.5px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
      return;
    }
    if (c.kind === 'tap') {
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, TAU); ctx.fill();
      return;
    }
    if (c.kind === 'meter') {
      const R = c.small ? 15 : 18;
      if (c.tie) {
        ctx.save();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.2;
        for (const t of c.tie) {
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(t[0], t[1]); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = P.bg;
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      ctx.stroke();
      ctext(ctx, c.letter, c.x, c.y + 5,
        { font: `700 14px ${P.font}`, color: P.text, align: 'center' });
      ctext(ctx, c.read, c.x, c.y + R + 15,
        { font: `600 12px ${P.font}`, color: P.accent, align: 'center',
          halo: P.bg, haloWidth: 4 });
      if (c.out) {
        ctext(ctx, c.out, c.x, c.y - R - 8,
          { font: `600 11.5px ${P.font}`, color: P.muted, align: 'center',
            halo: P.bg, haloWidth: 4 });
      }
      return;
    }
    /* a resistor: the rectangle, the way it is drawn on a circuit diagram */
    const hw = 11, hh = 26;
    ctx.fillStyle = c.inside ? P.soft : P.bg;
    ctx.strokeStyle = c.inside ? P.muted : P.text;
    ctx.lineWidth = c.inside ? 1.6 : 2.2;
    croundRect(ctx, c.x - hw, c.y - hh, 2 * hw, 2 * hh, 3);
    ctx.fill(); ctx.stroke();
    const sm = GC().sm;
    const lab = `${c.label}${sm ? ' ' : ' = '}${ohms(c.value)}`;
    const lx = c.left ? c.x - hw - 8 : c.x + (c.labX ?? hw + 8);
    const al = c.left ? 'right' : 'left';
    if (sm && c.inside) {
      ctext(ctx, lab, c.x, c.y + 40,
        { font: `600 11px ${P.font}`, color: P.muted, align: 'center',
          halo: P.bg, haloWidth: 4 });
      return;
    }
    ctext(ctx, lab, lx, c.y - 2,
      { font: `600 ${sm ? 11 : 12}px ${P.font}`, color: c.inside ? P.muted : P.text,
        align: al, halo: P.bg, haloWidth: 4 });
    if (c.I !== undefined && Math.abs(c.I) > 1e-9) {
      ctext(ctx, amps(Math.abs(c.I)), lx, c.y + 14,
        { font: `600 ${sm ? 10.5 : 11.5}px ${P.font}`, color: P.accent, align: al,
          halo: P.bg, haloWidth: 4 });
    }
  }

  /** the emf bar: the one quantity on this panel drawn to scale */
  function drawBar(ctx, g, s) {
    const { bx, by, bw, bh } = g;
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    ctext(ctx, 'where the emf goes — to scale, in volts', bx + 10, by + 18,
      { font: `600 11.5px ${P.font}`, color: P.muted });

    const top = by + 34, h = bh - 66;
    const frac = st.emf > 0 ? clamp(s.term / st.emf, 0, 1) : 0;
    const w = Math.min(bw - 120, 78);
    const x = bx + 26;

    ctx.fillStyle = P.accent; ctx.globalAlpha = 0.85;
    ctx.fillRect(x, top + h * (1 - frac), w, h * frac);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = P.text;
    ctx.fillRect(x, top, w, h * (1 - frac)); ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 0.5, top + 0.5, w, h);
    ctx.beginPath();
    ctx.moveTo(x, top + h * (1 - frac)); ctx.lineTo(x + w, top + h * (1 - frac));
    ctx.stroke();

    const lx = x + w + 14;
    ctext(ctx, `lost inside:  ${fmt(s.lost, 3)} V`, lx, top + h * (1 - frac) / 2 - 2,
      { font: `600 12px ${P.font}`, color: P.text });
    ctext(ctx, `= I r = ${amps(Math.abs(s.I))} × ${ohms(st.r)}`,
      lx, top + h * (1 - frac) / 2 + 15,
      { font: `500 11px ${P.font}`, color: P.muted });
    ctext(ctx, `you get:  ${fmt(s.term, 3)} V`, lx, top + h * (1 - frac / 2) - 2,
      { font: `600 12px ${P.font}`, color: P.accent });
    ctext(ctx, `= ${fmt(100 * frac, 1)}% of the emf`, lx, top + h * (1 - frac / 2) + 15,
      { font: `500 11px ${P.font}`, color: P.muted });

    /* the scale down the side, in volts */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    const stepV = st.emf > 8 ? 2 : st.emf > 3 ? 1 : 0.5;
    ctx.font = `500 10px ${P.font}`;
    for (let v = 0; v <= st.emf + 1e-9; v += stepV) {
      const y = top + h * (1 - v / st.emf);
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y); ctx.stroke();
      ctext(ctx, fmt(v, stepV < 1 ? 1 : 0), x - 9, y + 4,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    }
    ctext(ctx, `ε = ${fmt(st.emf, 2)} V in total`, bx + 10, by + bh - 12,
      { font: `500 11px ${P.font}`, color: P.muted });
  }

  function drawCircuit() {
    const ctx = cv.ctx, g = GC(), W = g.W, H = g.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    const s = solve();
    buildCircuit(g, s);

    /* the dashed box that says "this is all inside the cell" */
    if (s.T === 2) {
      const cyc = (g.yT + g.yB) / 2;
      ctx.save();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1.2;
      croundRect(ctx, g.xL - 27, cyc - 32, 54, 124, 7);
      ctx.stroke(); ctx.restore();
      ctext(ctx, g.sm ? 'the cell' : 'all of this is inside the cell',
        g.xL + (g.sm ? -34 : 34), cyc + (g.sm ? 74 : 92),
        { font: `500 11px ${P.font}`, color: P.muted,
          align: g.sm ? 'right' : 'left', halo: P.bg, haloWidth: 4 });
    }

    for (const w of WIRES) drawWire(ctx, w.pts);
    for (const w of WIRES) drawDots(ctx, w, st.t);
    for (const c of COMPS) drawComp(ctx, c, g);

    ctext(ctx,
      g.sm ? 'a circuit diagram has no scale — only the bar and the dot rate do'
           : 'A circuit diagram is not a picture: wire lengths and component sizes mean '
             + 'nothing. The bar is to scale, and the dots pass any point at a rate '
             + 'proportional to the current.',
      10, 20, { font: `500 11px ${P.font}`, color: P.muted });

    drawBar(ctx, g, s);

    if (st.ann) {
      callout(ctx, ['The emf never changes. What changes is how',
                    'much of it you get: the rest is used pushing',
                    'the current through the cell itself.'],
        g.sm ? 12 : 14, g.sm ? 214 : 330, g.xL, (g.yT + g.yB) / 2 + 40,
        { palette: P });
    }
  }

  /* ---------------------------------------------------------- the graph */

  const viMap = g => {
    const Imax = Math.max(1e-3, st.emf / Math.max(st.r, 0.25)) * 1.06;
    const Vmax = st.emf * 1.12;
    return {
      Imax, Vmax,
      X: i => g.x0 + i / Imax * (g.x1 - g.x0),
      Y: v => g.yB - v / Vmax * (g.yB - g.yT),
    };
  };
  const powMap = g => {
    const lo = Math.log10(L_MIN), hi = Math.log10(L_MAX);
    const Pmax = st.emf * st.emf / (4 * Math.max(st.r, 0.05)) * 1.12;
    return {
      lo, hi, Pmax,
      X: lr => g.x0 + (lr - lo) / (hi - lo) * (g.x1 - g.x0),
      Y: p => g.yB - p / Pmax * (g.yB - g.yT),
    };
  };

  function fitLine(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-18) return null;
    const grad = (n * sxy - sx * sy) / d;
    return { grad, inter: (sy - grad * sx) / n, n };
  }

  function drawVI(ctx, g) {
    const m = viMap(g);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, g.yT + 0.5, g.x1 - g.x0, g.yB - g.yT);

    /* The cell's whole characteristic, from an open circuit down to very nearly
     * a short. The line is a property of the CELL, not of the load box, so it is
     * swept over a far wider range of loads than the box can actually supply —
     * every point of it is a separate solve, and it comes out straight. */
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x0, g.yT, g.x1 - g.x0, g.yB - g.yT); ctx.clip();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const R = 1e4 * Math.pow(1e-8, i / 240);
      const s = solve({ mode: 'single', R1: R });
      i ? ctx.lineTo(m.X(s.I), m.Y(s.term)) : ctx.moveTo(m.X(s.I), m.Y(s.term));
    }
    ctx.stroke(); ctx.restore();
    ctext(ctx, g.sm ? 'solved, load by load'
                    : 'the terminal pd, solved separately at every load',
      g.x0 + 8, g.yT - 8, { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the two ends of it, which are the two things the experiment is after.
     * They are marked but not labelled in place: a straight line leaves no room
     * beside itself, so the words go in the corner the line has left empty. */
    for (const [x, y] of [[m.X(0), m.Y(st.emf)],
                          st.r > 1e-9 && st.emf / st.r <= m.Imax
                            ? [m.X(st.emf / st.r), m.Y(0)] : null].filter(Boolean)) {
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(x, y, 4.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.bg; ctx.lineWidth = 1.5; ctx.stroke();
    }

    /* the recorded points, and the straight line through them */
    const pts = st.data.map(d => [d.I, d.V]);
    const f = fitLine(pts);
    if (f) {
      ctx.save();
      ctx.setLineDash([7, 6]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.X(0), m.Y(f.inter));
      ctx.lineTo(m.X(m.Imax), m.Y(f.inter + f.grad * m.Imax));
      ctx.stroke(); ctx.restore();
      ctext(ctx, `gradient ${fmt(f.grad, 4)} Ω → r = ${ohms(-f.grad)}`,
        g.x1 - 8, g.yT + 16,
        { font: `600 11.5px ${P.font}`, color: P.text, align: 'right',
          halo: P.bg, haloWidth: 4 });
      ctext(ctx, `intercept ${fmt(f.inter, 4)} V → ε`,
        g.x1 - 8, g.yT + 32,
        { font: `600 11.5px ${P.font}`, color: P.text, align: 'right',
          halo: P.bg, haloWidth: 4 });
    } else {
      ctext(ctx, st.data.length
        ? 'one reading is a point, not a line — change the load and record another'
        : 'change the load and record the readings, or work through eight at once',
        g.x1 - 8, g.yT + 16,
        { font: `500 11.5px ${P.font}`, color: P.muted, align: 'right' });
    }
    for (const d of st.data) {
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(m.X(d.I), m.Y(d.V), 4.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.bg; ctx.lineWidth = 1.4; ctx.stroke();
    }

    axes(ctx, g, {
      xs: ticks(0, m.Imax, 6), X: m.X,
      xfmt: v => fmt(v, m.Imax > 4 ? 1 : 2),
      ys: ticks(0, m.Vmax, 5), Y: m.Y,
      yfmt: v => fmt(v, m.Vmax > 8 ? 0 : 1),
      xlab: 'current / A', ylab: 'terminal pd / V',
    });

    const s = solve();
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(m.X(s.I), m.Y(s.term), 5.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.8; ctx.stroke();
  }

  function drawPower(ctx, g) {
    const m = powMap(g);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, g.yT + 0.5, g.x1 - g.x0, g.yB - g.yT);

    /* the match, marked before anything is drawn over it */
    if (st.r >= L_MIN && st.r <= L_MAX) {
      const px = m.X(Math.log10(st.r));
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(px, g.yT); ctx.lineTo(px, g.yB); ctx.stroke();
      ctx.restore();
      ctext(ctx, g.sm ? 'R = r' : 'R = r — the most power there is',
        px + 6, g.yT + 16,
        { font: `600 11.5px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });
    }

    const curve = (fn, col, wdt, dash) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(g.x0, g.yT, g.x1 - g.x0, g.yB - g.yT); ctx.clip();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const lr = m.lo + (m.hi - m.lo) * i / 200;
        const s = solve({ mode: 'single', R1: Math.pow(10, lr) });
        const y = m.Y(fn(s));
        i ? ctx.lineTo(m.X(lr), y) : ctx.moveTo(m.X(lr), y);
      }
      ctx.stroke(); ctx.restore();
    };
    curve(s => s.Pout, P.accent, 2.6, null);
    curve(s => s.Plost, P.text, 1.8, [6, 5]);

    ctext(ctx, g.sm ? 'power out' : 'power delivered to the load',
      g.x0 + 8, g.yT - 8, { font: `600 11.5px ${P.font}`, color: P.accent });
    ctext(ctx, g.sm ? 'dashed: wasted inside' : 'dashed: power wasted inside the cell',
      g.x1 - 8, g.yT - 8,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'right' });

    /* efficiency, on its own right-hand scale */
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const lr = m.lo + (m.hi - m.lo) * i / 200;
      const s = solve({ mode: 'single', R1: Math.pow(10, lr) });
      const y = g.yB - s.eff * (g.yB - g.yT);
      i ? ctx.lineTo(m.X(lr), y) : ctx.moveTo(m.X(lr), y);
    }
    ctx.stroke(); ctx.restore();
    ctext(ctx, g.sm ? 'dotted: efficiency' : 'dotted: efficiency, 0 to 100% up the same box',
      g.x0 + 8, g.yB - 8, { font: `500 11px ${P.font}`, color: P.muted });

    const dec = [];
    for (let d = Math.ceil(m.lo); d <= m.hi; d++) dec.push(d);
    axes(ctx, g, {
      xs: dec, X: m.X, xfmt: d => `${Math.pow(10, d)}`,
      ys: ticks(0, m.Pmax, 5), Y: m.Y, yfmt: v => fmt(v, m.Pmax > 8 ? 0 : 1),
      xlab: 'load resistance / Ω   (each step is ten times the last)',
      ylab: 'power / W', logx: true, m,
    });

    const here = nominalR();
    if (here >= Math.pow(10, m.lo) && here <= Math.pow(10, m.hi)) {
      const s = solve();
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(m.X(Math.log10(here)), m.Y(s.Pout), 5.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = P.bg; ctx.lineWidth = 1.8; ctx.stroke();
    }
  }

  /** ticks a person would have chosen: 1, 2, 2.5 or 5 times a power of ten */
  function ticks(lo, hi, want = 5) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / want;
    const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = 10 * p10;
    for (const m of [1, 2, 2.5, 5]) if (m * p10 >= raw) { step = m * p10; break; }
    const out2 = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      out2.push(+v.toPrecision(12));
    }
    return out2;
  }

  /** 1, 2, 5 at every decade, which is how a log axis is labelled on paper */
  function logTicks(lo, hi) {
    const out2 = [];
    for (let d = Math.floor(lo) - 1; d <= Math.ceil(hi) + 1; d++) {
      for (const m of [1, 2, 5]) {
        const l = Math.log10(m) + d;
        if (l >= lo - 1e-9 && l <= hi + 1e-9) out2.push(m * Math.pow(10, d));
      }
    }
    return out2;
  }

  function axes(ctx, g, o) {
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, g.ax); ctx.lineTo(g.x1, g.ax); ctx.stroke();
    for (const v of o.xs) {
      const px = o.X(v);
      if (px < g.x0 - 1 || px > g.x1 + 1) continue;
      ctx.beginPath(); ctx.moveTo(px, g.ax); ctx.lineTo(px, g.ax + 5); ctx.stroke();
      ctext(ctx, o.xfmt(v), px, g.ax + 16,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, o.xlab, g.x1, g.ax + 32,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    for (const v of o.ys) {
      const y = o.Y(v);
      ctext(ctx, o.yfmt(v), g.x0 - 8, y + 4,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
      if (v > 0) {
        ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
        ctx.restore();
      }
    }
    ctext(ctx, o.ylab, g.x0 - 8, g.yT - 8,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
  }

  function drawGraph() {
    const ctx = gv.ctx, g = GG();
    ctx.clearRect(0, 0, g.W, HG);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, g.W, HG);
    if (st.graph === 'vi') drawVI(ctx, g); else drawPower(ctx, g);
  }

  /* ================================================================== *
   * the readouts
   * ================================================================== */

  /** Kirchhoff's laws, closed from the node voltages the solver returned */
  function audit(s) {
    let worstNode = 0;
    for (let n = 1; n < s.nodes; n++) {
      let sum = 0, scale = 0;
      for (const c of s.parts) {
        if (c.type !== 'R') continue;
        if (c.a === n) { const i = branchI(s.sol, c); sum -= i; scale += Math.abs(i); }
        if (c.b === n) { const i = branchI(s.sol, c); sum += i; scale += Math.abs(i); }
      }
      if (n === 1 || (s.T === 1 && n === 1)) sum += s.I;        // the cell feeds node 1
      worstNode = Math.max(worstNode, Math.abs(sum) / Math.max(scale, 1e-30));
    }
    /* the loop law: emf against the sum of the pds it is shared between */
    const drop = st.emf - (s.lost + s.term);
    return { node: worstNode, loop: Math.abs(drop) / Math.max(st.emf, 1e-30) };
  }

  function render() {
    drawCircuit(); drawGraph();

    const s = solve();
    const a = audit(s);
    const f = fitLine(st.data.map(d => [d.I, d.V]));
    const Rm = nominalR();
    const rule = st.mode === 'single' ? null
      : st.mode === 'series' ? { words: `R₁ + R₂ = ${ohms(st.R1 + st.R2)}`, v: st.R1 + st.R2 }
      : st.mode === 'parallel' ? { words: `R₁R₂/(R₁+R₂) = ${ohms(1 / (1 / st.R1 + 1 / st.R2))}`,
                                   v: 1 / (1 / st.R1 + 1 / st.R2) }
      : { words: `upper + (lower in parallel with the load) = ${ohms(Rm)}`, v: Rm };

    const up = (1 - st.frac) * st.track, dn = st.frac * st.track;
    const open = solve({ loaded: false });

    out.setAll({
      ce: `ε = ${fmt(st.emf, 2)} V,  r = ${st.r < 1e-9 ? 'nothing at all' : ohms(st.r)}`,
      ex: `${ohms(s.Rext)} — the solver was never told this, it is V/I from the answer`,
      cb: rule
        ? `${rule.words};  the solver found ${ohms(s.Rext)}, differing by `
          + `${(Math.abs(rule.v - s.Rext) / Math.max(rule.v, 1e-30) * 100).toExponential(1)}%`
        : 'one resistor, so there is no rule to check — put two across it and there is',
      cu: `${amps(s.I)}`,
      tv: `${fmt(s.term, 3)} V, with ${fmt(s.lost, 3)} V lost inside — so you are `
        + `getting ${fmt(100 * s.term / Math.max(st.emf, 1e-30), 1)}% of the emf`,
      ki: `every node closes to ${a.node.toExponential(2)} of the current through it, and the `
        + `loop to ${a.loop.toExponential(2)} of the emf — that is the arithmetic, not a tolerance`,
      po: `${watts(s.Pout)}`,
      pl: `${watts(s.Plost)} — the cell is ${fmt(100 * s.eff, 1)}% efficient`,
      mx: st.r < 1e-9
        ? 'with a perfect cell there is no limit: the smaller the load, the more power'
        : `at R = r = ${ohms(st.r)} you would draw ε²/4r = `
          + `${watts(st.emf * st.emf / (4 * st.r))}, and the cell would waste exactly as much `
          + 'again heating itself — 50% efficiency, at the point of most power',
      sc: st.r < 1e-9
        ? 'a perfect cell would deliver an infinite current — which is why no cell is perfect'
        : `ε/r = ${amps(st.emf / st.r)} with the terminals joined, and every watt of `
          + `${watts(st.emf * st.emf / st.r)} inside the cell`,
      gr: f
        ? `gradient ${fmt(f.grad, 4)} Ω → r = ${ohms(-f.grad)} (true ${ohms(st.r)});  `
          + `intercept ${fmt(f.inter, 4)} V → ε (true ${fmt(st.emf, 2)} V)`
        : `${st.data.length} reading${st.data.length === 1 ? '' : 's'} — two or more give a line`,
      dv: st.mode !== 'divider'
        ? 'switch to the potential divider to see this'
        : `loaded: ${fmt(s.vTap, 3)} V.  With nothing across the output: `
          + `${fmt(open.vTap, 3)} V — a sag of ${fmt(open.vTap - s.vTap, 3)} V. `
          + `The load sits in parallel with the ${ohms(dn)} lower arm and drags it down to `
          + `${ohms(st.loaded ? 1 / (1 / dn + 1 / st.load) : dn)}`,
    });
  }

  /* -------------------------------------------------------- the animation */

  const anim = loop(dt => {
    if (!st.playing) return;
    st.t += Math.min(dt, 0.1);
    drawCircuit();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  function fitAll() {
    P = palette(root);
    const cw = Math.round(cv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      cv.setLogical(w, w < NARROW ? HC_SM : HC);
      gv.setLogical(w, HG);
    }
    cv.fit(); gv.fit();
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

  setMode('single');
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      const m = p.mode;
      Object.assign(st, p);
      sE.set(st.emf); sR.set(st.r); s1.set(st.R1); s2.set(st.R2);
      sT.set(st.track); sFr.set(st.frac); sLd.set(st.load);
      if (m) setMode(m); else render();
    },
    _state: () => {
      const s = solve();
      return {
        mode: st.mode, emf: st.emf, r: st.r, R1: st.R1, R2: st.R2,
        track: st.track, frac: st.frac, load: st.load, loaded: st.loaded,
        I: s.I, term: s.term, lost: s.lost, Rext: s.Rext,
        Pout: s.Pout, Plost: s.Plost, Pin: s.Pin, eff: s.eff,
        vTap: s.vTap, nodes: s.nodes, T: s.T,
        v: Array.from(s.sol.v), cur: s.cur,
        audit: audit(s), points: st.data.length,
      };
    },
    _solve: over => {
      const s = solve(over);
      return { I: s.I, term: s.term, lost: s.lost, Rext: s.Rext, Pout: s.Pout,
               Plost: s.Plost, eff: s.eff, vTap: s.vTap,
               v: Array.from(s.sol.v), cur: s.cur };
    },
    _netlist: over => netlist(over).parts.map(c => ({ ...c })),
    _network: (parts, n) => {
      const r = solveNetwork(parts, n);
      return { v: Array.from(r.v), i: r.i };
    },
    _nominal: over => nominalR(over),
    _data: () => st.data.map(d => ({ ...d })),
    _fit: () => fitLine(st.data.map(d => [d.I, d.V])),
    _record: (R) => record(R, solve({ mode: 'single', R1: R })),
    _wires: () => WIRES.map(w => ({ id: w.id, I: w.I, pts: w.pts.map(p => [...p]) })),
    _comps: () => COMPS.map(c => ({ ...c })),
    _geomC: () => {
      const g = GC();
      return { ...g, bar: { x: g.bx, y: g.by, w: g.bw, h: g.bh } };
    },
    _geomG: () => {
      const g = GG(), s = solve();
      if (st.graph === 'vi') {
        const m = viMap(g);
        return { mode: 'vi', ...g, Imax: m.Imax, Vmax: m.Vmax,
                 px: m.X(s.I), py: m.Y(s.term),
                 xOf0: m.X(0), xOfMax: m.X(m.Imax),
                 yOf0: m.Y(0), yOfMax: m.Y(m.Vmax) };
      }
      const m = powMap(g);
      return { mode: 'power', ...g, lo: m.lo, hi: m.hi, Pmax: m.Pmax,
               px: m.X(Math.log10(nominalR())), py: m.Y(s.Pout),
               xOfLo: m.X(m.lo), xOfHi: m.X(m.hi),
               yOf0: m.Y(0), yOfMax: m.Y(m.Pmax) };
    },
    _consts: () => ({ MW, HC, HC_SM, HG, NARROW,
                      E_MIN, E_MAX, R_MIN, R_MAX, L_MIN, L_MAX,
                      T_MIN, T_MAX, LOADS }),
  };
}
