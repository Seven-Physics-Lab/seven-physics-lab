/* ============================================================================
 * A3-1  The Skate Park — a body on a track it is free to leave
 * IB Physics A.3 Work, energy and power
 *
 * The usual treatment of this topic is a sum. You are given a height, you
 * write mgh = ½mv², you get a speed, and you move on. It works, and it
 * teaches almost nothing about why it works, because the equation is handed
 * over as a rule rather than arrived at as a consequence. Worse, it quietly
 * suggests that the track is irrelevant — that all a hill does is supply a
 * height — when in fact the track is pushing on the skater the whole way
 * round, and how hard it pushes is the most interesting thing in the topic.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does not contain the conservation of energy. It is not asserted
 * anywhere, it is not used to advance anything, and no quantity is obtained
 * by rearranging it. It does not contain v² = gr, or "the minimum height to
 * get round a loop is 2.5r", or "the skater leaves the hill where mg cos θ
 * equals mv²/r", or a range formula for the jump, or a terminal-speed result
 * for the slope. ½mv² and mgh appear in it exactly once each, in the routine
 * that draws the energy chart, as things to MEASURE — never as things to
 * solve.
 *
 * What it contains is Newton's second law, resolved along the track and
 * across it, and one sentence of geometry: a track can push, and cannot
 * pull.
 *
 *     the skater's place on the track is an arc length s, and v = ṡ
 *     the curve gives a unit tangent T̂, a unit normal N̂, and a curvature κ
 *     acceleration        a = v̇ T̂ + v²κ N̂          (that is just calculus)
 *
 *     across the track    m v²κ = m g·N̂ + N        ⟹  N = m v²κ + m g N̂_y
 *     along the track     m v̇   = m g·T̂ + f
 *     friction            f = −μ N sign(v)
 *     and the one rule    N ≥ 0, or the skater is no longer on the track
 *
 * Everything the topic is famous for falls out of those four lines.
 *
 *   · At the top of the loop N̂ points DOWN, so N̂_y = −1 and the push is
 *     mv²κ − mg. Go slowly enough and that is negative, which the track
 *     cannot supply, so the skater comes off. Nobody typed v² = gr.
 *   · Over the crest of a hill the curvature has the other sign, so the push
 *     is mg − mv²|κ|, and now it is going too FAST that takes the skater off.
 *     Same line of code, opposite conclusion.
 *   · In a valley the track has to push harder than the weight, so the
 *     friction — which is μ times how hard the track pushes — is bigger than
 *     the textbook μmg cos θ. The panel will run it both ways and show you
 *     the difference, which is a real effect and not a rounding error.
 *   · The normal force does no work, ever, because it is at right angles to
 *     the velocity by construction. That is why the shape of the track drops
 *     out of the energy sum — not because the track is unimportant, but
 *     because the thing it does is always sideways.
 *
 * The energy chart is a measurement instrument pointed at the simulation. It
 * reads ½mv² and mgh off the state, and the heat off the running total of
 * friction work, and draws them. That their sum is flat is the FINDING. If
 * the integrator were bad it would not be flat, and the verifier fits how
 * the flatness improves as the step shrinks: it goes as the square of it,
 * which is what a fourth-order method does on a curve whose BEND jumps at
 * every control point, and which is not what imposing a conservation law
 * would look like at all.
 *
 * WHAT IS EXAGGERATED, AND WHERE IT IS DECLARED
 *
 * Nothing about the mechanics. The one liberty is that a landing is
 * perfectly inelastic in the direction across the track: a skater who comes
 * down on a ramp loses the component of velocity into it and keeps the
 * component along it. Real wheels and real knees do something in between.
 * The energy that goes is accounted for — it is on the chart, labelled, and
 * it is why the total steps down when the skater lands rather than drifting.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, ctext, croundRect,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const MW = 1120;
const HT = 470, HT_SM = 420;        // the park, at most
const HE = 366, HE_SM = 430;        // the energy panel
const NARROW = 760;

const G0 = 9.81;

const M_LO = 20, M_HI = 120;        // kg
const MU_LO = 0, MU_HI = 0.35;
const G_LO = 1.6, G_HI = 14;        // m s⁻², the Moon to somewhere heavy

/* how finely the spline is sampled for the arc-length table */
const ARC_SEG = 64;                 // Gauss points per control-point span
const NEAR_N = 900;                 // samples used to find the nearest point

/* ====================================================================== *
 * 1. THE TRACK
 *
 * A Catmull–Rom spline through the control points. It is used because it
 * passes THROUGH the points rather than near them, so dragging a point
 * moves the track to where you put it, and because its derivatives are
 * available in closed form, which the mechanics needs: the tangent, the
 * normal and the curvature all come from the curve itself and not from
 * differencing the drawn polyline.
 * ====================================================================== */

/** the four Catmull–Rom basis weights and their first two derivatives */
function crW(t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1,
      -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2],
    [-1.5 * t2 + 2 * t - 0.5, 4.5 * t2 - 5 * t,
      -4.5 * t2 + 4 * t + 0.5, 1.5 * t2 - t],
    [-3 * t + 2, 9 * t - 5, -9 * t + 4, 3 * t - 1],
  ];
}

/** the four control points governing segment i, with the ends doubled */
function quad(pts, i) {
  const n = pts.length;
  const at = k => pts[clamp(k, 0, n - 1)];
  return [at(i - 1), at(i), at(i + 1), at(i + 2)];
}

/**
 * The curve at parameter u ∈ [0, n−1], with its first and second
 * derivatives with respect to u.
 */
export function curveAt(pts, u) {
  const n = pts.length;
  const uu = clamp(u, 0, n - 1);
  let i = Math.floor(uu);
  if (i > n - 2) i = n - 2;
  const t = uu - i;
  const q = quad(pts, i), w = crW(t);
  const o = { x: 0, y: 0, dx: 0, dy: 0, ddx: 0, ddy: 0, u: uu };
  for (let k = 0; k < 4; k++) {
    o.x += w[0][k] * q[k].x; o.y += w[0][k] * q[k].y;
    o.dx += w[1][k] * q[k].x; o.dy += w[1][k] * q[k].y;
    o.ddx += w[2][k] * q[k].x; o.ddy += w[2][k] * q[k].y;
  }
  return o;
}

/**
 * The local frame at u: the unit tangent, the unit normal, and the signed
 * curvature. The normal is the tangent turned a quarter turn the positive
 * way, which fixes the side of the track the skater rides on ONCE, from
 * the geometry of the curve, and not from which way the skater happens to
 * be travelling. That is the whole reason a loop works: going round it the
 * normal points inwards at the bottom and at the top, and the sign of
 * N̂_y flips on its own.
 */
export function frameAt(pts, u) {
  const c = curveAt(pts, u);
  const sp = Math.hypot(c.dx, c.dy) || 1e-12;
  const tx = c.dx / sp, ty = c.dy / sp;
  const kap = (c.dx * c.ddy - c.dy * c.ddx) / (sp * sp * sp);
  return { x: c.x, y: c.y, tx, ty, nx: -ty, ny: tx, kap, sp, u: c.u };
}

/* 8-point Gauss–Legendre on [0,1], for the arc length of a span */
const GX = [0.019855071751231884, 0.10166676129318664, 0.2372337950418355,
  0.40828267875217505, 0.5917173212478249, 0.7627662049581645,
  0.8983332387068134, 0.9801449282487681];
const GW = [0.05061426814518813, 0.11119051722668723, 0.15685332293894363,
  0.18134189168918097, 0.18134189168918097, 0.15685332293894363,
  0.11119051722668723, 0.05061426814518813];

/**
 * A track: the control points, plus a table mapping arc length to the
 * spline parameter, so the mechanics can work in metres along the track
 * while the geometry works in u.
 */
