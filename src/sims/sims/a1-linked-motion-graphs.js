/* ============================================================================
 * A1-1  Linked Motion Graphs
 * IB Physics A.1 Kinematics
 *
 * Built to the house pattern: a canvas for the apparatus, canvases and plots
 * for the graphs, controls beneath, and every number in the readout grid.
 * Drag a handle on ANY of the three graphs and the other two redraw, exactly
 * consistent with each other, while the object moves on the track above.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * The motion is defined by velocity as a piecewise-linear function of time,
 * with N+1 control points v_0 .. v_N at equally spaced times t_i = i*DT.
 * That choice is what makes all three graphs exact rather than approximated:
 *
 *   velocity      v(t) = v_i + a_i*(t - t_i)          linear on each segment
 *   acceleration  a_i  = (v_{i+1} - v_i) / DT         constant on each segment
 *   displacement  s(t) = s_i + v_i*T + a_i*T^2/2      T = t - t_i, quadratic
 *   node values   s_{i+1} = s_i + (v_i + v_{i+1})*DT/2   (trapezium, exact
 *                                                        for linear v)
 *
 * Every curve is evaluated from these closed forms. Nothing is integrated
 * numerically, so there is no drift and no timestep error anywhere: v is
 * exactly ds/dt and a is exactly dv/dt at every point, which is the whole
 * teaching point of the simulation.
 *
 * Dragging is inverted consistently, so editing any graph is a real edit of
 * the same underlying motion:
 *
 *   drag v_i   set v_i directly.
 *   drag a_i   set the segment's acceleration, then rebuild v forwards from
 *              v_{i+1} = v_i + a_i*DT keeping every later acceleration fixed.
 *              Earlier nodes cannot change, because a_0..a_{i-1} and v_0 are
 *              untouched.
 *   drag s_i   the segment [i-1, i] must now cover a displacement of
 *              (s_i - s_{i-1}), so from the trapezium rule
 *                  v_i = 2*(s_i - s_{i-1})/DT - v_{i-1}
 *              then rebuild v forwards keeping later accelerations fixed.
 *              Dragging s_0 translates the whole displacement graph, which
 *              changes the origin only and leaves v and a alone. That is
 *              exactly the point that displacement graphs carry a constant
 *              of integration and the other two do not.
 *
 * The animated object is placed at the closed-form s(t), so the animation and
 * the graphs can never disagree.
 * ==========================================================================*/

