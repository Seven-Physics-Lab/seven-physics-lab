/* ============================================================================
 * A1-2  Projectile Launcher with Drag Toggle
 * IB Physics A.1 Kinematics
 *
 * Fire a projectile at any speed, angle and launch height, on any planet,
 * with or without air resistance. The no-drag path is always available as a
 * ghost so the effect of drag is a comparison rather than an assertion.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * No drag (k = 0). Solved in closed form, not integrated, so the ghost curve
 * and every derived quantity are exact:
 *
 *     x(t) = u cos(theta) t
 *     y(t) = h + u sin(theta) t - g t^2 / 2
 *     time of flight   t_f = [ u sin(theta) + sqrt( (u sin theta)^2 + 2gh ) ] / g
 *     apex height      H   = h + (u sin theta)^2 / (2g)
 *     range            R   = u cos(theta) * t_f
 *
 * With drag (k > 0). Air resistance on a projectile at ordinary speeds is
 * quadratic in speed, not linear, so the model is
 *
 *     F_drag = -1/2 rho C_d A |v| v          and dividing through by mass,
 *     a = -g j - k |v| v      with  k = rho C_d A / (2m)   [units m^-1]
 *
 * That has no closed-form solution, so it is integrated with classical
 * fourth-order Runge-Kutta at a fixed 0.5 ms step. The step is small enough
 * that halving it changes the range by less than a millimetre, which the
 * verification script checks rather than assumes. Landing is not taken as
 * "the first sample below ground": the crossing time is refined by bisection
 * on the interpolated path, and the apex likewise from v_y = 0.
 *
 * Terminal speed for this model is sqrt(g/k), shown on screen whenever drag
 * is switched on, because it is the physical anchor for what k means.
 *
 * The trajectory is computed once whenever a control changes and then played
 * back by interpolation, so the animation cannot drift away from the physics
 * and stays smooth regardless of frame rate.
 * ==========================================================================*/