export function buildTrack(pts, per = 48) {
  const n = pts.length, spans = n - 1;
  const m = spans * per;
  const uOf = new Float64Array(m + 1);
  const sOf = new Float64Array(m + 1);
  for (let k = 0; k <= m; k++) uOf[k] = (k / m) * spans;
  let acc = 0;
  sOf[0] = 0;
  for (let k = 0; k < m; k++) {
    const a = uOf[k], b = uOf[k + 1], h = b - a;
    let q = 0;
    for (let j = 0; j < 8; j++) {
      const c = curveAt(pts, a + h * GX[j]);
      q += GW[j] * Math.hypot(c.dx, c.dy);
    }
    acc += q * h;
    sOf[k + 1] = acc;
  }
  /* a dense sample of the drawn curve, for finding the nearest point. Each
   * sample carries its arc length as well as its parameter, because a track
   * that crosses itself — a loop does — has two branches in the same place,
   * and the only thing that tells them apart is how far along they are. */
  const near = new Float64Array(NEAR_N * 4);
  const T0 = { pts, spans, uOf, sOf, m, L: acc };
  for (let k = 0; k < NEAR_N; k++) {
    const u = (k / (NEAR_N - 1)) * spans;
    const c = curveAt(pts, u);
    near[k * 4] = c.x; near[k * 4 + 1] = c.y; near[k * 4 + 2] = u;
    near[k * 4 + 3] = sAtU(T0, u);
  }
  T0.near = near;
  return T0;
}

/* 4-point Gauss–Legendre on [0,1], for the sliver inside one table cell */
const HX = [0.06943184420297371, 0.33000947820757187,
  0.6699905217924281, 0.9305681557970262];
const HW = [0.1739274225687269, 0.3260725774312731,
  0.3260725774312731, 0.1739274225687269];

/** the exact arc length from a to b, over an interval short enough for four points */
function sliver(pts, a, b) {
  const h = b - a;
  if (!(Math.abs(h) > 0)) return 0;
  let q = 0;
  for (let j = 0; j < 4; j++) {
    const c = curveAt(pts, a + h * HX[j]);
    q += HW[j] * Math.hypot(c.dx, c.dy);
  }
  return q * h;
}

/**
 * The spline parameter at arc length s. The table brackets it; Newton on
 * the exact integral finishes the job, because the mechanics is done in
 * metres along the track and a tangent taken at slightly the wrong place
 * is a tangent that quietly does work.
 */
export function uAtS(T, s) {
  const L = T.L;
  if (s <= 0) return 0;
  if (s >= L) return T.spans;
  let lo = 0, hi = T.m;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (T.sOf[mid] <= s) lo = mid; else hi = mid;
  }
  const uA = T.uOf[lo], uB = T.uOf[lo + 1];
  const s0 = T.sOf[lo], s1 = T.sOf[lo + 1];
  let u = uA + (s1 > s0 ? (s - s0) / (s1 - s0) : 0) * (uB - uA);
  for (let it = 0; it < 3; it++) {
    const err = s0 + sliver(T.pts, uA, u) - s;
    const c = curveAt(T.pts, u);
    const sp = Math.hypot(c.dx, c.dy);
    if (!(sp > 1e-12)) break;
    u = clamp(u - err / sp, uA, uB);
    if (Math.abs(err) < 1e-13) break;
  }
  return u;
}

/** and the arc length at a spline parameter, the other way round */
export function sAtU(T, u) {
  const uu = clamp(u, 0, T.spans);
  const g = (uu / T.spans) * T.m;
  const lo = clamp(Math.floor(g), 0, T.m - 1);
  return T.sOf[lo] + sliver(T.pts, T.uOf[lo], uu);
}

/** the frame at an arc length, which is what the mechanics actually asks for */
export function frameAtS(T, s) {
  return frameAt(T.pts, uAtS(T, s));
}

/**
 * The nearest point of the track to (x, y): a coarse sweep over the dense
 * sample, then a few Newton steps on d/du of the squared distance. Used to
 * put the skater back on the track after a flight, and to catch the skater
 * when the user drags it.
 */
export function nearest(T, x, y, sc, sr) {
  let best = -1, bd = Infinity;
  const win = sc != null && sr > 0;
  for (let k = 0; k < NEAR_N; k++) {
    if (win && Math.abs(T.near[k * 4 + 3] - sc) > sr) continue;
    const dx = T.near[k * 4] - x, dy = T.near[k * 4 + 1] - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = k; }
  }
  if (best < 0) return null;
  const uLo = win ? uAtS(T, Math.max(0, sc - sr)) : 0;
  const uHi = win ? uAtS(T, Math.min(T.L, sc + sr)) : T.spans;
  let u = T.near[best * 4 + 2];
  for (let it = 0; it < 6; it++) {
    const c = curveAt(T.pts, u);
    const ex = c.x - x, ey = c.y - y;
    const g1 = 2 * (ex * c.dx + ey * c.dy);
    const g2 = 2 * (c.dx * c.dx + c.dy * c.dy + ex * c.ddx + ey * c.ddy);
    if (!(Math.abs(g2) > 1e-12)) break;
    const step = clamp(-g1 / g2, -0.2, 0.2);
    u = clamp(u + step, uLo, uHi);
    if (Math.abs(step) < 1e-12) break;
  }
  const f = frameAt(T.pts, u);
  return { u, s: sAtU(T, u), f,
           /* how far off the track, on which side */
           d: (x - f.x) * f.nx + (y - f.y) * f.ny,
           along: (x - f.x) * f.tx + (y - f.y) * f.ty };
}

/* ====================================================================== *
 * 2. THE MECHANICS
 *
 * Four lines, and they are the whole model.
 * ====================================================================== */

/**
 * How hard the track is pushing, in newtons, positive meaning it pushes
 * the skater towards the side it rides on.
 *
 *     across the track:   m v² κ  =  m g·N̂  +  N
 *
 * With gravity (0, −g) this is N = m v² κ + m g N̂_y, and that single
 * expression is the whole of the loop, the whole of the hill crest, and
 * the reason the scales read more than your weight at the bottom of a dip.
 */
export function normalForce(m, v, g, fr) {
  return m * v * v * fr.kap + m * g * fr.ny;
}

/**
 * The friction force along the track. `honest` uses how hard the track is
 * really pushing; the other is the textbook μmg cos θ, which is the same
 * thing with the curvature term thrown away.
 */
export function frictionForce(m, v, g, fr, mu, honest) {
  if (!(mu > 0)) return { f: 0, N: 0 };
  const N = honest ? normalForce(m, v, g, fr) : m * g * fr.ny;
  const mag = mu * Math.abs(N);
  const dir = v > 0 ? -1 : v < 0 ? 1 : 0;
  return { f: mag * dir, N };
}

/**
 * The derivatives of (s, v) for a skater on the track.
 *
 *     along the track:    m v̇ = m g·T̂ + f
 *
 * with g·T̂ = −g T̂_y. Nothing else is in here.
 */
export function deriv(T, m, g, mu, honest, s, v) {
  const fr = frameAtS(T, s);
  const { f } = frictionForce(m, v, g, fr, mu, honest);
  return { ds: v, dv: -g * fr.ty + f / m, f, fr };
}

/** one classical Runge–Kutta step of the constrained motion */
export function rk4(T, m, g, mu, honest, s, v, h) {
  const k1 = deriv(T, m, g, mu, honest, s, v);
  const k2 = deriv(T, m, g, mu, honest, s + h / 2 * k1.ds, v + h / 2 * k1.dv);
  const k3 = deriv(T, m, g, mu, honest, s + h / 2 * k2.ds, v + h / 2 * k2.dv);
  const k4 = deriv(T, m, g, mu, honest, s + h * k3.ds, v + h * k3.dv);
  const ds = h / 6 * (k1.ds + 2 * k2.ds + 2 * k3.ds + k4.ds);
  const dv = h / 6 * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
  /* the heat is the friction force times the distance it was dragged over,
   * taken on the same step and by the same weights: ∫|f||v| dt */
  const q = k => Math.abs(k.f) * Math.abs(k.ds);
  const heat = h / 6 * (q(k1) + 2 * q(k2) + 2 * q(k3) + q(k4));
  return { s: s + ds, v: v + dv, heat };
}

/* ====================================================================== *
 * 3. THE PARKS
 *
 * Five tracks, as lists of points in metres with y measured up from the
 * ground. Every one of them is a set of control points and nothing else:
 * there is no analytic circle in the loop, only eight points arranged on
 * one, and the spline through them is what the skater actually rides.
 * The order of the points fixes the side the skater is on.
 * ====================================================================== */