import {
  createRoot, el, svg, heading, panelBox, controls, note, button, select,
  slider, readouts, Plot, loop, draggable, fmt, clamp, textScale,
  surface, palette, carrow, ctext,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const N       = 4;             // number of segments
const T_END   = 10;            // s
const DT      = T_END / N;     // 2.5 s per segment
const V_LIM   = 12;            // m/s, drag limit
const A_LIM   = 10;            // m/s^2, drag limit
const V_STEP  = 0.5;           // snap, keeps readouts tidy
const A_STEP  = 0.2;

const GW = 1120, GH = 156;     // graph viewBox
const KW = 1120, KH = 150;     // track canvas

const PRESETS = {
  accelerate: { label: 'Constant acceleration', v: [0, 3, 6, 9, 12], s0: 0 },
  constant:   { label: 'Constant velocity',     v: [6, 6, 6, 6, 6],  s0: 0 },
  decelerate: { label: 'Decelerating to rest',  v: [10, 7.5, 5, 2.5, 0], s0: 0 },
  reverse:    { label: 'Reversing direction',   v: [8, 4, 0, -4, -8], s0: 20 },
  stopgo:     { label: 'Stop and go',           v: [0, 6, 6, 0, 0],  s0: 0 },
};

/* ------------------------------------------------------------ the model */

const times = Array.from({ length: N + 1 }, (_, i) => i * DT);

/** accelerations, one constant value per segment */
function accelsOf(v) {
  return v.slice(0, N).map((vi, i) => (v[i + 1] - vi) / DT);
}

/** displacement at each node, exact for piecewise-linear v */
function nodesOf(v, s0) {
  const s = [s0];
  for (let i = 0; i < N; i++) s.push(s[i] + (v[i] + v[i + 1]) * DT / 2);
  return s;
}

/** segment index containing time t */
function segAt(t) { return clamp(Math.floor(t / DT), 0, N - 1); }

/** exact state at time t */
function stateAt(v, sNodes, t) {
  const i = segAt(t), T = t - times[i], a = (v[i + 1] - v[i]) / DT;
  return { i, a, v: v[i] + a * T, s: sNodes[i] + v[i] * T + 0.5 * a * T * T };
}

/* ==========================================================================
 * mount
 * ========================================================================*/

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a1-motion-graphs',
    title: 'Linked motion graphs: displacement, velocity and acceleration',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ---------------------------------------------------------- state */
  const st = {
    v: PRESETS.accelerate.v.slice(),
    s0: 0,
    t: 0,
    playing: true,
    speed: 1,
    showTangent: true,
    showArea: true,
    sDomain: null,      // frozen while dragging so the axis does not jump
    dragging: false,
    k: 1,               // viewBox units per rendered CSS pixel
  };

  /* ------------------------------------------------------- the track */

  const kv = surface(KW, KH, { label: 'Object moving along a track' });

  /* ------------------------------------------------------- the plots */

  const padTop = { l: 62, r: 18, t: 24, b: 10 };
  const padBot = { l: 62, r: 18, t: 24, b: 38 };

  const pS = new Plot({
    width: GW, height: GH, pad: padTop, xDomain: [0, T_END], yDomain: [0, 60],
    xTicks: 5, yTicks: 4, xTickLabels: false,
    yLabel: 's (m)', ariaLabel: 'Displacement against time',
  });
  const pV = new Plot({
    width: GW, height: GH, pad: padTop, xDomain: [0, T_END], yDomain: [-V_LIM, V_LIM],
    xTicks: 5, yTicks: 4, xTickLabels: false,
    yLabel: 'v (m s⁻¹)', ariaLabel: 'Velocity against time',
  });
  const pA = new Plot({
    width: GW, height: GH + 24, pad: padBot, xDomain: [0, T_END], yDomain: [-A_LIM, A_LIM],
    xTicks: 5, yTicks: 4,
    xLabel: 't (s)', yLabel: 'a (m s⁻²)',
    ariaLabel: 'Acceleration against time',
  });

  /* --------------------------------------------------------- readouts */

  const out = readouts([
    { key: 't',  label: 'Time <i>t</i>' },
    { key: 's',  label: 'Displacement <i>s</i>' },
    { key: 'v',  label: '<i>v</i> = gradient of the <i>s</i>–<i>t</i> graph' },
    { key: 'a',  label: '<i>a</i> = gradient of the <i>v</i>–<i>t</i> graph' },
    { key: 'ar', label: 'Area under <i>v</i>–<i>t</i> so far' },
    { key: 'sg', label: 'Segment now (constant <i>a</i>, so SUVAT applies)' },
    { key: 'c1', label: 'Check <i>v</i> = <i>u</i> + <i>at</i>' },
    { key: 'c2', label: 'Check <i>s</i> = <i>ut</i> + ½<i>at</i>²' },
  ]);

  /* --------------------------------------------------------- controls */

  const bPlay = button({
    label: '⏸ Pause', pressed: true,
    onClick: b => {
      st.playing = !st.playing;
      b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
      b.setAttribute('aria-pressed', String(st.playing));
    },
  });
  const bReset = button({ label: 'Restart', onClick: () => { st.t = 0; sScrub.set(0); redraw(); } });
  const bTan = button({
    label: 'Tangent on s–t', pressed: true,
    onClick: b => { st.showTangent = !st.showTangent;
                    b.setAttribute('aria-pressed', String(st.showTangent)); redraw(); },
  });
  const bArea = button({
    label: 'Area under v–t', pressed: true,
    onClick: b => { st.showArea = !st.showArea;
                    b.setAttribute('aria-pressed', String(st.showArea)); redraw(); },
  });

  const sScrub = slider({
    label: '<i>t</i>', min: 0, max: T_END, step: 0.05, value: 0,
    format: x => `${x.toFixed(2)} s`,
    onInput: x => {
      st.t = x;
      if (st.playing) { st.playing = false; bPlay.setLabel('▶ Play');
                        bPlay.setPressed(false); }
      redraw();
    },
  });
  const sSpeed = slider({
    label: 'sim speed', word: true, min: 0.25, max: 2, step: 0.25, value: 1,
    format: x => `×${x.toFixed(2)}`, onInput: x => { st.speed = x; },
  });

  const selPreset = select({
    label: 'preset motion:', value: 'accelerate',
    options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label })),
    onChange: k => {
      st.v = PRESETS[k].v.slice(); st.s0 = PRESETS[k].s0; st.t = 0;
      st.sDomain = null; sScrub.set(0); redraw();
    },
  });

  /* ------------------------------------------------------------ build */

  root.append(
    heading('Linked Motion Graphs',
            'displacement, velocity and acceleration — drag a handle on any graph'),
    panelBox('Track — position s (m) of the object', kv.el),
    panelBox('Motion graphs — drag any handle and the other two redraw',
             el('div', { class: 'a1-plots' }, [pS.svg, pV.svg, pA.svg])),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bReset.node, bTan.node, bArea.node])]),
    controls([selPreset.node, sScrub.node, sSpeed.node]),
    out.node,
    note('<b>Kinematics.</b> The motion is held as velocity, piecewise linear in time, ' +
         'so every curve is a closed form and nothing is integrated numerically: ' +
         '<i>v</i> is exactly d<i>s</i>/d<i>t</i> and <i>a</i> is exactly d<i>v</i>/d<i>t</i> ' +
         'at every point, which is the whole idea. Drag a handle on any of the three graphs ' +
         'and the other two follow, because all three describe the same motion. Dragging the ' +
         'first handle on the <i>s</i>–<i>t</i> graph slides the whole curve and changes ' +
         'nothing else: displacement carries a constant of integration, and velocity and ' +
         'acceleration do not. Handles take keyboard focus, so the arrow keys work too.')
  );

  /* ---------------------------------------------------------- styling */

  const cssId = 'ibs-a1-motion-graphs-v3';
  if (!document.getElementById(cssId)) {
    const style = document.createElement('style');
    style.id = cssId;
    style.textContent = `
.ibs .a1-plots{ display:flex; flex-direction:column; gap:0; padding:6px 4px 4px; }
.ibs .a1-plots svg{ display:block; width:100%; height:auto; overflow:visible; }
.ibs .a1-handle{ cursor:ns-resize; }
.ibs .a1-handle:focus-visible{ outline:none; }
.ibs .a1-handle:focus-visible .a1-ring{ opacity:1; }
`;
    document.head.appendChild(style);
  }

  /* =======================================================================
   * drawing
   * =====================================================================*/

  let P = palette(root);

  function niceDomain(lo, hi) {
    const span = Math.max(hi - lo, 10);
    const pad = span * 0.12;
    const step = 10;
    let a = Math.floor((lo - pad) / step) * step;
    let b = Math.ceil((hi + pad) / step) * step;
    // if the motion never goes negative, anchor the axis at the origin rather
    // than wasting a decade below it (and the same the other way round)
    if (lo >= 0) a = 0;
    if (hi <= 0) b = 0;
    if (b - a < step) b = a + step;
    return [a, b];
  }

  function sampleSegments(fn, per = 24) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      for (let k = 0; k <= per; k++) {
        if (i > 0 && k === 0) continue;
        const t = times[i] + (DT * k) / per;
        pts.push([t, fn(t)]);
      }
    }
    return pts;
  }

  function redraw() {
    // keep handles and hit areas a constant physical size however the
    // container is scaled, so they stay tappable on a phone
    const cw = pS.svg.clientWidth || pS.w;
    st.k = pS.w / cw;
    textScale(root, pS.w, pS.svg);

    const v = st.v;
    const a = accelsOf(v);
    const sNodes = nodesOf(v, st.s0);

    /* -- displacement axis, frozen while a drag is in progress ---------- */
    if (!st.dragging || !st.sDomain) {
      const lo = Math.min(...sNodes, stateAt(v, sNodes, st.t).s);
      const hi = Math.max(...sNodes, stateAt(v, sNodes, st.t).s);
      // a turning point inside a segment can exceed both node values
      let tlo = lo, thi = hi;
      for (let i = 0; i < N; i++) {
        if (a[i] !== 0) {
          const tv = -v[i] / a[i];                       // time of v = 0 in segment
          if (tv > 0 && tv < DT) {
            const sv = sNodes[i] + v[i] * tv + 0.5 * a[i] * tv * tv;
            tlo = Math.min(tlo, sv); thi = Math.max(thi, sv);
          }
        }
      }
      st.sDomain = niceDomain(tlo, thi);
    }
    pS.setDomain(null, st.sDomain);

    const now = stateAt(v, sNodes, st.t);
    const TEAL = 'var(--ibs-accent)', INK = 'var(--ibs-text)';

    /* ------------------------------------------------------ s–t graph */
    pS.clear(); pS.clearOverlay();
    pS.line(sampleSegments(t => stateAt(v, sNodes, t).s), { color: TEAL, width: 2.4 });

    if (st.showTangent) {
      // the tangent's gradient IS the velocity: drawn to scale, in ink, so it
      // reads as a construction on the teal curve rather than a second curve
      const half = 1.6;                                   // seconds either side
      const t0 = Math.max(0, st.t - half), t1 = Math.min(T_END, st.t + half);
      pS.line([[t0, now.s + now.v * (t0 - st.t)], [t1, now.s + now.v * (t1 - st.t)]],
              { color: INK, width: 1.6, dash: '6 4', layer: 'over' });
      cornerNote(pS, `tangent gradient = ${fmt(now.v, 2)} m s⁻¹ = v`);
    }
    drawCursor(pS, now.s);
    drawHandles(pS, times.map((t, i) => ({ i, t, y: sNodes[i] })), 's');

    /* ------------------------------------------------------ v–t graph */
    pV.clear(); pV.clearOverlay();
    if (st.showArea) {
      const upto = sampleSegments(t => stateAt(v, sNodes, t).v).filter(p => p[0] <= st.t);
      upto.push([st.t, now.v]);
      if (upto.length > 1) pV.area(upto, { color: TEAL, opacity: 0.16, baseline: 0 });
    }
    pV.line(times.map((t, i) => [t, v[i]]), { color: TEAL, width: 2.4 });
    if (st.showArea) cornerNote(pV, `shaded area = ${fmt(now.s - st.s0, 1)} m = displacement`);
    drawCursor(pV, now.v);
    drawHandles(pV, times.map((t, i) => ({ i, t, y: v[i] })), 'v');

    /* ------------------------------------------------------ a–t graph */
    pA.clear(); pA.clearOverlay();
    const stepPts = [];
    for (let i = 0; i < N; i++) { stepPts.push([times[i], a[i]], [times[i + 1], a[i]]); }
    pA.area(stepPts, { color: TEAL, opacity: 0.12, baseline: 0 });
    // draw each segment separately so the jumps are vertical dotted risers
    for (let i = 0; i < N; i++) {
      pA.line([[times[i], a[i]], [times[i + 1], a[i]]], { color: TEAL, width: 2.4 });
      if (i > 0 && a[i] !== a[i - 1]) {
        pA.line([[times[i], a[i - 1]], [times[i], a[i]]],
                { color: TEAL, width: 1.3, dash: '3 3' });
      }
    }
    drawCursor(pA, a[now.i]);
    drawHandles(pA, a.map((ai, i) => ({ i, t: times[i] + DT / 2, y: ai })), 'a');

    /* -------------------------------------------------------- track */
    drawTrack(now, a[now.i]);

    /* ------------------------------------------------------ readouts */
    const i = now.i, u = v[i], vEnd = v[i + 1], ai = a[i];
    const ds = sNodes[i + 1] - sNodes[i];
    out.setAll({
      t:  `${fmt(st.t, 2)} s`,
      s:  `${fmt(now.s, 2)} m`,
      v:  `${fmt(now.v, 2)} m s⁻¹`,
      a:  `${fmt(a[i], 2)} m s⁻²`,
      ar: `${fmt(now.s - st.s0, 2)} m`,
      sg: `${i + 1} of ${N}:  ${fmt(times[i], 1)} to ${fmt(times[i + 1], 1)} s`,
      c1: `${fmt(u, 2)} + ${fmt(ai, 2)}×${fmt(DT, 1)} = ${fmt(u + ai * DT, 2)} = ${fmt(vEnd, 2)}`,
      c2: `${fmt(u * DT + 0.5 * ai * DT * DT, 2)} m = Δs ${fmt(ds, 2)} m`,
    });
  }

  function drawCursor(plot, yVal) {
    plot.vline(st.t, { color: 'var(--ibs-muted)', dash: '3 3' });
    // hollow, so the read-off marker is never mistaken for a draggable handle
    plot.gOver.appendChild(svg('circle', {
      cx: plot.X(st.t), cy: plot.Y(yVal), r: 4.4,
      fill: 'var(--ibs-bg)', stroke: 'var(--ibs-text)', 'stroke-width': 2.2,
    }));
  }

  /** annotation in the empty strip above the plot area, opposite the axis title */
  function cornerNote(plot, text) {
    plot.gOver.appendChild(svg('text', {
      x: plot.w - plot.pad.r, y: plot.pad.t - 10, 'text-anchor': 'end',
      'font-size': 11.5, 'font-weight': 600, fill: 'var(--ibs-accent)', text,
    }));
  }

  /* --------------------------------------------------- drag handles */

  const handleGroups = new Map();   // plot -> {kind, items}

  function hitRadius() { return Math.max(13, 21 * st.k); }

  function drawHandles(plot, items, kind) {
    handleGroups.set(plot, { kind, items });
    const r = Math.max(5.2, 4.4 * st.k);
    for (const h of items) {
      const cx = plot.X(h.t), cy = plot.Y(h.y);
      const g = svg('g', { class: 'a1-handle', tabindex: '0', role: 'slider',
                           'aria-label': labelFor(kind, h.i),
                           'aria-valuenow': h.y.toFixed(2) });
      g.append(
        // invisible finger-sized target, so a phone user can grab the handle
        svg('circle', { cx, cy, r: hitRadius(), fill: 'transparent' }),
        svg('circle', { class: 'a1-ring', cx, cy, r: r + 4.5, fill: 'none',
                        stroke: 'var(--ibs-accent)', 'stroke-width': 2, opacity: 0 }),
        svg('circle', { cx, cy, r, fill: 'var(--ibs-accent)',
                        stroke: 'var(--ibs-bg)', 'stroke-width': 2 })
      );
      g.addEventListener('keydown', e => onHandleKey(e, kind, h.i));
      plot.gOver.appendChild(g);
    }
  }

  function labelFor(kind, i) {
    if (kind === 'v') return `Velocity at ${fmt(times[i], 1)} seconds`;
    if (kind === 'a') return `Acceleration during segment ${i + 1}`;
    return i === 0 ? 'Starting displacement' : `Displacement at ${fmt(times[i], 1)} seconds`;
  }

  function onHandleKey(e, kind, i) {
    const k = e.key;
    let d = 0;
    if (k === 'ArrowUp' || k === 'ArrowRight') d = 1;
    else if (k === 'ArrowDown' || k === 'ArrowLeft') d = -1;
    else return;
    e.preventDefault();
    const big = e.shiftKey ? 4 : 1;
    if (kind === 'v') setV(i, st.v[i] + d * big * V_STEP);
    else if (kind === 'a') setA(i, accelsOf(st.v)[i] + d * big * A_STEP);
    else setS(i, nodesOf(st.v, st.s0)[i] + d * big * 2);
    redraw();
    // keep focus on the equivalent handle after the redraw
    const list = plotFor(kind).gOver.querySelectorAll('.a1-handle');
    if (list[i]) list[i].focus();
  }

  function plotFor(kind) { return kind === 'v' ? pV : kind === 'a' ? pA : pS; }

  /* ------------------------------------------------- editing the model */

  const snap = (x, step) => Math.round(x / step) * step;

  /** rebuild velocities forward from node `from`, holding those accelerations */
  function propagate(v, a, from) {
    for (let j = from; j < N; j++) v[j + 1] = clamp(v[j] + a[j] * DT, -V_LIM, V_LIM);
    return v;
  }

  function setV(i, value) {
    st.v[i] = clamp(snap(value, V_STEP), -V_LIM, V_LIM);
  }

  function setA(i, value) {
    const a = accelsOf(st.v);
    a[i] = clamp(snap(value, A_STEP), -A_LIM, A_LIM);
    propagate(st.v, a, i);
  }

  function setS(i, value) {
    if (i === 0) {                       // translate the whole curve
      st.s0 = snap(value, 0.5);
      return;
    }
    const a = accelsOf(st.v);
    const sNodes = nodesOf(st.v, st.s0);
    // trapezium rule inverted: this segment must cover (value - s_{i-1})
    const need = value - sNodes[i - 1];
    st.v[i] = clamp(snap(2 * need / DT - st.v[i - 1], V_STEP), -V_LIM, V_LIM);
    propagate(st.v, a, i);               // later accelerations unchanged
  }

  /* ------------------------------------------------------ pointer drag */

  function attach(plot, kind) {
    let active = null;
    const un = draggable(plot.svg, {
      cursor: 'default',
      onStart(p) {
        const info = handleGroups.get(plot);
        if (!info) return;
        let best = null, bestD = hitRadius();
        for (const h of info.items) {
          const d = Math.hypot(plot.X(h.t) - p.x, plot.Y(h.y) - p.y);
          if (d < bestD) { bestD = d; best = h.i; }
        }
        active = best;
        if (active !== null) { st.dragging = true; if (kind !== 's') st.sDomain = null; }
      },
      onMove(p) {
        if (active === null) return;
        const y = plot.invY(p.y);
        if (kind === 'v') setV(active, y);
        else if (kind === 'a') setA(active, y);
        else setS(active, y);
        redraw();
      },
      onEnd() {
        if (active !== null) { active = null; st.dragging = false; st.sDomain = null; redraw(); }
      },
    });
    onDestroy(un);
  }
  attach(pS, 's'); attach(pV, 'v'); attach(pA, 'a');

  /* -------------------------------------------------------- the track */

  function drawTrack(now, aNow) {
    const ctx = kv.ctx;
    const lo = st.sDomain[0], hi = st.sDomain[1];
    const KWn = kv.w, KHn = kv.h;
    const X = s => 46 + ((s - lo) / (hi - lo)) * (KWn - 92);
    const y = Math.round(KHn * 0.42);

    ctx.clearRect(0, 0, KWn, KHn);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, KWn, KHn);

    /* the track, and the metre scale beneath it */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(30, y + 16); ctx.lineTo(KWn - 30, y + 16); ctx.stroke();

    const step = (hi - lo) <= 40 ? 5 : 10;
    ctx.font = `500 10.5px ${P.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let s = Math.ceil(lo / step) * step; s <= hi + 1e-9; s += step) {
      ctx.strokeStyle = P.line; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(s), y + 16); ctx.lineTo(X(s), y + 24); ctx.stroke();
      ctx.fillStyle = P.muted;
      ctx.fillText(String(s), X(s), y + 28);
    }

    /* trail: one ghost every 0.4 s, so the spacing shows the speed directly */
    const sN = nodesOf(st.v, st.s0);
    for (let tt = 0; tt <= st.t + 1e-9; tt += 0.4) {
      const p = stateAt(st.v, sN, Math.min(tt, T_END));
      const age = (st.t - tt) / T_END;
      ctx.save();
      ctx.globalAlpha = 0.40 * (1 - age); ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(X(p.s), y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* the object: the same polished sphere as the other simulations */
    const px = X(now.s), RB = 15;
    const gr = ctx.createRadialGradient(px - 5, y - 5.5, 2, px, y, RB);
    gr.addColorStop(0, '#dceef0');
    gr.addColorStop(0.28, '#5fa3ab');
    gr.addColorStop(0.70, '#005F6A');
    gr.addColorStop(1, '#00272d');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(px, y, RB, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px - 3, y - 3.5, RB - 6.5, -2.5, -1.35); ctx.stroke();

    /* one velocity arrow, above; acceleration below, so they never overlap */
    if (Math.abs(now.v) > 0.05) {
      const len = clamp(now.v * 7, -300, 300);
      const ay = y - 32;
      if (carrow(ctx, px, ay, px + len, ay, { color: P.accent, width: 2.4, head: 9, min: 7 })) {
        ctext(ctx, 'v', px + len + Math.sign(len) * 9, ay + 5,
          { font: P.sym(14), color: P.accent, align: len > 0 ? 'left' : 'right', halo: P.bg });
      }
    }
    if (Math.abs(aNow) > 0.02) {
      const len = clamp(aNow * 16, -220, 220);
      const ay = y + 58;
      if (carrow(ctx, px, ay, px + len, ay, { color: P.text, width: 2.2, head: 8, min: 7 })) {
        ctext(ctx, 'a', px + len + Math.sign(len) * 9, ay + 5,
          { font: P.sym(14), color: P.text, align: len > 0 ? 'left' : 'right', halo: P.bg });
      }
    }
  }

  /* ------------------------------------------------------------- loop */

  const anim = loop(dt => {
    if (!st.playing) return;
    st.t += dt * st.speed;
    if (st.t > T_END) st.t -= T_END;
    sScrub.set(st.t);
    redraw();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  /**
   * Lay the plots out at the width they are actually rendered at, so one
   * viewBox unit is one CSS pixel and the type, handles and line weights
   * keep the size they were designed at on a phone as well as a laptop.
   */
  function fitAll() {
    P = palette(root);
    const cw = Math.round(pS.svg.clientWidth || root.clientWidth || GW);
    if (cw > 0) {
      const w = clamp(cw, 340, GW);
      pS.setSize(w, GH); pV.setSize(w, GH); pA.setSize(w, GH + 24);
      // the track is mostly a metre scale, so it keeps 1 unit = 1 CSS pixel
      kv.setLogical(w, w < 700 ? 132 : KH);
    }
    kv.fit();
    redraw();
  }
  fitAll();

  if (typeof ResizeObserver !== 'undefined') {
    let w = 0;
    const ro = new ResizeObserver(entries => {
      const nw = Math.round(entries[0].contentRect.width);
      if (nw && nw !== w) { w = nw; fitAll(); }
    });
    ro.observe(root);
    onDestroy(() => ro.disconnect());
  }

  /* --------------------------------------------------- public surface */

  return {
    destroy,
    /** exposed for testing: the exact analytic state at time t */
    _stateAt: t => stateAt(st.v, nodesOf(st.v, st.s0), t),
    _model: () => ({ v: st.v.slice(), s0: st.s0, a: accelsOf(st.v),
                     s: nodesOf(st.v, st.s0), DT, N, times }),
    _set: (v, s0) => { st.v = v.slice(); st.s0 = s0; st.sDomain = null; redraw(); },
    _drag: (kind, i, value) => {
      if (kind === 'v') setV(i, value); else if (kind === 'a') setA(i, value); else setS(i, value);
      redraw();
    },
  };
}