import {
  createRoot, el, svg, heading, panelBox, controls, note, button, select,
  slider, readouts, Plot, loop, fmt, textScale,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const DT     = 0.0005;        // s, RK4 step for the drag solution
const SAMPLE = 0.004;         // s, spacing of stored samples for playback
const T_MAX  = 60;            // s, safety cap

const GRAVITY = {
  earth:   { label: 'Earth · 9.81 m s⁻²',   g: 9.81 },
  moon:    { label: 'Moon · 1.62 m s⁻²',    g: 1.62 },
  mars:    { label: 'Mars · 3.72 m s⁻²',    g: 3.72 },
  jupiter: { label: 'Jupiter · 24.8 m s⁻²', g: 24.79 },
};

/* ====================================================================== *
 * the physics
 * ====================================================================== */

/** exact projectile motion with no air resistance */
function analytic({ u, theta, h, g }) {
  const th = theta * Math.PI / 180;
  const ux = u * Math.cos(th), uy = u * Math.sin(th);

  const tf = (uy + Math.sqrt(uy * uy + 2 * g * h)) / g;
  const tApex = Math.max(0, uy / g);
  const apex = h + (uy * uy) / (2 * g);
  const range = ux * tf;

  const at = t => ({
    t, x: ux * t, y: h + uy * t - 0.5 * g * t * t, vx: ux, vy: uy - g * t,
  });

  const pts = [];
  for (let t = 0; t < tf; t += SAMPLE) pts.push(at(t));
  pts.push(at(tf));

  const end = at(tf);
  return {
    pts, tf, range, apex, tApex,
    impactSpeed: Math.hypot(end.vx, end.vy),
    impactAngle: Math.atan2(-end.vy, end.vx) * 180 / Math.PI,
    exact: true,
  };
}

/** one RK4 step of  x' = vx, y' = vy, v' = -g j - k |v| v */
function rk4(s, g, k, dt) {
  const d = st => {
    const sp = Math.hypot(st.vx, st.vy);
    return { x: st.vx, y: st.vy, vx: -k * sp * st.vx, vy: -g - k * sp * st.vy };
  };
  const add = (a, b, f) => ({
    x: a.x + b.x * f, y: a.y + b.y * f, vx: a.vx + b.vx * f, vy: a.vy + b.vy * f,
  });
  const k1 = d(s);
  const k2 = d(add(s, k1, dt / 2));
  const k3 = d(add(s, k2, dt / 2));
  const k4 = d(add(s, k3, dt));
  return {
    x:  s.x  + dt / 6 * (k1.x  + 2 * k2.x  + 2 * k3.x  + k4.x),
    y:  s.y  + dt / 6 * (k1.y  + 2 * k2.y  + 2 * k3.y  + k4.y),
    vx: s.vx + dt / 6 * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
    vy: s.vy + dt / 6 * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
  };
}

/** projectile motion with quadratic drag, integrated */
function integrate({ u, theta, h, g, k }, dt = DT) {
  const th = theta * Math.PI / 180;
  let s = { x: 0, y: h, vx: u * Math.cos(th), vy: u * Math.sin(th) };
  let t = 0;

  const pts = [{ t: 0, ...s }];
  let nextSample = SAMPLE;
  let apex = h, tApex = 0;
  let prev = s, prevT = 0;

  while (t < T_MAX) {
    const next = rk4(s, g, k, dt);
    const nt = t + dt;

    // apex, refined from the v_y sign change rather than the sample grid
    if (s.vy >= 0 && next.vy < 0) {
      const f = s.vy / (s.vy - next.vy);           // linear in vy over one step
      const st = rk4(s, g, k, dt * f);
      if (st.y > apex) { apex = st.y; tApex = t + dt * f; }
    }

    // ground crossing, refined by bisection on the step
    if (next.y <= 0 && nt > 0) {
      let lo = 0, hi = dt;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (rk4(s, g, k, mid).y > 0) lo = mid; else hi = mid;
      }
      const land = rk4(s, g, k, hi);
      const tf = t + hi;
      pts.push({ t: tf, ...land });
      return {
        pts, tf, range: land.x, apex, tApex,
        impactSpeed: Math.hypot(land.vx, land.vy),
        impactAngle: Math.atan2(-land.vy, land.vx) * 180 / Math.PI,
        exact: false,
      };
    }

    prev = s; prevT = t;
    s = next; t = nt;

    while (nextSample <= t && nextSample < T_MAX) {
      const f = (nextSample - prevT) / dt;
      pts.push({ t: nextSample, ...rk4(prev, g, k, dt * f) });
      nextSample += SAMPLE;
    }
  }
  return {
    pts, tf: t, range: s.x, apex, tApex,
    impactSpeed: Math.hypot(s.vx, s.vy),
    impactAngle: Math.atan2(-s.vy, s.vx) * 180 / Math.PI, exact: false,
  };
}

function solve(p) { return p.k > 0 ? integrate(p) : analytic(p); }

/** state at any time, by interpolation between stored samples */
function sampleAt(sol, t) {
  const p = sol.pts;
  if (t <= 0) return p[0];
  if (t >= sol.tf) return p[p.length - 1];
  let i = Math.min(Math.floor(t / SAMPLE), p.length - 2);
  while (i + 1 < p.length - 1 && p[i + 1].t < t) i++;
  while (i > 0 && p[i].t > t) i--;
  const a = p[i], b = p[i + 1];
  const f = (t - a.t) / (b.t - a.t || 1);
  return {
    t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
    vx: a.vx + (b.vx - a.vx) * f, vy: a.vy + (b.vy - a.vy) * f,
  };
}