function loopPoints(cx, cy, r, n) {
  const o = [];
  for (let k = 0; k <= n; k++) {
    const ph = -Math.PI / 2 + (k / n) * Math.PI * 2;
    o.push({ x: cx + r * Math.cos(ph) + (k / n) * 0.55,
             y: cy + r * Math.sin(ph) });
  }
  return o;
}

export const PARKS = {
  ramp: {
    name: 'a ramp',
    why: 'the plainest case — everything the skater arrives with came from '
       + 'the height it started at',
    pts: [{ x: 0.6, y: 7.2 }, { x: 3.0, y: 5.0 }, { x: 5.6, y: 2.4 },
          { x: 8.0, y: 0.9 }, { x: 11.0, y: 0.5 }, { x: 15.4, y: 0.5 }],
    start: 0.04, padR: 2.2,
  },
  valley: {
    name: 'a valley',
    why: 'it comes back up to the height it left, and with friction it does '
       + 'not — which is where the missing energy went',
    pts: [{ x: 0.7, y: 7.4 }, { x: 2.6, y: 3.4 }, { x: 4.6, y: 1.1 },
          { x: 7.4, y: 0.55 }, { x: 10.2, y: 1.1 }, { x: 12.2, y: 3.4 },
          { x: 14.1, y: 7.4 }],
    start: 0.03,
  },
  hills: {
    name: 'two hills',
    why: 'the second hill is lower than the first, and whether the skater '
       + 'clears it is a question about energy and nothing else',
    pts: [{ x: 0.6, y: 7.6 }, { x: 2.2, y: 3.6 }, { x: 3.7, y: 1.1 },
          { x: 5.3, y: 3.9 }, { x: 6.6, y: 5.6 }, { x: 8.0, y: 3.9 },
          { x: 9.6, y: 1.0 }, { x: 11.6, y: 2.4 }, { x: 13.2, y: 1.6 },
          { x: 15.2, y: 2.9 }],
    start: 0.03,
  },
  loop: {
    name: 'a loop',
    why: 'the track can push and cannot pull, so there is a speed below '
       + 'which the skater simply comes off the top. It is a spline through '
       + 'twelve points and not a circle, so its bend is tightest where the '
       + 'points are — which is where the top is, and the panel reports the '
       + 'bend it actually has there',
    pts: [{ x: 0.6, y: 8.2 }, { x: 2.4, y: 4.6 }, { x: 4.2, y: 1.5 },
          { x: 6.1, y: 0.55 },
          ...loopPoints(8.1, 2.65, 2.1, 12),
          { x: 11.2, y: 0.65 }, { x: 13.6, y: 1.0 }, { x: 15.4, y: 1.7 }],
    start: 0.02, padR: 1.6,
  },
  jump: {
    name: 'a jump',
    why: 'past the lip there is no track, so there is nothing to push — and '
       + 'a body with nothing pushing it does the one thing it can',
    pts: [{ x: 0.6, y: 7.6 }, { x: 2.6, y: 4.4 }, { x: 4.6, y: 1.6 },
          { x: 6.6, y: 0.6 }, { x: 8.4, y: 1.1 }, { x: 9.6, y: 2.4 },
          { x: 10.3, y: 3.6 }],
    start: 0.03, padR: 6.4, padT: 1.6,
  },
};

export const PARK_KEYS = ['ramp', 'valley', 'hills', 'loop', 'jump'];

/* ====================================================================== *
 * 4. THE PANEL
 * ====================================================================== */