/* ====================================================================== *
 * mount
 * ====================================================================== */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a1-projectile',
    title: 'Projectile launcher with air resistance',
    theme: options.theme,
    shadow: options.shadow,
  });

  const st = {
    u: 30, theta: 45, h: 0, g: GRAVITY.earth.g, k: 0,
    t: 0, playing: true, speed: 1,
    showGhost: true, showComponents: true, showDots: true,
    sol: null, ghost: null, view: null, best: null,
  };

  /* ------------------------------------------------------------- scene */

  const SW_MAX = 1120, SH_MIN = 240, SH_MAX = 430;
  let SW = SW_MAX;                 // re-measured on resize, see fitAll
  const sceneSvg = svg('svg', {
    viewBox: `0 0 ${SW} ${SH_MAX}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'img', 'aria-label': 'Projectile trajectory',
  });
  const gScene = svg('g');
  sceneSvg.appendChild(gScene);

  /* ------------------------------------------ range against angle plot */

  const pSweep = new Plot({
    width: 1120, height: 210, pad: { l: 62, r: 18, t: 24, b: 38 },
    xDomain: [0, 90], yDomain: [0, 100], xTicks: 6, yTicks: 4,
    xLabel: 'θ (°)', yLabel: 'R (m)',
    tickFmt: v => String(Math.round(v)),
    ariaLabel: 'Range against launch angle',
  });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'R',  label: 'Range <i>R</i>' },
    { key: 'H',  label: 'Maximum height <i>H</i>' },
    { key: 'T',  label: 'Time of flight <i>t</i><sub>f</sub>' },
    { key: 'S',  label: 'Impact speed' },
    { key: 'A',  label: 'Impact angle below the horizontal' },
    { key: 'B',  label: 'Best launch angle for these settings' },
    { key: 'G',  label: 'Range with no drag, and what drag costs' },
    { key: 'V',  label: 'Terminal speed √(<i>g</i>/<i>k</i>)' },
  ]);

  /* ---------------------------------------------------------- controls */

  const recompute = () => { solveAll(); st.t = 0; redraw(); };

  const sU = slider({
    label: '<i>u</i>', min: 2, max: 50, step: 1, value: st.u,
    format: v => `${v.toFixed(0)} m s⁻¹`, onInput: v => { st.u = v; recompute(); },
  });
  const sTheta = slider({
    label: '<i>θ</i>', min: 0, max: 90, step: 1, value: st.theta,
    format: v => `${v.toFixed(0)}°`, onInput: v => { st.theta = v; recompute(); },
  });
  const sH = slider({
    label: '<i>h</i>', min: 0, max: 40, step: 1, value: st.h,
    format: v => `${v.toFixed(0)} m`, onInput: v => { st.h = v; recompute(); },
  });
  const sK = slider({
    label: '<i>k</i>', min: 0, max: 0.02, step: 0.0005, value: 0,
    format: v => v === 0 ? 'none' : `${v.toFixed(4)} m⁻¹`,
    onInput: v => { st.k = v; recompute(); },
  });
  const sS = slider({
    label: 'sim speed', word: true, min: 0.25, max: 2, step: 0.25, value: 1,
    format: v => `×${v.toFixed(2)}`, onInput: v => { st.speed = v; },
  });
  const selG = select({
    label: 'gravity:', value: 'earth',
    options: Object.entries(GRAVITY).map(([k, p]) => ({ value: k, label: p.label })),
    onChange: key => { st.g = GRAVITY[key].g; recompute(); },
  });

  const bPlay = button({
    label: '⏸ Pause', pressed: true,
    onClick: b => {
      st.playing = !st.playing;
      b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
      b.setAttribute('aria-pressed', String(st.playing));
    },
  });
  const bFire = button({
    label: 'Fire again',
    onClick: () => { st.t = 0; st.playing = true;
                     bPlay.setLabel('⏸ Pause'); bPlay.setPressed(true); redraw(); },
  });
  const bGhost = button({
    label: 'No-drag ghost', pressed: true,
    onClick: b => { st.showGhost = !st.showGhost;
                    b.setAttribute('aria-pressed', String(st.showGhost)); redraw(); },
  });
  const bComp = button({
    label: 'Velocity components', pressed: true,
    onClick: b => { st.showComponents = !st.showComponents;
                    b.setAttribute('aria-pressed', String(st.showComponents)); redraw(); },
  });
  const bDots = button({
    label: 'Equal-time trace', pressed: true,
    onClick: b => { st.showDots = !st.showDots;
                    b.setAttribute('aria-pressed', String(st.showDots)); redraw(); },
  });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Projectile Launcher',
            'with quadratic air resistance — compare the path with and without drag'),
    panelBox('Flight — the trajectory, drawn at one scale on both axes', sceneSvg),
    panelBox('Range against launch angle, for the settings below', pSweep.svg),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bFire.node, bGhost.node, bComp.node, bDots.node])]),
    controls([selG.node, sU.node, sTheta.node, sH.node, sK.node, sS.node]),
    out.node,
    note('<b>Physics.</b> With no air resistance the motion is solved in closed form, not ' +
         'integrated, so the dashed ghost is exact. Air resistance on a projectile at ' +
         'ordinary speeds goes as the <em>square</em> of the speed, so the model is ' +
         '<i>a</i> = −<i>g</i>ĵ − <i>k</i>|<b>v</b>|<b>v</b> with ' +
         '<i>k</i> = <i>ρC</i><sub>d</sub><i>A</i>/2<i>m</i>, which has no closed form and ' +
         'is integrated with 4th-order Runge–Kutta at a 0.5 ms step. Watch the ' +
         'equal-time dots: with no drag they are spaced <b>equally in the horizontal ' +
         'direction</b>, because there is no horizontal force. Turn drag on and the ' +
         'horizontal spacing closes up, the path stops being symmetric, and the projectile ' +
         'falls more steeply than it rose. The best launch angle drops below 45° as well.')
  );

  /* ----------------------------------------------------------- styling */

  const cssId = 'ibs-a1-projectile-v3';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent = `
.ibs .a1p-scene{ padding:6px 4px 2px; }
.ibs .a1p-scene svg, .ibs .a1p-sweep svg{ display:block; width:100%; height:auto; overflow:visible; }
.ibs .a1p-halo{ paint-order:stroke; stroke:var(--ibs-bg); stroke-width:3.5px;
                stroke-linejoin:round; }
`;
    document.head.appendChild(s);
  }
  sceneSvg.parentElement.classList.add('a1p-scene');
  pSweep.svg.parentElement.classList.add('a1p-sweep');

  /* =====================================================================
   * solving and mapping
   * ===================================================================*/

  function solveAll() {
    const p = { u: st.u, theta: st.theta, h: st.h, g: st.g, k: st.k };
    st.sol = solve(p);
    st.ghost = st.k > 0 ? analytic(p) : null;

    // world extents, uniform scale so angles and the shape stay truthful
    const xMax = Math.max(st.sol.range, st.ghost ? st.ghost.range : 0, 1) * 1.06;
    const yMax = Math.max(st.sol.apex, st.ghost ? st.ghost.apex : 0, st.h, 1) * 1.18;

    // Uniform scale on both axes, so the launch angle and the shape of the
    // path are drawn truthfully. The box height then follows the trajectory
    // instead of leaving a band of empty sky above a flat shot.
    const L = 56, R = 20, T = 30, B = 46;
    const availW = SW - L - R;
    let scale = availW / xMax;
    let SH = Math.round(yMax * scale) + T + B;
    if (SH > SH_MAX) { SH = SH_MAX; scale = (SH - T - B) / yMax; }
    if (SH < SH_MIN) SH = SH_MIN;
    sceneSvg.setAttribute('viewBox', `0 0 ${SW} ${SH}`);

    // a steep, short trajectory cannot fill the width at uniform scale, so
    // centre it rather than leaving it stranded against the left edge
    const usedW = xMax * scale;
    const x0 = L + Math.max(0, (availW - usedW) / 2);
    const y0 = SH - B;
    st.view = {
      scale, x0, y0, xMax, yMax, T, SH,
      X: x => x0 + x * scale,
      Y: y => y0 - y * scale,
    };
    scheduleSweep();
  }

  let sweepTimer = 0;
  function scheduleSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(drawSweep, 110);
  }
  onDestroy(() => clearTimeout(sweepTimer));

  function niceStep(span, target) {
    const raw = span / target;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
    return 10 * p;
  }

  /* =====================================================================
   * drawing
   * ===================================================================*/

  const INK = 'var(--ibs-text)', TEAL = 'var(--ibs-accent)', MUTED = 'var(--ibs-muted)';

  function pathOf(sol, V, upTo = Infinity) {
    const d = [];
    for (const p of sol.pts) {
      if (p.t > upTo) break;
      d.push(`${d.length ? 'L' : 'M'}${V.X(p.x).toFixed(2)},${V.Y(p.y).toFixed(2)}`);
    }
    if (upTo < sol.tf && upTo > 0) {
      const e = sampleAt(sol, upTo);
      d.push(`L${V.X(e.x).toFixed(2)},${V.Y(e.y).toFixed(2)}`);
    }
    return d.join('');
  }

  function arrow(x1, y1, x2, y2, color, w = 2.4, head = 6.5) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const g = svg('g');
    g.append(
      svg('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }),
      svg('path', {
        d: `M${x2},${y2} L${x2 - head * Math.cos(a - 0.4)},${y2 - head * Math.sin(a - 0.4)} ` +
           `M${x2},${y2} L${x2 - head * Math.cos(a + 0.4)},${y2 - head * Math.sin(a + 0.4)}`,
        stroke: color, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round',
      })
    );
    return g;
  }

  function redraw() {
    textScale(root, SW, sceneSvg);
    if (!st.sol) solveAll();
    const V = st.view, sol = st.sol, g = svg('g');
    const now = sampleAt(sol, st.t);

    /* ---- ground and scale --------------------------------------- */
    g.append(svg('line', {
      x1: V.X(0) - 36, x2: SW - 10, y1: V.Y(0), y2: V.Y(0),
      stroke: INK, 'stroke-width': 2.2, 'stroke-linecap': 'round',
    }));

    const xStep = niceStep(V.xMax, 9);
    for (let x = 0; x <= V.xMax; x += xStep) {
      g.append(
        svg('line', { x1: V.X(x), x2: V.X(x), y1: V.Y(0), y2: V.Y(0) + 7,
                      stroke: 'var(--ibs-accent-line)', 'stroke-width': 1.3 }),
        svg('text', { x: V.X(x), y: V.Y(0) + 21, 'text-anchor': 'middle',
                      class: 'ibs-tick', text: String(+x.toFixed(1)) })
      );
    }
    g.append(svg('text', { x: SW - 10, y: V.Y(0) + 38, 'text-anchor': 'end',
                           class: 'ibs-axis-title', text: 'x (m)' }));

    /* ---- launcher ------------------------------------------------ */
    if (st.h > 0) {
      g.append(svg('rect', {
        x: V.X(0) - 17, y: V.Y(st.h), width: 24, height: st.h * V.scale,
        fill: 'var(--ibs-accent-soft)', stroke: INK, 'stroke-width': 1.2, rx: 2,
      }));
      g.append(svg('text', { x: V.X(0) - 24, y: V.Y(st.h / 2), 'text-anchor': 'end',
                             class: 'ibs-tick a1p-halo', text: `h = ${fmt(st.h, 0)} m` }));
    }
    const barrel = 34;
    const th = st.theta * Math.PI / 180;
    g.append(svg('line', {
      x1: V.X(0), y1: V.Y(st.h),
      x2: V.X(0) + barrel * Math.cos(th), y2: V.Y(st.h) - barrel * Math.sin(th),
      stroke: INK, 'stroke-width': 7, 'stroke-linecap': 'round',
    }));
    g.append(svg('path', {
      d: `M${V.X(0) + 22},${V.Y(st.h)} A22,22 0 0 0 ${V.X(0) + 22 * Math.cos(th)},${V.Y(st.h) - 22 * Math.sin(th)}`,
      fill: 'none', stroke: MUTED, 'stroke-width': 1.2,
    }));
    g.append(svg('text', {
      x: V.X(0) + 38 * Math.cos(th / 2), y: V.Y(st.h) - 38 * Math.sin(th / 2) + 4,
      class: 'a1p-halo', 'font-size': 13, 'font-style': 'italic',
      'font-family': 'var(--ibs-serif)', 'font-weight': 600, fill: INK,
      text: `${fmt(st.theta, 0)}°`,
    }));

    /* ---- ghost (no drag) ----------------------------------------- */
    if (st.ghost && st.showGhost) {
      g.append(svg('path', {
        d: pathOf(st.ghost, V), fill: 'none', stroke: INK,
        'stroke-width': 1.6, 'stroke-dasharray': '6 4', opacity: 0.45,
      }));
      const gh = sampleAt(st.ghost, Math.min(st.t, st.ghost.tf));
      g.append(svg('circle', { cx: V.X(gh.x), cy: V.Y(gh.y), r: 5,
                               fill: 'none', stroke: INK, 'stroke-width': 1.8, opacity: 0.6 }));
      g.append(svg('text', {
        x: V.X(st.ghost.range), y: V.Y(0) - 9, 'text-anchor': 'middle',
        class: 'ibs-tick a1p-halo', fill: MUTED,
        text: `no drag: ${fmt(st.ghost.range, 1)} m`,
      }));
    }

    /* ---- flown path and the path still to come -------------------- */
    g.append(svg('path', {
      d: pathOf(sol, V), fill: 'none', stroke: TEAL,
      'stroke-width': 1.5, opacity: 0.26,
    }));
    g.append(svg('path', {
      d: pathOf(sol, V, st.t), fill: 'none', stroke: TEAL,
      'stroke-width': 3, 'stroke-linecap': 'round',
    }));

    /* ---- equal-time trace ---------------------------------------- */
    if (st.showDots) {
      const step = niceStep(sol.tf, 12);
      for (let t = step; t < sol.tf - 1e-9; t += step) {
        const p = sampleAt(sol, t);
        g.append(svg('circle', {
          cx: V.X(p.x), cy: V.Y(p.y), r: 2.9,
          fill: t <= st.t ? TEAL : 'var(--ibs-bg)',
          stroke: TEAL, 'stroke-width': 1.4,
        }));
      }
      g.append(svg('text', {
        x: V.X(0) - 36, y: V.T - 9, class: 'ibs-tick',
        text: `one dot every ${fmt(step, 2)} s`,
      }));
    }

    /* ---- apex ----------------------------------------------------- */
    if (sol.apex > st.h + 1e-6) {
      const ap = sampleAt(sol, sol.tApex);
      g.append(
        svg('line', { x1: Math.max(8, V.X(0) - 30), x2: V.X(ap.x),
                      y1: V.Y(sol.apex), y2: V.Y(sol.apex),
                      stroke: INK, 'stroke-width': 1.1, 'stroke-dasharray': '4 4', opacity: 0.55 }),
        svg('text', { x: Math.max(10, V.X(0) - 28), y: V.Y(sol.apex) - 7,
                      class: 'ibs-tick a1p-halo', fill: INK,
                      text: `apex ${fmt(sol.apex, 1)} m` })
      );
    }

    /* ---- the projectile and its velocity ------------------------- */
    const px = V.X(now.x), py = V.Y(now.y);
    const vScale = 3.0;
    if (st.showComponents && st.t < sol.tf) {
      // Drawn as a right-angled triangle rather than three arrows from one
      // point: v_x from the projectile, v_y from the tip of v_x, and the
      // resultant as the hypotenuse. That is the textbook construction and
      // it keeps the three labels from ever overlapping.
      const ex = px + now.vx * vScale, ey = py - now.vy * vScale;
      g.append(arrow(px, py, ex, py, INK, 1.9, 5.5));
      g.append(arrow(ex, py, ex, ey, INK, 1.9, 5.5));
      g.append(svg('text', {
        x: (px + ex) / 2, y: py + 17, 'text-anchor': 'middle',
        class: 'ibs-tick a1p-halo', fill: INK, text: `vₓ = ${fmt(now.vx, 1)}`,
      }));
      if (Math.abs(now.vy) > 0.3) g.append(svg('text', {
        x: ex + 8, y: (py + ey) / 2 + 4, class: 'ibs-tick a1p-halo', fill: INK,
        text: `vᵧ = ${fmt(now.vy, 1)}`,
      }));
    }

    if (st.t < sol.tf) {
      g.append(arrow(px, py, px + now.vx * vScale, py - now.vy * vScale, TEAL, 2.8, 7.5));
    }
    // the projectile: the same polished sphere as the other simulations
    const grad = svg('radialGradient', { id: 'a1p-bob', cx: '32%', cy: '30%', r: '75%' });
    grad.append(
      svg('stop', { offset: '0%',  'stop-color': '#dceef0' }),
      svg('stop', { offset: '28%', 'stop-color': '#5fa3ab' }),
      svg('stop', { offset: '70%', 'stop-color': '#005F6A' }),
      svg('stop', { offset: '100%', 'stop-color': '#00272d' })
    );
    g.append(svg('defs', {}, [grad]));
    g.append(svg('circle', { cx: px, cy: py, r: 8, fill: 'url(#a1p-bob)',
                             stroke: INK, 'stroke-width': 1.4 }));

    /* ---- the equation of motion, top right ----------------------- */
    g.append(svg('text', {
      x: SW - 10, y: V.T - 9, 'text-anchor': 'end', class: 'ibs-tick',
      text: st.k > 0 ? 'a = −g ĵ − k|v|v   (integrated)' : 'a = −g ĵ   (exact)',
    }));

    gScene.replaceChildren(g);

    /* ---- readouts ------------------------------------------------- */
    const lost = st.ghost ? (1 - sol.range / st.ghost.range) * 100 : 0;
    out.setAll({
      R: `${fmt(sol.range, 2)} m`,
      H: `${fmt(sol.apex, 2)} m`,
      T: `${fmt(sol.tf, 3)} s`,
      S: `${fmt(sol.impactSpeed, 2)} m s⁻¹`,
      A: `${fmt(sol.impactAngle, 1)}°`,
      B: st.best ? `${st.best.a}°  (R = ${fmt(st.best.r, 2)} m)` : 'computing…',
      G: st.ghost ? `${fmt(st.ghost.range, 2)} m  ·  drag costs ${fmt(lost, 1)}%`
                  : 'no drag set, so this IS the no-drag range',
      V: st.k > 0 ? `${fmt(Math.sqrt(st.g / st.k), 1)} m s⁻¹`
                  : '∞  (no drag)',
    });
  }

  /* --------------------------------------------- range against angle */

  function drawSweep() {
    const pts = [];
    let best = { a: 0, r: -1 };
    for (let a = 0; a <= 90; a += 1) {
      const p = { u: st.u, theta: a, h: st.h, g: st.g, k: st.k };
      const r = st.k > 0 ? integrate(p, 0.004).range : analytic(p).range;
      pts.push([a, r]);
      if (r > best.r) best = { a, r };
    }
    st.best = best;
    const rMax = Math.max(...pts.map(p => p[1]));
    pSweep.setDomain([0, 90], [0, Math.ceil(rMax / 10) * 10 || 10]);
    pSweep.clear(); pSweep.clearOverlay();
    pSweep.area(pts, { color: TEAL, opacity: 0.12 });
    pSweep.line(pts, { color: TEAL, width: 2.4 });
    pSweep.vline(best.a, { color: INK, dash: '4 4', label: `best angle ${best.a}°` });
    pSweep.dot(st.theta, pts[Math.round(st.theta)][1], { color: TEAL, r: 5 });
    pSweep.gOver.appendChild(svg('text', {
      x: pSweep.w - pSweep.pad.r, y: pSweep.pad.t - 10, 'text-anchor': 'end',
      'font-size': 11.5, 'font-weight': 600, fill: TEAL,
      text: st.k > 0
        ? 'drag pulls the best angle below 45°'
        : (st.h > 0 ? 'launched from a height, so the best angle is below 45°'
                    : 'exactly 45° with no drag and h = 0'),
    }));
    // the readouts quote the best angle, so refresh it once it is known
    out.set('B', `${best.a}°  (R = ${fmt(best.r, 2)} m)`);
  }

  /* ------------------------------------------------------------- loop */

  const anim = loop(dt => {
    if (!st.playing) return;
    st.t += dt * st.speed;
    if (st.t > st.sol.tf + 0.7) st.t = 0;      // brief pause on the ground
    redraw();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  /**
   * Lay the scene and the sweep out at the width they are actually rendered
   * at, so one viewBox unit is one CSS pixel and the type and line weights
   * keep the size they were designed at on a phone as well as a laptop.
   */
  function fitAll() {
    const cw = Math.round(sceneSvg.clientWidth || root.clientWidth || SW_MAX);
    if (cw > 0) SW = Math.max(340, Math.min(cw, SW_MAX));
    pSweep.setSize(SW, SW < 700 ? 190 : 210);
    solveAll();
    redraw();
  }
  fitAll();

  if (typeof ResizeObserver !== 'undefined') {
    let w = 0;
    const ro = new ResizeObserver(e => {
      const nw = Math.round(e[0].contentRect.width);
      if (nw && nw !== w) { w = nw; fitAll(); }
    });
    ro.observe(root);
    onDestroy(() => ro.disconnect());
  }

  /* -------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => { Object.assign(st, p); solveAll(); if (p.t === undefined) st.t = 0; redraw(); },
    _solve: p => solve(p),
    _analytic: p => analytic(p),
    _integrate: (p, dt) => integrate(p, dt),
    _summary: () => ({
      range: st.sol.range, apex: st.sol.apex, tf: st.sol.tf,
      impactSpeed: st.sol.impactSpeed, impactAngle: st.sol.impactAngle,
    }),
  };
}