export default function mountSkatePark(container, opts = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a3-skate-park', title: 'The skate park', theme: opts.theme || 'auto',
    shadow: !!opts.shadow,
  });

  const st = {
    park: 'ramp',
    pts: PARKS.ramp.pts.map(p => ({ ...p })),
    mass: 60, mu: 0, g: G0,
    honest: true,          // μN, or the textbook μmg cos θ
    bars: true,            // the energy view
    /* the skater */
    on: true,              // on the track, or in the air
    s: 0, v: 0,
    x: 0, y: 0, vx: 0, vy: 0,
    /* the books */
    heat: 0, land: 0, E0: 0,
    t: 0, playing: false, slow: false, loopRun: true, done: false, idle: 0,
    N: 0, fric: 0, flights: 0, landed: 0,
    hist: [],
  };

  let T = buildTrack(st.pts);
  const HIST = 900;

  /* ------------------------------------------------------------ energies */

  const kinetic = () => 0.5 * st.mass * (st.on ? st.v * st.v
    : st.vx * st.vx + st.vy * st.vy);
  const height = () => (st.on ? frameAtS(T, st.s).y : st.y);
  const potential = () => st.mass * st.g * height();
  const totalE = () => kinetic() + potential() + st.heat + st.land;

  /* -------------------------------------------------------------- the UI */

  const bPark = PARK_KEYS.map(k => button({
    label: PARKS[k].name, pressed: k === st.park,
    onClick: () => setPark(k),
  }));

  const bPlay = button({ label: 'Let it go', onClick: () => {
    if (st.done) reset();
    st.playing = !st.playing; syncButtons();
  } });
  const bSlow = button({ label: 'Slow motion', pressed: false, onClick: () => {
    st.slow = !st.slow; syncButtons();
  } });
  const bAgain = button({ label: 'Put it back', onClick: () => {
    reset(); render();
  } });
  const bLoop = button({ label: 'Repeat', pressed: true, onClick: () => {
    st.loopRun = !st.loopRun; syncButtons();
  } });
  const bMu = button({ label: 'Friction: the honest μN', onClick: () => {
    st.honest = !st.honest; reset(); syncButtons(); render();
  } });
  const bView = button({ label: 'Show the history instead', onClick: () => {
    st.bars = !st.bars; syncButtons(); render();
  } });

  const sM = slider({
    label: '<i>m</i>', min: M_LO, max: M_HI, step: 1, value: st.mass,
    format: v => `${fmt(v, 0)} kg of skater`,
    onInput: v => { st.mass = v; reset(); render(); },
  });
  const sMu = slider({
    label: '<i>μ</i>', min: MU_LO, max: MU_HI, step: 0.005, value: st.mu,
    format: v => (v > 0 ? `${fmt(v, 3)} between board and track`
                        : 'frictionless track'),
    onInput: v => { st.mu = v; reset(); render(); },
  });
  const sG = slider({
    label: '<i>g</i>', min: G_LO, max: G_HI, step: 0.01, value: st.g,
    format: v => `${fmt(v, 2)} m s⁻² of gravity${gWord(v)}`,
    onInput: v => { st.g = v; reset(); render(); },
  });
  const sStart = slider({
    label: 'start', min: 0, max: 1, step: 0.001, value: PARKS.ramp.start,
    format: v => `let go ${fmt(v * 100, 0)}% along the track`,
    onInput: v => { st.s0 = v * T.L; reset(); render(); },
  });

  function gWord(v) {
    if (Math.abs(v - 1.62) < 0.06) return ' — the Moon';
    if (Math.abs(v - 3.72) < 0.08) return ' — Mars';
    if (Math.abs(v - 9.81) < 0.06) return ' — Earth';
    return '';
  }

  const out = readouts([
    { key: 'where', label: 'Where the skater is, and how fast' },
    { key: 'push',  label: 'How hard the track is pushing, and the weight' },
    { key: 'ke',    label: 'Kinetic energy, ½<i>mv</i>&sup2;' },
    { key: 'pe',    label: 'Potential energy, <i>mgh</i>' },
    { key: 'heat',  label: 'Heat made by friction, added up along the way' },
    { key: 'land',  label: 'Lost in landings, which the panel counts too' },
    { key: 'tot',   label: 'The four of them added together' },
    { key: 'drift', label: 'How far that total has moved since the start' },
    { key: 'air',   label: 'Whether it is on the track, and why' },
    { key: 'fact',  label: 'The result of the topic, recovered rather than assumed' },
  ]);

  const tv = surface(MW, HT, { label: 'the skate park' });
  const ev = surface(MW, HE, { label: 'where the energy is' });

  root.append(
    heading('The Skate Park',
            'no ½<i>mv</i>&sup2; = <i>mgh</i> and no <i>v</i>&sup2; = <i>gr</i> — '
            + 'the track pushes, it cannot pull, and everything the topic is '
            + 'famous for follows from that one sentence'),
    controls([el('div', { class: 'ibs-btns' }, bPark.map(b => b.node))],
             { label: 'the park:' }),
    panelBox('The park — drag the skater along the track, or drag any '
           + 'control point to reshape it', tv.el),
    panelBox('Where the energy is', ev.el),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bSlow.node, bAgain.node, bLoop.node, bMu.node, bView.node])]),
    controls([sM.node, sMu.node, sG.node, sStart.node]),
    out.node,
    note('<b>The track pushes, and cannot pull.</b> That is the only thing '
      + 'this panel is told about tracks, and it is the whole topic. Resolve '
      + 'Newton\'s second law across the track and you get how hard it has to '
      + 'push: <i>N</i> = <i>mv</i>&sup2;<i>κ</i> + <i>mg</i>&nbsp;cos&nbsp;<i>θ</i>, '
      + 'where <i>κ</i> is how sharply the track is bending. At the bottom of a '
      + 'dip both terms add and the track pushes harder than the skater weighs '
      + '— which is what you feel in a lift or at the bottom of a swing. Over '
      + 'the crest of a hill the bending has the other sign and the push falls; '
      + 'go fast enough and it would have to go negative, and since a track '
      + 'cannot pull, the skater leaves. <b>Round the loop</b> the normal points '
      + 'inwards all the way, so at the top it points DOWN, gravity is doing the '
      + 'job the track was doing at the bottom, and the push is what is left over. '
      + 'Go too slowly and there is nothing left over and the skater comes off. '
      + 'The panel was never given that condition; it falls out of the same line '
      + 'of arithmetic that gives the push on the flat. <b>The normal force does '
      + 'no work</b>, ever, because it is at right angles to the velocity by '
      + 'construction — which is exactly why the shape of the track drops out of '
      + 'the energy sum. The shape is not unimportant; it is just that everything '
      + 'it does is sideways. <b>Friction is μ times how hard the track pushes</b>, '
      + 'not μ times the weight, and in a valley those are not the same number. '
      + 'Switch the friction model and watch the skater in the valley stop sooner '
      + 'when it is done honestly. <b>And the chart is an instrument, not an '
      + 'argument.</b> It measures ½<i>mv</i>&sup2; and <i>mgh</i> and the running '
      + 'total of friction work and draws them. Nothing in this file says they '
      + 'must add to a constant. That they do is the finding.'));

  /* ---------------------------------------------------------- the drawing */

  let P = palette(root);
  const neg = s => String(s).replace('-', '−');

  /** how much world the park has to show, in metres */
  function bounds() {
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of st.pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    const pk = PARKS[st.park] || {};
    return { x0: Math.min(x0, 0) - 0.5,
             x1: Math.max(x1, 1) + 0.5 + (pk.padR || 0),
             y1: Math.max(y1, 2) + 0.7 + (pk.padT || 0) };
  }
  const pads = sm => ({ L: sm ? 30 : 42, R: sm ? 14 : 20,
                        T: sm ? 26 : 30, B: sm ? 34 : 50 });

  /** the panel is only as tall as the park needs, so no arrangement is sky */
  function parkHeight(W) {
    const sm = W < NARROW, p = pads(sm), b = bounds();
    const s = (W - p.L - p.R) / (b.x1 - b.x0);
    return clamp(Math.round(p.T + p.B + s * b.y1), sm ? 240 : 250,
                 sm ? HT_SM : HT);
  }

  /** the world-to-panel map: the whole park, to scale, with a margin */
  const GT = () => {
    const W = tv.w, sm = W < NARROW, H = tv.h;
    const b = bounds(), pd = pads(sm);
    const x0 = b.x0, x1 = b.x1, y1 = b.y1;
    const padL = pd.L, padR = pd.R, padT = pd.T, padB = pd.B;
    const s = Math.min((W - padL - padR) / (x1 - x0), (H - padT - padB) / y1);
    const left = padL + ((W - padL - padR) - s * (x1 - x0)) / 2;
    const base = H - padB;
    return { W, H, sm, s, left, base, x0, x1, y1,
             X: x => left + (x - x0) * s, Y: y => base - y * s };
  };
  const GE = () => {
    const W = ev.w, sm = W < NARROW, H = sm ? HE_SM : HE;
    return { W, H, sm, x0: sm ? 122 : 250, x1: W - (sm ? 12 : 28),
             y0: 20, y1: H - 22 };
  };

  /* ---------------------------------------------------- state management */

  function rebuild(keepPlace) {
    const was = keepPlace && st.on ? frameAtS(T, st.s) : null;
    T = buildTrack(st.pts);
    if (was) st.s = nearest(T, was.x, was.y).s;
    st.s = clamp(st.s, 0, T.L);
  }

  function setPark(k) {
    st.park = k;
    st.pts = PARKS[k].pts.map(p => ({ ...p }));
    T = buildTrack(st.pts);
    st.s0 = PARKS[k].start * T.L;
    sStart.set(PARKS[k].start);
    bPark.forEach((b, i) => b.setPressed(PARK_KEYS[i] === k));
    reset();
    fitAll();
  }

  function reset() {
    st.on = true;
    st.s = clamp(st.s0 ?? PARKS[st.park].start * T.L, 0, T.L);
    st.v = 0;
    const f = frameAtS(T, st.s);
    st.x = f.x; st.y = f.y; st.vx = 0; st.vy = 0;
    st.heat = 0; st.land = 0; st.t = 0;
    st.done = false; st.idle = 0; st.ground = false;
    st.flights = 0; st.landed = 0; st.cool = 0;
    st.topSpeed = null; st.vxAir = null; st.vPrev = 0;
    st.sLeave = null; st.air = 0;
    st.hiStart = null; st.hiBack = null; st.why = '';
    st.hist = []; st.trail = [{ x: f.x, y: f.y, air: false }];
    st.E0 = totalE();
    push();
  }

  function syncButtons() {
    bPlay.setLabel(st.playing ? 'Pause' : st.done ? 'Again' : 'Let it go');
    bSlow.setPressed(st.slow);
    bLoop.setPressed(st.loopRun);
    bMu.setLabel(st.honest ? 'Friction: the honest μN'
                           : 'Friction: the textbook μmg cos θ');
    bMu.setPressed(!st.honest);
    bView.setLabel(st.bars ? 'Show the history instead'
                           : 'Show the bars instead');
  }

  function push() {
    st.hist.push({ t: st.t, K: kinetic(), U: potential(),
                   Q: st.heat + st.land, E: totalE() });
    if (st.hist.length > HIST) st.hist = st.hist.filter((_, k) => k % 2 === 0);
  }

  /* ------------------------------------------------------- the mechanics */

  let SUB = 16;

  /** leave the track here, with the speed it had along it */
  function release(why) {
    const f = frameAtS(T, st.s);
    st.on = false; st.ground = false;
    st.x = f.x; st.y = f.y;
    st.vx = st.v * f.tx; st.vy = st.v * f.ty;
    st.flights++;
    /* remember where it left, and how far it has flown since: a track that
     * crosses itself must not catch the skater on the branch it is not on */
    st.sLeave = st.s; st.air = 0;
    if (st.DBG) st.DBG.push({ e: 'off', t: st.t, E: totalE(), s: st.s,
                              v: st.v, y: f.y, why });
    st.why = why;
  }

  /** come down on the track: keep what is along it, lose what is across it */
  function landOn(u) {
    const f = frameAt(st.pts, u);
    const vt = st.vx * f.tx + st.vy * f.ty;
    const vn = st.vx * f.nx + st.vy * f.ny;
    st.land += 0.5 * st.mass * vn * vn;
    st.on = true; st.ground = false;
    st.s = clamp(sAtU(T, u), 0, T.L);
    st.v = vt;
    st.landed++;
    if (st.DBG) st.DBG.push({ e: 'land', t: st.t, E: totalE(), s: st.s,
                              v: st.v, vn, y: frameAtS(T, st.s).y });
    st.cool = 4;
    st.why = 'back on the track';
  }

  /**
   * One substep of the constrained motion, watching for the release.
   * Returns the time it actually used: a substep that ends with the skater
   * leaving the track is cut short at the moment it leaves, and the rest of
   * it is handed back so the caller can fly the remainder. A clock that
   * advances further than the skater did is a small lie that shows up as a
   * position error, so it is not told.
   */
  function stepOn(h) {
    const f0 = frameAtS(T, st.s);
    const N0 = normalForce(st.mass, st.v, st.g, f0);
    let r = rk4(T, st.mass, st.g, st.mu, st.honest, st.s, st.v, h);
    if (r.s < 0 || r.s > T.L) {
      /* ran off the end: there is no more track to push. Find the moment it
       * reached the last centimetre of track, so the skater leaves from
       * where the track really stops rather than being snapped back to it */
      let lo = 0, hi = h;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const q = rk4(T, st.mass, st.g, st.mu, st.honest, st.s, st.v, mid);
        if (q.s >= 0 && q.s <= T.L) lo = mid; else hi = mid;
      }
      const q = rk4(T, st.mass, st.g, st.mu, st.honest, st.s, st.v, lo);
      st.s = clamp(q.s, 0, T.L); st.v = q.v; st.heat += q.heat;
      release('there is no more track');
      return lo;
    }
    const f1 = frameAtS(T, r.s);
    const N1 = normalForce(st.mass, r.v, st.g, f1);
    let used = h;
    if (N1 < 0 && st.cool <= 0) {
      if (N0 >= 0) {
        /* find the moment the push would have gone negative */
        let lo = 0, hi = h;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          const q = rk4(T, st.mass, st.g, st.mu, st.honest, st.s, st.v, mid);
          const nq = normalForce(st.mass, q.v, st.g, frameAtS(T, q.s));
          if (nq >= 0) lo = mid; else hi = mid;
        }
        r = rk4(T, st.mass, st.g, st.mu, st.honest, st.s, st.v, lo);
        used = lo;
      } else {
        used = 0;
      }
      st.s = clamp(r.s, 0, T.L); st.v = r.v; st.heat += r.heat;
      release('the track would have had to pull');
      return used;
    }
    st.s = r.s; st.v = r.v; st.heat += r.heat;
    if (st.cool > 0) st.cool--;
    st.N = normalForce(st.mass, st.v, st.g, frameAtS(T, st.s));
    st.fric = frictionForce(st.mass, st.v, st.g, frameAtS(T, st.s),
                            st.mu, st.honest).f;
    return h;
  }

  /** where the skater is a time h into the flight, exactly */
  const flyTo = (h) => ({
    x: st.x + st.vx * h,
    y: st.y + st.vy * h - 0.5 * st.g * h * h,
    vx: st.vx, vy: st.vy - st.g * h,
  });

  /** is the flying skater below the track, at a genuine foot of the normal */
  function belowTrack(x, y) {
    const q = nearest(T, x, y, st.sLeave, 1.2 + 1.8 * (st.air || 0));
    if (!q) return null;
    /* Past either end of the track there is no track, so nothing there can
     * catch the skater. A foot of the normal that has been clamped to an
     * end is not a real foot, and beyond the end the side of the curve the
     * skater is on stops meaning anything: a body that has flown off a lip
     * and is a metre out in the air is not "below" the ramp it left. So a
     * landing needs an interior foot, a perpendicular one, and the skater
     * within a step's travel of the track — not merely on its far side. */
    if (q.u <= 1e-7 || q.u >= T.spans - 1e-7) return null;
    if (Math.abs(q.along) > 0.06) return null;
    if (Math.hypot(q.f.x - x, q.f.y - y) > 0.35) return null;
    return q.d <= 0 ? q : null;
  }

  function stepAir(h) {
    if (st.ground) {
      /* sliding along the ground, which is the one flat track in the park */
      const dir = st.vx > 0 ? 1 : st.vx < 0 ? -1 : 0;
      const a = -st.mu * st.g * dir;
      const nx = st.x + st.vx * h + 0.5 * a * h * h;
      const nv = st.vx + a * h;
      st.heat += st.mu * st.mass * st.g * Math.abs(st.x - nx);
      st.x = nx;
      st.vx = (dir !== 0 && nv * dir < 0) ? 0 : nv;
      if (Math.abs(st.vx) < 1e-3) { st.vx = 0; st.done = true; }
      st.N = st.mass * st.g;
      st.fric = -st.mu * st.mass * st.g * dir;
      return h;
    }
    const a = flyTo(h);
    /* did it come down on the track */
    const hit = belowTrack(a.x, a.y);
    if (hit) {
      let lo = 0, hi = h;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, q = flyTo(mid);
        if (belowTrack(q.x, q.y)) hi = mid; else lo = mid;
      }
      const b = flyTo(hi);
      st.x = b.x; st.y = b.y; st.vx = b.vx; st.vy = b.vy;
      landOn(belowTrack(b.x, b.y).u);
      return hi;
    }
    if (a.y <= 0) {
      /* came down on the ground */
      const hh = st.vy <= 0 && st.g > 0
        ? (st.vy + Math.sqrt(Math.max(0, st.vy * st.vy + 2 * st.g * st.y)))
          / st.g
        : h;
      const t0 = clamp(hh, 0, h), b = flyTo(t0);
      st.land += 0.5 * st.mass * b.vy * b.vy;
      st.x = b.x; st.y = 0; st.vx = b.vx; st.vy = 0;
      st.ground = true; st.landed++;
      st.why = 'down on the ground';
      return t0;
    }
    st.air = (st.air || 0) + Math.hypot(a.x - st.x, a.y - st.y);
    st.x = a.x; st.y = a.y; st.vx = a.vx; st.vy = a.vy;
    st.N = 0; st.fric = 0;
    return h;
  }

  function advance(dt) {
    const sub = SUB, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      if (st.done) break;
      /* a substep that ends in a release or a landing is cut short there,
       * and the rest of it is spent in whatever the skater is doing next:
       * the clock and the skater stay together */
      let left = h, guard = 0;
      while (left > 1e-13 && !st.done && guard++ < 10) {
        const used = st.on ? stepOn(left) : stepAir(left);
        st.t += used;
        left -= used;
        if (!(used > 0)) break;
      }
      if (left > 1e-13) st.t += left;
      const tr = st.trail;
      const px = st.on ? frameAtS(T, st.s).x : st.x;
      const py = st.on ? frameAtS(T, st.s).y : st.y;
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(px - last.x, py - last.y) > 0.04) {
        tr.push({ x: px, y: py, air: !st.on });
        if (tr.length > 2400) tr.shift();
      }
    }
    const g = GT();
    if (!st.on && (st.x < g.x0 - 2 || st.x > g.x1 + 2 || st.y < -4)) {
      st.done = true;
    }
    push();
  }

  /* ----------------------------------------------------- drawing the park */

  let TEXTS = [], BOXES = [], PAN = 't';

  function colText(ctx, str, x, y, maxW, size, weight, color, maxLines = 2) {
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
      ctext(ctx, ln, x, yy, { font: `${weight} ${px}px ${P.font}`, color });
      TEXTS.push({ p: PAN, str: ln, x, y: yy - px * 0.8,
                   w: ctx.measureText(ln).width, h: px * 1.05 });
    });
    return lines.length * (px + 3);
  }

  /** an arrow with a serif symbol at its tip */
  function forceArrow(ctx, x, y, ux, uy, len, sym, o = {}) {
    if (!(len > 7)) return;
    const x2 = x + ux * len, y2 = y + uy * len;
    ctx.strokeStyle = o.color || P.text;
    ctx.fillStyle = o.color || P.text;
    ctx.lineWidth = o.w || 2;
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2 - ux * 7, y2 - uy * 7);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * 9 - uy * 4.2, y2 - uy * 9 + ux * 4.2);
    ctx.lineTo(x2 - ux * 9 + uy * 4.2, y2 - uy * 9 - ux * 4.2);
    ctx.closePath(); ctx.fill();
    ctext(ctx, sym, x2 + ux * 10, y2 + uy * 10 + 4,
          { font: P.sym(13), color: o.color || P.text, align: 'center' });
  }

  function drawPark() {
    const g = GT(), ctx = tv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = TEXTS.filter(q => q.p !== 't');
    BOXES = BOXES.filter(q => q.p !== 't');
    PAN = 't';
    /* a skater that has flown out of the park is still a skater, but it is
     * not allowed to draw itself over the panel's title */
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, g.W, g.H); ctx.clip();

    /* the ground, hatched below */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, g.Y(0), g.W, g.H - g.Y(0));
    ctx.clip();
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    for (let x = -g.H; x < g.W; x += 9) {
      ctx.beginPath(); ctx.moveTo(x, g.Y(0)); ctx.lineTo(x + g.H, g.H);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, g.Y(0)); ctx.lineTo(g.W, g.Y(0)); ctx.stroke();

    /* a rule, because the park is drawn to scale */
    const rx = g.sm ? 14 : 20;
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx - 4, g.Y(0)); ctx.lineTo(rx + 4, g.Y(0));
    ctx.moveTo(rx, g.Y(0)); ctx.lineTo(rx, g.Y(2));
    ctx.moveTo(rx - 4, g.Y(2)); ctx.lineTo(rx + 4, g.Y(2));
    ctx.stroke();
    ctext(ctx, '2 m', rx + 7, (g.Y(0) + g.Y(2)) / 2 + 4,
          { font: `600 11px ${P.font}`, color: P.text });

    /* where it has been */
    if (st.trail && st.trail.length > 1) {
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      ctx.strokeStyle = P.muted;
      let pen = false;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (const q of st.trail) {
        if (!pen) { ctx.moveTo(g.X(q.x), g.Y(q.y)); pen = true; }
        else ctx.lineTo(g.X(q.x), g.Y(q.y));
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    /* the track itself, sampled off the spline */
    ctx.strokeStyle = P.accent; ctx.lineWidth = g.sm ? 4 : 5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const NS = 900;
    for (let k = 0; k <= NS; k++) {
      const c = curveAt(st.pts, (k / NS) * T.spans);
      if (k) ctx.lineTo(g.X(c.x), g.Y(c.y)); else ctx.moveTo(g.X(c.x), g.Y(c.y));
    }
    ctx.stroke();

    /* the control points, which are the handles */
    st.pts.forEach((p, i) => {
      const hot = drag && drag.kind === 'pt' && drag.i === i;
      ctx.beginPath();
      ctx.arc(g.X(p.x), g.Y(p.y), hot ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = hot ? P.accent : P.bg;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();
    });

    /* the skater */
    const on = st.on;
    const f = on ? frameAtS(T, st.s) : null;
    const px = on ? f.x : st.x, py = on ? f.y : st.y;
    const X = g.X(px), Y = g.Y(py);
    const rad = Math.max(6, 0.24 * g.s);
    /* the board sits along the track, or along the flight */
    let bx = 1, by = 0;
    if (on) { bx = f.tx; by = f.ty; }
    else {
      const sp = Math.hypot(st.vx, st.vy);
      if (sp > 0.05) { bx = st.vx / sp; by = st.vy / sp; }
    }
    ctx.strokeStyle = P.text; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X - bx * rad * 1.3, Y + by * rad * 1.3);
    ctx.lineTo(X + bx * rad * 1.3, Y - by * rad * 1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X - by * rad * 0.9, Y - bx * rad * 0.9, rad * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = P.accent; ctx.strokeStyle = P.bg; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();

    /* the forces, as arrows with symbols and no numbers on them */
    const W = st.mass * st.g;
    /* the arrows are scaled so the LONGER of the two just fits: the ratio
     * between them is the thing worth seeing, and at the bottom of a dip
     * the track's push is several times the weight */
    const big = Math.max(W, Math.abs(st.N), 1e-9);
    const unit = (g.sm ? 46 : 66) / big;
    const ox = -by * rad * 0.9, oy = -bx * rad * 0.9;
    forceArrow(ctx, X + ox, Y + oy, 0, 1, W * unit, 'W');
    if (st.ground) {
      /* the ground is the one flat piece of track in the park */
      forceArrow(ctx, X + ox, Y + oy, 0, -1, W * unit, 'N',
                 { color: P.accent, w: 2.5 });
      if (Math.abs(st.fric) * unit > 7) {
        forceArrow(ctx, X + ox, Y + oy, st.fric >= 0 ? 1 : -1, 0,
                   Math.abs(st.fric) * unit, 'f',
                   { color: P.muted, w: 2, dash: [4, 3] });
      }
    } else if (on) {
      const nl = Math.abs(st.N) * unit, sgn = st.N >= 0 ? 1 : -1;
      forceArrow(ctx, X + ox, Y + oy, f.nx * sgn, -f.ny * sgn, nl, 'N',
                 { color: P.accent, w: 2.5 });
      if (Math.abs(st.fric) * unit > 7) {
        const fs = st.fric >= 0 ? 1 : -1;
        forceArrow(ctx, X + ox, Y + oy, f.tx * fs, -f.ty * fs,
                   Math.abs(st.fric) * unit, 'f',
                   { color: P.muted, w: 2, dash: [4, 3] });
      }
    }

    /* the one caption the drawing carries */
    ctx.textAlign = 'left';
    colText(ctx, on ? (st.N < 0.02 * W
                        ? 'the track is barely pushing — it is nearly off'
                        : 'the track pushes across itself, never along it')
                    : (st.ground ? 'down, and sliding'
                                 : 'nothing is pushing it but gravity'),
            g.sm ? 10 : 16, g.sm ? 16 : 20, g.W - (g.sm ? 20 : 40),
            g.sm ? 10.5 : 12, 600, P.muted, 1);
    ctx.restore();
  }

  /* ------------------------------------------------- drawing the energies */

  const LADDER = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const roundUp = v => {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (LADDER.find(q => m <= q + 1e-9) ?? 10) * p;
  };

  /* four fills, from three colours: solid, tint, hatched, outline */
  function fillBand(ctx, x, y, w, h, kind) {
    if (!(h > 0.4)) return;
    if (kind === 'solid') { ctx.fillStyle = P.accent; ctx.fillRect(x, y, w, h); }
    else if (kind === 'tint') {
      ctx.fillStyle = P.soft || 'rgba(0,95,106,.18)';
      ctx.fillRect(x, y, w, h);
    } else if (kind === 'hatch') {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4;
      for (let k = -h; k < w + h; k += 6) {
        ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.strokeStyle = P.text; ctx.lineWidth = 1;
      for (let k = -h; k < w + h; k += 5) {
        ctx.beginPath(); ctx.moveTo(x + k + h, y + h); ctx.lineTo(x + k, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  const BANDS = [
    { key: 'K', word: 'kinetic',    kind: 'solid' },
    { key: 'U', word: 'potential',  kind: 'tint' },
    { key: 'Q', word: 'heat',       kind: 'hatch' },
    { key: 'L', word: 'landings',   kind: 'out' },
  ];

  function drawBars(ctx, g) {
    const v = { K: kinetic(), U: potential(), Q: st.heat, L: st.land };
    const tot = v.K + v.U + v.Q + v.L;
    const top = roundUp(Math.max(st.E0, tot, 1e-9) * 1.18);
    const bx0 = g.sm ? 40 : 90, bx1 = g.W - (g.sm ? 16 : 60);
    const by0 = g.sm ? 34 : 40, by1 = g.H - (g.sm ? 46 : 52);
    const Yv = e => by1 - (e / top) * (by1 - by0);

    /* the frame, and the line the total started on */
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    croundRect(ctx, bx0, by0, bx1 - bx0, by1 - by0, 6);
    ctx.fill(); ctx.stroke();
    BOXES.push({ p: PAN, x0: bx0, y0: by0, x1: bx1, y1: by1 });
    ctx.save();
    croundRect(ctx, bx0, by0, bx1 - bx0, by1 - by0, 6); ctx.clip();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(bx0, Yv(st.E0)); ctx.lineTo(bx1, Yv(st.E0));
    ctx.stroke(); ctx.setLineDash([]);

    /* four bars, then the same four stacked */
    const n = 5, span = (bx1 - bx0) / n, bw = Math.min(span * 0.5, 112);
    const cx = k => bx0 + span * (k + 0.5);
    BANDS.forEach((b, k) => {
      const h = Yv(0) - Yv(v[b.key]);
      fillBand(ctx, cx(k) - bw / 2, Yv(v[b.key]), bw, h, b.kind);
    });
    let acc = 0;
    for (const b of BANDS) {
      const h = Yv(0) - Yv(v[b.key]);
      fillBand(ctx, cx(4) - bw / 2, Yv(acc + v[b.key]), bw, h, b.kind);
      acc += v[b.key];
    }
    ctx.restore();

    /* words under the bars, and never a number */
    const lab = ['kinetic', 'potential', 'heat', 'landings',
                 g.sm ? 'all four' : 'the four, stacked'];
    lab.forEach((s, k) => {
      ctx.textAlign = 'center';
      const px = g.sm ? 9 : 11;
      ctx.font = `600 ${px}px ${P.font}`;
      let str = s, w = ctx.measureText(str).width;
      while (w > span - 4 && str.length > 3) {
        str = str.slice(0, -1); w = ctx.measureText(str + '…').width;
      }
      if (str !== s) str += '…';
      ctext(ctx, str, cx(k), by1 + (g.sm ? 15 : 18),
            { font: `600 ${px}px ${P.font}`, color: P.text, align: 'center' });
      TEXTS.push({ p: PAN, str, x: cx(k) - w / 2,
                   y: by1 + (g.sm ? 15 : 18) - px * 0.8, w, h: px * 1.05 });
      ctx.textAlign = 'left';
    });
    ctext(ctx, `${fmt(top, top < 10 ? 1 : 0)} J`, bx0 - 6, by0 + 10,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, '0', bx0 - 6, by1 - 2,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    colText(ctx, 'the dashed line is where the total started',
            g.sm ? 10 : 16, g.sm ? 18 : 22, bx1 - bx0 - 10,
            g.sm ? 10 : 11.5, 600, P.accent, 1);
  }

  function strip(ctx, g, y0, y1, title, value, why, vals, lo, hi, show) {
    const x0 = g.x0, x1 = g.x1;
    const span = Math.max(0.4, st.hist.length
      ? st.hist[st.hist.length - 1].t : 0) * 1.04;
    const Yv = e => y1 - (e - lo) / (hi - lo) * (y1 - y0);
    const Xk = k => x0 + (st.hist.length ? st.hist[k].t / span : 0) * (x1 - x0);
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
    BOXES.push({ p: PAN, x0, y0, x1, y1 });
    ctx.save();
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.clip();
    if (vals.length > 1) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      vals.forEach((e, k) => k ? ctx.lineTo(Xk(k), Yv(e))
                               : ctx.moveTo(Xk(k), Yv(e)));
      ctx.stroke();
    }
    ctx.restore();
    ctext(ctx, show(hi), x1 - 4, y0 + 12,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, show(lo), x1 - 4, y1 - 4,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, `${fmt(span, 2)} s`, x0 + 6, y1 - 4,
          { font: `500 10px ${P.font}`, color: P.muted });
    const maxW = x0 - 12 - 14;
    colText(ctx, title, 12, y0 + (g.sm ? 13 : 15), maxW, g.sm ? 10.5 : 12.5,
            600, P.accent, 2);
    colText(ctx, value, 12, y0 + (g.sm ? 40 : 36), maxW, g.sm ? 12.5 : 17,
            700, P.text, 1);
    if (!g.sm) colText(ctx, why, 12, y0 + 55, maxW, 10.5, 500, P.muted, 3);
  }

  function drawHistory(ctx, g) {
    const H = (g.y1 - g.y0) / 4;
    const h = st.hist;
    const top = roundUp(Math.max(st.E0, 1e-9,
      ...h.map(q => q.E)) * 1.15);
    const show = e => `${fmt(e, top < 10 ? 2 : 0)} J`;
    const rows = [
      ['Kinetic energy, ½mv²',
       show(kinetic()),
       'what it has because it is moving — biggest at the bottom, gone at the top',
       h.map(q => q.K)],
      ['Potential energy, mgh',
       show(potential()),
       'what it has because of where it is — the same curve upside down',
       h.map(q => q.U)],
      ['Heat, and what landings took',
       show(st.heat + st.land),
       'friction times the distance it was dragged over, added up as it went',
       h.map(q => q.Q)],
      ['Everything added together',
       show(totalE()),
       'nothing in this file says this has to be flat. That it is, is the finding',
       h.map(q => q.E)],
    ];
    rows.forEach((r, k) => {
      strip(ctx, g, g.y0 + k * H + 5, g.y0 + (k + 1) * H - 5,
            r[0], r[1], r[2], r[3], 0, top, show);
    });
  }

  function drawEnergy() {
    const g = GE(), ctx = ev.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = TEXTS.filter(q => q.p !== 'e');
    BOXES = BOXES.filter(q => q.p !== 'e');
    PAN = 'e';
    if (st.bars) drawBars(ctx, g); else drawHistory(ctx, g);
  }

  /* ---------------------------------------------------------- the numbers */

  function loopTop() {
    /* the tightest inward bend on the track, which is the top of a loop if
     * there is one: found by looking at the drawn curve, not by knowing */
    let best = null;
    for (let k = 0; k <= 600; k++) {
      const f = frameAt(st.pts, (k / 600) * T.spans);
      if (f.kap > 0.05 && f.ny < -0.9) {
        if (!best || f.y > best.y) best = f;
      }
    }
    return best;
  }

  function theFact() {
    const f = st.on ? frameAtS(T, st.s) : null;
    if (st.park === 'loop') {
      const top = loopTop();
      if (!top) return '—';
      const need = Math.sqrt(st.g / top.kap);
      const got = st.topSpeed;
      return got == null
        ? `at the top of the loop the track bends at ${fmt(1 / top.kap, 2)} m `
          + `of radius, so gravity alone would hold it at `
          + `${fmt(need, 2)} m s⁻¹ — send it round and see`
        : `it passed the top at ${fmt(got, 2)} m s⁻¹ against the `
          + `${fmt(need, 2)} m s⁻¹ gravity alone would have needed`;
    }
    if (st.park === 'jump') {
      return st.flights
        ? `in the air its sideways speed held at ${fmt(Math.abs(st.vxAir ?? 0), 3)} `
          + `m s⁻¹ — nothing was pushing it sideways`
        : 'past the lip there is no track, so there is nothing to push';
    }
    if (st.park === 'valley' || st.park === 'hills') {
      if (st.hiBack == null) {
        return 'let it go and watch how high it gets on the other side';
      }
      const lost = (st.heat + st.land) / (st.mass * st.g);
      return `it left ${fmt(st.hiStart, 2)} m up and came back to `
        + `${fmt(st.hiBack, 2)} m — down ${fmt(st.hiStart - st.hiBack, 2)} m, `
        + `against ${fmt(lost, 2)} m of heat divided by mg`;
    }
    if (!f) return 'it is in the air';
    return `the track is pushing ${fmt(st.N / (st.mass * st.g), 2)} times `
         + `the skater's weight, across the track and not along it`;
  }

  function fillReadouts() {
    const f = st.on ? frameAtS(T, st.s) : null;
    const W = st.mass * st.g;
    const sp = st.on ? Math.abs(st.v) : Math.hypot(st.vx, st.vy);
    const v = {
      where: `${fmt(height(), 2)} m up, going ${fmt(sp, 2)} m s⁻¹`,
      push: st.on
        ? `${fmt(st.N, 1)} N against a weight of ${fmt(W, 1)} N — `
          + `${fmt(st.N / W, 2)}×`
        : `nothing is touching it, so the push is 0 N`,
      ke: `${fmt(kinetic(), 1)} J`,
      pe: `${fmt(potential(), 1)} J`,
      heat: st.mu > 0 ? `${fmt(st.heat, 1)} J` : '0 J — the track is frictionless',
      land: st.land > 0 ? `${fmt(st.land, 1)} J over ${st.landed} landing`
        + (st.landed === 1 ? '' : 's') : '0 J — it has not landed yet',
      tot: `${fmt(totalE(), 2)} J, having started at ${fmt(st.E0, 2)} J`,
      drift: `${neg(fmt(totalE() - st.E0, 4))} J, which is the integrator `
           + `and nothing else`,
      air: st.on
        ? (f && st.N < 0.05 * W
            ? 'on the track, but only just — the push is nearly nothing'
            : 'on the track, which is pushing it across itself')
        : `in the air — ${st.why || 'nothing is pushing it'}`,
      fact: theFact(),
    };
    out.setAll(v);
  }

  const render = () => { drawPark(); drawEnergy(); fillReadouts(); };

  /* ------------------------------------------------------------ the drags */

  let drag = null;
  tv.el.style.touchAction = 'none';

  function hitTest(pt, g) {
    /* the skater first, then the control points */
    const on = st.on;
    const f = on ? frameAtS(T, st.s) : null;
    const sx = g.X(on ? f.x : st.x), sy = g.Y(on ? f.y : st.y);
    if (Math.hypot(pt.x - sx, pt.y - sy) < Math.max(14, 0.3 * g.s)) {
      return { kind: 'skater' };
    }
    for (let i = 0; i < st.pts.length; i++) {
      const p = st.pts[i];
      if (Math.hypot(pt.x - g.X(p.x), pt.y - g.Y(p.y)) < 13) {
        return { kind: 'pt', i };
      }
    }
    return null;
  }

  tv.el.addEventListener('pointerdown', e => {
    const g = GT(), pt = tv.at(e);
    const h = hitTest(pt, g);
    if (!h) return;
    drag = h;
    st.playing = false; syncButtons();
    try { tv.el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    render();
  });

  tv.el.addEventListener('pointermove', e => {
    const g = GT(), pt = tv.at(e);
    if (!drag) {
      tv.el.style.cursor = hitTest(pt, g) ? 'grab' : 'default';
      return;
    }
    e.preventDefault();
    const wx = g.x0 + (pt.x - g.left) / g.s;
    const wy = (g.base - pt.y) / g.s;
    if (drag.kind === 'skater') {
      const q = nearest(T, wx, wy);
      st.s0 = clamp(q.s, 0, T.L);
      sStart.set(clamp(st.s0 / T.L, 0, 1));
      reset();
    } else {
      st.pts[drag.i] = { x: clamp(wx, g.x0 + 0.2, g.x1 - 0.2),
                         y: clamp(wy, 0.12, g.y1 - 0.2) };
      rebuild(true);
      st.s0 = clamp(st.s0 ?? 0, 0, T.L);
      reset();
      tv.setLogical(tv.w, parkHeight(tv.w)); tv.fit();
    }
    render();
  });

  const letGo = () => { if (drag) { drag = null; render(); } };
  tv.el.addEventListener('pointerup', letGo);
  tv.el.addEventListener('pointercancel', letGo);

  /* -------------------------------------------------------- the animation */

  let frame = 0;
  const anim = loop(dt => {
    if (st.playing && !st.done) {
      advance(Math.min(dt, 0.05) * (st.slow ? 0.18 : 1));
      watch();
    }
    if (st.done && st.loopRun && st.playing) {
      st.idle += dt;
      if (st.idle > 1.4) { reset(); }
    }
    drawPark(); drawEnergy();
    if ((frame++ % 6) === 0) fillReadouts();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  /** things the panel notices while it runs, so it can report them after */
  function watch() {
    if (st.park === 'loop' && st.on) {
      const top = loopTop();
      const f = frameAtS(T, st.s);
      if (top && Math.abs(f.u - top.u) < 0.06) st.topSpeed = Math.abs(st.v);
    }
    if (!st.on && !st.ground) st.vxAir = st.vx;
    if (st.hiStart == null) st.hiStart = height();
    if (st.on && st.v * (st.vPrev ?? 0) < 0) st.hiBack = height();
    st.vPrev = st.on ? st.v : 0;
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(tv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      tv.setLogical(w, parkHeight(w));
      ev.setLogical(w, w < NARROW ? HE_SM : HE);
    }
    tv.fit(); ev.fit();
    render();
  }
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = 0;
    const ro = new ResizeObserver(evs => {
      const nw = Math.round(evs[0].contentRect.width);
      if (nw && nw !== lastW) { lastW = nw; fitAll(); }
    });
    ro.observe(root);
    onDestroy(() => ro.disconnect());
  }

  setPark('ramp');
  syncButtons();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: q => {
      const p = q.park;
      if (p && p !== st.park) { setPark(p); }
      Object.assign(st, q);
      if (q.pts) { st.pts = q.pts.map(z => ({ ...z })); T = buildTrack(st.pts); }
      sM.set(st.mass); sMu.set(st.mu); sG.set(st.g);
      if (q.start != null) st.s0 = q.start * T.L;
      sStart.set(clamp((st.s0 ?? 0) / T.L, 0, 1));
      syncButtons();
      reset(); render();
    },
    _run: seconds => {
      const n = Math.max(1, Math.round(seconds / (1 / 60)));
      for (let i = 0; i < n; i++) {
        if (st.done) break;
        advance(1 / 60); watch();
      }
      render();
      return st.t;
    },
    _fine: (seconds, fdt) => {
      const n = Math.max(1, Math.round(seconds / fdt)), o = [];
      for (let i = 0; i < n; i++) {
        advance(fdt); watch();
        const f = st.on ? frameAtS(T, st.s) : null;
        o.push({ t: st.t, on: st.on, ground: !!st.ground,
                 s: st.s, v: st.v, x: st.on ? f.x : st.x, y: st.on ? f.y : st.y,
                 vx: st.on ? st.v * f.tx : st.vx,
                 vy: st.on ? st.v * f.ty : st.vy,
                 N: st.N, fric: st.fric, kap: f ? f.kap : 0, ny: f ? f.ny : 0,
                 K: kinetic(), U: potential(), Q: st.heat, L: st.land,
                 E: totalE() });
        if (st.done) break;
      }
      render();
      return o;
    },
    _state: () => ({
      park: st.park, mass: st.mass, mu: st.mu, g: st.g, honest: st.honest,
      bars: st.bars, on: st.on, ground: !!st.ground, done: st.done,
      s: st.s, v: st.v, x: st.x, y: st.y, vx: st.vx, vy: st.vy,
      t: st.t, N: st.N, fric: st.fric, heat: st.heat, land: st.land,
      K: kinetic(), U: potential(), E: totalE(), E0: st.E0,
      h: height(), L: T.L, flights: st.flights, landed: st.landed,
      topSpeed: st.topSpeed ?? null, n: st.hist.length,
    }),
    _hist: () => st.hist.map(q => ({ ...q })),
    _pts: () => st.pts.map(p => ({ ...p })),
    _track: () => ({ L: T.L, spans: T.spans }),
    _frameS: s => frameAtS(T, s),
    _frameU: u => frameAt(st.pts, u),
    _uAtS: s => uAtS(T, s),
    _sAtU: u => sAtU(T, u),
    _nearest: (x, y) => { const q = nearest(T, x, y);
                          return { u: q.u, s: q.s, d: q.d, along: q.along }; },
    _normal: (m, v, g, s) => normalForce(m, v, g, frameAtS(T, s)),
    _loopTop: () => { const f = loopTop(); return f ? { ...f } : null; },
    _setSub: n => { SUB = n; },
    _dbg: on => { st.DBG = on ? [] : null; return null; },
    _dbgOut: () => (st.DBG || []).slice(),
    _setBars: b => { st.bars = !!b; syncButtons(); render(); },
    _texts: () => TEXTS.map(q => ({ ...q })),
    _boxes: () => BOXES.map(q => ({ ...q })),
    _geomT: () => { const g = GT(); return { W: g.W, H: g.H, sm: g.sm,
                                             s: g.s, left: g.left, base: g.base,
                                             x0: g.x0, x1: g.x1, y1: g.y1 }; },
    _geomE: () => GE(),
    _consts: () => ({ MW, HT, HT_SM, HE, HE_SM, NARROW, G0,
                      M_LO, M_HI, MU_LO, MU_HI, G_LO, G_HI, ARC_SEG, NEAR_N }),
    _parks: () => PARK_KEYS.slice(),
  };
}
