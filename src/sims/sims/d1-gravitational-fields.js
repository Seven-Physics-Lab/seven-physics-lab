/* ============================================================================
 * D1-1  Gravitational Fields: the field, the potential, and the orbit
 * IB Physics D.1 Gravitational fields
 *
 * One idea, told three ways. A mass changes the space around it; the change
 * can be described as a force per kilogram (a vector, the field) or as an
 * energy per kilogram (a scalar, the potential); and anything let go in it
 * moves on a path that nobody has to be told the shape of.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does not contain g = GM/r². It does not contain V = −GM/r, or
 * v = √(GM/r), or v_esc = √(2GM/r), or T² ∝ a³, or the neutral-point equation
 * m₁/x² = m₂/(d−x)². None of the results of this topic are written down in it.
 *
 * What it contains is Newton's law of gravitation applied to each source
 * separately and added up:
 *
 *   the field        g = Σ Gmᵢ r̂ᵢ / rᵢ²        added as vectors
 *   the potential    V = −∫ g·dl from infinity  integrated, per source
 *   the motion       a = g                      integrated, symplectically
 *
 * Everything else on the panel is a measurement made on those three. The
 * neutral point is found by hunting for the zero of the computed field. The
 * period is found by watching the satellite come back. The semi-major axis is
 * half the sum of the largest and smallest distances the path actually
 * reached. The escape speed is found by bisection — the slowest launch that
 * never returns — not by a formula. And the two descriptions are tied
 * together numerically in both directions: the potential is got by
 * integrating the field, and the field is then recovered by differentiating
 * the drawn potential curve and laid dashed over the drawn field curve.
 *
 * WHAT THE PICTURE IS FOR, AND THE ONE LIE IN IT
 *
 * The equipotentials are honest. They are drawn at equal steps of potential,
 * so every gap is the same joule per kilogram, and where they crowd the field
 * is strong — you can measure g off the map with a ruler.
 *
 * The field lines are not. A field line map drawn in a plane thins out as 1/r,
 * but the field falls as 1/r², because the flux from a point mass spreads over
 * a sphere and the page only shows a slice of it. So the SPACING of the field
 * lines here means nothing; only their DIRECTION does. This is the single
 * liberty the panel takes, it is stated on the panel itself, and the graph
 * beneath is where the strength is meant to be read.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, ctext, carrow,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;
const HM = 430, HM_SM = 430;      // the map
const HG = 400, HG_SM = 440;      // the graphs
const NARROW = 760;

export const G  = 6.674e-11;      // N m² kg⁻²
export const ME = 5.9722e24;      // kg, one Earth mass
export const RE = 6.371e6;        // m, one Earth radius

/* slider ends */
const M_LO = 0.02, M_HI = 320;    // Earth masses (log slider)
const R_LO = 0.25, R_HI = 11;     // Earth radii
const M2_LO = 0.001, M2_HI = 1;   // Earth masses (log slider)
const D_LO = 8, D_HI = 120;       // radii of the primary
const V_LO = 0.5, V_HI = 14;      // km s⁻¹
const RP_LO = 1.02, RP_HI = 9;    // radii of the primary

/* how many launches the experiment makes, and how many trial launches it
 * sifts to pick them. Speed is a poor handle on orbit size — most of the
 * range between grazing the ground and never coming back gives small orbits
 * and the last sliver gives enormous ones — so the eight are chosen by the
 * size the orbit turns out to HAVE, sweeping speeds and keeping the eight
 * whose measured a³ fall nearest to evenly spaced. That is an experimental
 * design, not a formula: a is measured off each path, never predicted. */
const N_LAUNCH = 8, N_SWEEP = 30;

const MODES = {
  one:   { name: 'one mass' },
  two:   { name: 'two masses' },
  orbit: { name: 'put something in orbit' },
};

/* ========================================================================= *
 * THE MODEL
 *
 * Three functions. Everything on the panel is measured off one of them.
 * ========================================================================= */

/**
 * The field at a point: Newton's law once per source, added as vectors.
 * Nothing here knows how many masses there are or where they sit.
 *
 * @param x,y    the point, in metres
 * @param bodies [{ x, y, GM }] with GM = G × mass, in m³ s⁻²
 * @returns { gx, gy, mag } in m s⁻² (equivalently N kg⁻¹)
 */
export function fieldAt(x, y, bodies) {
  let gx = 0, gy = 0;
  for (const b of bodies) {
    const dx = b.x - x, dy = b.y - y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1e-6) continue;
    const r = Math.sqrt(r2);
    const a = b.GM / r2;              // Newton: force per kilogram
    gx += a * dx / r; gy += a * dy / r;
  }
  return { gx, gy, mag: Math.hypot(gx, gy) };
}

/**
 * The potential at a point.
 *
 * The potential is DEFINED as the work per kilogram done against the field in
 * bringing a mass from infinity, V = −∫ g·dl, and that is what is computed
 * here. Potential is a scalar and the field of each source is central about
 * that source, so the line integral splits into one radial integral per body
 * and the path taken does not matter. Substituting u = 1/s turns the infinite
 * range into [0, 1/r] and a Gauss-Legendre rule closes it.
 *
 * The result is of course −GM/r. The point is that the file is never told so.
 *
 * @returns J kg⁻¹, always negative, zero only at infinity
 */
const GL_T = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290,
              -0.1834346424956498, 0.1834346424956498, 0.5255324099163290,
              0.7966664774136267, 0.9602898564975363];
const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873,
              0.3626837833783620, 0.3626837833783620, 0.3137066458778873,
              0.2223810344533745, 0.1012285362903763];

export function potentialAt(x, y, bodies) {
  let V = 0;
  for (const b of bodies) {
    const r = Math.max(Math.hypot(b.x - x, b.y - y), 1e-3);
    /* ∫_r^∞ g(s) ds  with  s = 1/u, ds = −du/u², so the infinite range
     * becomes u ∈ [0, 1/r]. Gauss–Legendre is used rather than Simpson
     * because its nodes are strictly inside the interval and the integrand
     * at u = 0 is a genuine 0/0 — a vanishing field over a vanishing
     * jacobian, which is exactly why the integral converges at all. */
    const U = 1 / r;
    let sum = 0;
    for (let k = 0; k < GL_T.length; k++) {
      const u = U * (1 + GL_T[k]) / 2;
      const s = 1 / u;
      const g = b.GM / (s * s);        // the field, asked for by distance
      sum += GL_W[k] * g / (u * u);    // times ds/du
    }
    V -= sum * U / 2;
  }
  return V;
}

/**
 * One step of the fourth-order Yoshida composition, built from three
 * leapfrog steps. Symplectic, so the energy oscillates by a fixed amount
 * and never drifts — which matters, because the whole point of the orbit
 * panel is that quantities the file was never told about stay put.
 */
const W1 = 1 / (2 - Math.cbrt(2)), W0 = -Math.cbrt(2) * W1;
const YOSH = [W1, W0, W1];

function stepY(s, dt, bodies) {
  for (const w of YOSH) {
    const h = w * dt;
    /* drift, kick, drift — each half-step time-symmetric */
    s.x += s.vx * h / 2; s.y += s.vy * h / 2;
    const g = fieldAt(s.x, s.y, bodies);
    s.vx += g.gx * h;    s.vy += g.gy * h;
    s.x += s.vx * h / 2; s.y += s.vy * h / 2;
  }
}

/** the local free-fall time √(r/g): the only timescale in sight, and it is
 *  read off the computed field rather than off any orbital formula */
function localTime(x, y, bodies) {
  const r = Math.hypot(x, y);
  const g = fieldAt(x, y, bodies).mag;
  return Math.sqrt(r / Math.max(g, 1e-12));
}

/**
 * Launch a test mass at (r0, 0) with speed v0 perpendicular to the radius and
 * integrate a = g until it comes back, hits the surface, or clearly is not
 * coming back at all. Nothing is assumed about the shape of the path.
 *
 * The step is set from the local free-fall time at the closest approach, so a
 * plunging ellipse is integrated finely where it needs to be. Finding the
 * closest approach needs the path, and the path needs the step, so it is done
 * twice: a coarse pass to find how close it goes, then the real one.
 *
 * @returns {
 *   pts      [{x, y, t, r, v}] the path, thinned for drawing
 *   closed   did it come back
 *   hit      did it reach the surface
 *   T        the period, if it came back (s)
 *   rMin,rMax  the smallest and largest distances the path reached (m)
 *   eps, L   the specific energy and angular momentum, sampled along it
 * }
 */
export function integrate(bodies, r0, v0, Rbody, opts = {}) {
  const eta = opts.eta ?? 0.004;
  const maxSteps = opts.maxSteps ?? 400000;
  const keep = opts.keep ?? 1400;

  const run = (dt, collect) => {
    const s = { x: r0, y: 0, vx: 0, vy: v0 };
    let t = 0, th = 0, swept = 0, rMin = r0, rMax = r0;
    const out = collect ? [{ x: s.x, y: s.y, vx: 0, vy: v0, t: 0, r: r0, v: v0 }] : null;
    let closed = false, hit = false, gone = false, T = 0, n = 0;
    for (; n < maxSteps; n++) {
      const px = s.x, py = s.y, pt = t;
      stepY(s, dt, bodies); t += dt;
      const r = Math.hypot(s.x, s.y);
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      /* the angle actually turned through, accumulated without unwrapping
       * tricks: the cross and dot products of successive positions */
      const dth = Math.atan2(px * s.y - py * s.x, px * s.x + py * s.y);
      swept += dth; th += dth;
      if (collect) out.push({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, t, r,
                             v: Math.hypot(s.vx, s.vy) });
      if (r <= Rbody) { hit = true; break; }
      if (Math.abs(swept) >= TAU) {
        /* interpolate back to exactly one revolution */
        const over = (Math.abs(swept) - TAU) / Math.abs(dth);
        T = t - over * dt;
        closed = true; break;
      }
      if (r > 80 * r0 && (s.x * s.vx + s.y * s.vy) > 0) { gone = true; break; }
    }
    return { s, out, closed, hit, gone, T, rMin, rMax, steps: n };
  };

  const dt0 = eta * localTime(r0, 0, bodies) * 8;
  const pass1 = run(dt0, false);
  let dt = eta * localTime(Math.max(pass1.rMin, Rbody), 0, bodies);
  /* never take more steps than we can afford, and never fewer than are
   * needed to resolve the turn at closest approach */
  dt = Math.max(dt, (pass1.steps * dt0) / maxSteps * 1.2);
  const res = run(dt, true);

  /* thin the path for drawing, keeping the ends */
  const pts = [];
  const every = Math.max(1, Math.ceil(res.out.length / keep));
  for (let i = 0; i < res.out.length; i += every) pts.push(res.out[i]);
  if (pts[pts.length - 1] !== res.out[res.out.length - 1]) {
    pts.push(res.out[res.out.length - 1]);
  }

  /* the two things that should not change, sampled along the drawn path */
  const eps = [], L = [];
  for (const p of pts) {
    eps.push(0.5 * p.v * p.v + potentialAt(p.x, p.y, bodies));
  }
  for (const p of pts) {
    /* the angular momentum per kilogram, r × v, taken from the position and
     * velocity the integrator is holding rather than from the chord between
     * two stored points — a chord measures the area of a triangle, which is
     * short of the sector by a whisker that grows where the path bends most */
    L.push(Math.abs(p.x * p.vy - p.y * p.vx));
  }

  return {
    pts, closed: res.closed, hit: res.hit, gone: res.gone,
    T: res.T, rMin: res.rMin, rMax: res.rMax, dt, steps: res.steps,
    eps, L,
  };
}

/** the area a stretch of the drawn path sweeps out about the primary, by the
 *  shoelace formula — a measurement on the curve, not the conserved quantity */
export function sweptArea(pts, i0, i1) {
  let A = 0;
  for (let i = i0; i < i1; i++) {
    A += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
  }
  return Math.abs(A) / 2;
}

/**
 * Does a launch at speed v from r0 ever turn round, if we watch out to a
 * distance `far` × r0? Integrated outward and stopped the moment the path
 * starts falling back, so a bound orbit costs only as long as it takes to
 * reach its farthest point.
 */
export function returns(bodies, r0, v, far) {
  const s = { x: r0, y: 0, vx: 0, vy: v };
  const dt = 0.05 * localTime(r0, 0, bodies);
  const lim = far * r0;
  for (let n = 0; n < 4000000; n++) {
    const pr = Math.hypot(s.x, s.y);
    stepY(s, dt, bodies);
    const r = Math.hypot(s.x, s.y);
    if (r < pr) return true;                 // it has started coming back
    if (r > lim) return false;               // still climbing when we stopped
  }
  return true;
}

/**
 * The slowest launch from r0 that misses the ground, by bisection — the other
 * end of the range of launches worth making. Below it the path is still an
 * ellipse; it just has the planet in the way.
 */
export function findGrazing(bodies, r0, Rbody, iters = 26) {
  let lo = 1, hi = 1e6;
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi);
    const o = integrate(bodies, r0, mid, Rbody, { keep: 8 });
    if (o.hit) lo = mid; else hi = mid;
    if ((hi - lo) / hi < 1e-5) break;
  }
  return hi;
}

/**
 * The slowest launch that does not come back, by bisection.
 *
 * There is no such thing as "does not come back" on a finite drawing: a
 * bound orbit whose farthest point lies beyond wherever you stopped watching
 * looks exactly like an escape. So this answers a question that CAN be
 * settled — the slowest launch that still climbing when it passed `far`
 * radii — and the answer creeps up as `far` is pushed out. Run it at several
 * cutoffs and it converges on the escape speed, which is only ever reached
 * at infinity. That convergence is the result, not any single number.
 */
export function findEscape(bodies, r0, far = 150, iters = 34) {
  let lo = 1, hi = 1e6;
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi);
    if (returns(bodies, r0, mid, far)) lo = mid; else hi = mid;
    if ((hi - lo) / hi < 1e-7) break;
  }
  return 0.5 * (lo + hi);
}

/** the point between two masses where the field vanishes, found by hunting
 *  along the join for the sign change in the computed field */
export function neutralPoint(bodies) {
  const [a, b] = bodies;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const at = f => {
    const x = a.x + ux * f * d, y = a.y + uy * f * d;
    const g = fieldAt(x, y, bodies);
    return g.gx * ux + g.gy * uy;      // the component along the join
  };
  let lo = 1e-4, hi = 1 - 1e-4;
  if (at(lo) * at(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (at(lo) * at(mid) <= 0) hi = mid; else lo = mid;
  }
  const f = 0.5 * (lo + hi);
  return { f, x: a.x + ux * f * d, y: a.y + uy * f * d, d };
}

/* ========================================================================= *
 * CONTOURING
 *
 * Marching squares on a grid of computed potentials. The equipotentials are
 * not drawn from any formula for their shape — for one mass they come out
 * circular, and for two they come out as the figure-eight through the
 * neutral point, because that is what the numbers do.
 * ========================================================================= */

const MS = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]],
            [[0, 2]], [[3, 2]], [[2, 3]], [[2, 0]], [[0, 1], [2, 3]],
            [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], []];

export function contourGrid(V, nx, ny, level) {
  const segs = [];
  const P = (e, i, j, a, b, c, d) => {
    /* linear interpolation along the cell edge, in grid coordinates */
    const t = (p, q) => (level - p) / (q - p);
    if (e === 0) return [i + t(a, b), j];
    if (e === 1) return [i + 1, j + t(b, c)];
    if (e === 2) return [i + t(d, c), j + 1];
    return [i, j + t(a, d)];
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = V[j * nx + i], b = V[j * nx + i + 1];
      const c = V[(j + 1) * nx + i + 1], d = V[(j + 1) * nx + i];
      if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) continue;
      const k = (a > level ? 1 : 0) | (b > level ? 2 : 0)
              | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      for (const [e1, e2] of MS[k]) {
        segs.push([P(e1, i, j, a, b, c, d), P(e2, i, j, a, b, c, d)]);
      }
    }
  }
  return segs;
}

/* ========================================================================= */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'd1-gravitational-fields',
    title: 'Gravitational fields, potential and orbits',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    mode: 'one',
    M: 1,           // Earth masses
    R: 1,           // Earth radii
    M2: 0.0123,     // Earth masses — the Moon, to start with
    d: 60.3,        // radii of the primary — the Moon's distance, to start with
    rp: 2.4,        // the marker, in radii of the primary
    fp: 0.5,        // the marker again, as a fraction of the way across
    r0: 3,          // launch distance, in radii of the primary
    v0: 5.4,        // launch speed, km s⁻¹
    graph: 'energy',// 'energy' or 'kepler', in orbit mode
    areas: false,   // shade two equal-time sectors
    lines: true,    // draw the field lines
    t: 0, playing: true,
    runs: [],       // recorded [{ v0, a, T }]
    esc: null,      // the escape hunt, once it has been run
  };

  /* --------------------------------------------------------- the model */

  const GMof = m => G * m * ME;
  const Rm = () => st.R * RE;

  function bodies(over = {}) {
    const s = { ...st, ...over };
    const B = [{ x: 0, y: 0, GM: GMof(s.M), R: s.R * RE, name: 'the planet' }];
    if (s.mode === 'two') {
      /* the second body's radius is scaled from the first by equal density,
       * which is the only assumption on the panel and changes no physics */
      B.push({ x: s.d * RE * s.R, y: 0, GM: GMof(s.M2),
               R: s.R * RE * Math.cbrt(s.M2 / s.M), name: 'the companion' });
    }
    return B;
  }

  /* a small cache, because the orbit and the contour grid are the two
   * expensive things and neither depends on the animation clock */
  let cache = { key: '', orbit: null, grid: null };
  const keyOf = () => [st.mode, st.M, st.R, st.M2, st.d, st.r0, st.v0].join('|');

  function orbit() {
    const k = keyOf();
    if (cache.key === k && cache.orbit) return cache.orbit;
    const B = bodies();
    const o = integrate(B, st.r0 * Rm(), st.v0 * 1000, Rm());
    /* everything below is a measurement on the path that came back */
    const a = (o.rMin + o.rMax) / 2;
    const e = (o.rMax - o.rMin) / (o.rMax + o.rMin);
    o.a = a; o.e = e;
    o.epsDrift = (Math.max(...o.eps) - Math.min(...o.eps)) / Math.abs(o.eps[0]);
    o.Ldrift = (Math.max(...o.L) - Math.min(...o.L)) / o.L[0];
    o.eps0 = o.eps[0]; o.L0 = o.L[0];
    cache = { key: k, orbit: o, grid: cache.key === k ? cache.grid : null };
    return o;
  }

  /* ------------------------------------------------------------ controls */

  const logS = (lo, hi) => ({ min: Math.log10(lo), max: Math.log10(hi), step: 'any' });

  const sM = slider({ label: '<i>M</i>', ...logS(M_LO, M_HI),
    value: Math.log10(st.M),
    format: v => `${massWord(Math.pow(10, v))}`,
    onInput: v => { st.M = Math.pow(10, v); render(); } });
  const sR = slider({ label: '<i>R</i>', min: R_LO, max: R_HI, step: 0.01, value: st.R,
    format: v => `${fmt(v, 2)} R⊕ = ${fmt(v * RE / 1e6, 2)} × 10⁶ m`,
    onInput: v => { st.R = v; syncRanges(); render(); } });
  const sM2 = slider({ label: '<i>m</i>', ...logS(M2_LO, M2_HI),
    value: Math.log10(st.M2),
    format: v => `${massWord(Math.pow(10, v))}`,
    onInput: v => { st.M2 = Math.pow(10, v); render(); } });
  const sD = slider({ label: '<i>d</i>', min: D_LO, max: D_HI, step: 0.1, value: st.d,
    format: v => `${fmt(v, 1)} R = ${sciM(v * Rm(), 2)} m`,
    onInput: v => { st.d = v; render(); } });
  const sP = slider({ label: '<i>r</i>', min: RP_LO, max: RP_HI, step: 0.01, value: st.rp,
    format: v => st.mode === 'two' ? `${fmt(v, 3)} of the way across`
                                   : `${fmt(v, 2)} R`,
    onInput: v => { if (st.mode === 'two') st.fp = v; else st.rp = v; render(); } });
  const sR0 = slider({ label: '<i>r</i>₀', min: 1.05, max: 10, step: 0.01, value: st.r0,
    format: v => `${fmt(v, 2)} R`,
    onInput: v => { st.r0 = v; st.t = 0; render(); } });
  const sV0 = slider({ label: '<i>v</i>₀', min: V_LO, max: V_HI, step: 0.02, value: st.v0,
    format: v => `${fmt(v, 2)} km s⁻¹`,
    onInput: v => { st.v0 = v; st.t = 0; render(); } });

  function massWord(m) {
    if (m >= 1) return `${fmt(m, m < 10 ? 2 : 0)} M⊕ = ${sciM(m * ME, 2)} kg`;
    return `${fmt(m, 4)} M⊕ = ${sciM(m * ME, 2)} kg`;
  }
  function syncRanges() {
    st.rp = sP.setRange(Math.max(RP_LO, 1.02), RP_HI);
    st.r0 = sR0.setRange(1.05, 10);
  }

  const bMode = Object.keys(MODES).map(k => button({
    label: MODES[k].name, pressed: k === st.mode, onClick: () => setMode(k),
  }));

  function setMode(k) {
    st.mode = k;
    cache = { key: '', orbit: null, grid: null };
    bMode.forEach((b, i) => b.setPressed(Object.keys(MODES)[i] === k));
    sM2.node.hidden = k !== 'two';
    sD.node.hidden = k !== 'two';
    sP.node.hidden = k === 'orbit';
    if (k === 'two') { sP.setRange(0.02, 0.98); sP.set(st.fp); }
    else { sP.setRange(RP_LO, RP_HI); sP.set(st.rp); }
    sP.node.querySelector('label').innerHTML = k === 'two' ? '<i>x</i>/<i>d</i>' : '<i>r</i>';
    sR0.node.hidden = k !== 'orbit';
    sV0.node.hidden = k !== 'orbit';
    bPlay.node.hidden = k !== 'orbit';
    bAreas.node.hidden = k !== 'orbit';
    bGraph.node.hidden = k !== 'orbit';
    bEight.node.hidden = k !== 'orbit';
    bEsc.node.hidden = k !== 'orbit';
    bClr.node.hidden = k !== 'orbit';
    bLines.node.hidden = k === 'orbit';
    st.t = 0;
    render();
  }

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bLines = button({ label: 'Field lines', pressed: true, onClick: b => {
    st.lines = !st.lines;
    b.setAttribute('aria-pressed', String(st.lines)); render();
  } });
  const bAreas = button({ label: 'Equal areas in equal times', pressed: false,
    onClick: b => {
      st.areas = !st.areas;
      b.setAttribute('aria-pressed', String(st.areas)); render();
    } });
  const bGraph = button({ label: 'Kepler’s third law', pressed: false, onClick: b => {
    st.graph = st.graph === 'energy' ? 'kepler' : 'energy';
    b.textContent = st.graph === 'energy' ? 'Kepler’s third law' : 'Where the energy goes';
    b.setAttribute('aria-pressed', String(st.graph === 'kepler'));
    render();
  } });
  const bEight = button({ label: 'Work through eight launches', onClick: () => {
    const B = bodies(), r0 = st.r0 * Rm();
    const vLo = findGrazing(B, r0, Rm());
    const vEsc = findEscape(B, r0, 150, 30);
    /* A coarse sweep first, measuring each orbit rather than predicting it.
     * The speeds are bunched towards the fast end because that is where the
     * orbits grow: the last few per cent of the range to escape covers more
     * of the size than all the rest of it put together. */
    const trials = [];
    for (let i = 0; i < N_SWEEP; i++) {
      const u = i / (N_SWEEP - 1);
      const v = vLo + (vEsc - vLo) * (0.02 + 0.91 * Math.pow(u, 0.32));
      const o = integrate(B, r0, v, Rm(), { eta: 0.012, keep: 8 });
      if (!o.closed || o.hit) continue;
      trials.push({ v: v, a3: Math.pow((o.rMin + o.rMax) / 2, 3) });
    }
    /* then keep the eight whose MEASURED a³ sit nearest to evenly spaced, so
     * the points spread across the graph instead of piling at the origin,
     * and integrate those eight again properly for the record */
    const top = Math.max(...trials.map(r => r.a3));
    const used = new Set();
    const picks = [];
    for (let k = 1; k <= N_LAUNCH; k++) {
      const want = top * k / N_LAUNCH;
      let best = -1;
      for (let i = 0; i < trials.length; i++) {
        if (used.has(i)) continue;
        if (best < 0 || Math.abs(trials[i].a3 - want) < Math.abs(trials[best].a3 - want)) {
          best = i;
        }
      }
      if (best >= 0) { used.add(best); picks.push(trials[best].v); }
    }
    st.runs = [];
    for (const v of picks.sort((p, q) => p - q)) {
      const o = integrate(B, r0, v, Rm(), { keep: 12 });
      if (!o.closed || o.hit) continue;
      st.runs.push({ v0: v / 1000, a: (o.rMin + o.rMax) / 2, T: o.T });
    }
    st.v0 = clamp(st.runs[st.runs.length - 1].v0, V_LO, V_HI);
    sV0.set(st.v0);
    if (st.graph !== 'kepler') bGraph.node.click(); else render();
  } });
  const bEsc = button({ label: 'Find the escape speed', onClick: () => {
    const B = bodies(), r0 = st.r0 * Rm();
    st.esc = [50, 150, 600].map(far => ({ far, v: findEscape(B, r0, far, 30) }));
    render();
  } });
  const bClr = button({ label: 'Clear the launches', onClick: () => {
    st.runs = []; st.esc = null; render();
  } });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'src',  label: 'The source: its mass, its radius, and the field at its surface' },
    { key: 'mark', label: 'At the marker in the field — or, in the orbit panel, the launch' },
    { key: 'grad', label: 'The check: the gradient of the drawn potential curve, against the drawn field curve' },
    { key: 'np',   label: 'The neutral point, found by hunting for the zero of the field' },
    { key: 'orb',  label: 'The orbit, measured off the path the integrator drew' },
    { key: 'cons', label: 'What stayed constant, though nothing was told to keep it so' },
    { key: 'kep',  label: 'The T² against a³ line, and the mass it weighs out' },
    { key: 'esc',  label: 'The slowest launch that does not come back, by bisection' },
  ]);

  /* ------------------------------------------------------------- canvas */

  const mv = surface(MW, HM, { label: 'the field and the potential of the masses' });
  const gv = surface(MW, HG, { label: 'the graphs' });

  /* ------------------------------------------------------------- layout */

  root.append(
    heading('Gravitational Fields, Potential and Orbits',
            'nothing here uses <i>g</i> = <i>GM</i>/<i>r</i>², or <i>V</i> = −<i>GM</i>/<i>r</i>, '
            + 'or <i>T</i>² ∝ <i>a</i>³ — Newton’s law is added up, integrated and '
            + 'followed, and the rest is measured off the result'),
    controls([el('div', { class: 'ibs-btns' }, bMode.map(b => b.node))],
             { label: 'the arrangement:' }),
    panelBox('The map — equipotentials at equal steps, and the direction of the field',
             mv.el),
    panelBox('What can be read off it', gv.el),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bLines.node, bAreas.node, bGraph.node])]),
    controls([el('div', { class: 'ibs-btns' }, [bEight.node, bEsc.node, bClr.node])],
             { label: 'experiments:' }),
    controls([sM.node, sR.node, sM2.node, sD.node, sP.node, sR0.node, sV0.node]),
    out.node,
    note('<b>A field is a way of saying what a mass does to the space around it.</b> '
      + 'Two descriptions, one situation. The <b>field</b> <i>g</i> is the force on every '
      + 'kilogram — a vector, drawn here as the direction of the lines. The '
      + '<b>potential</b> <i>V</i> is the energy every kilogram has by being where it is, '
      + 'counted from zero at infinity, so it is always negative and a mass sits at the '
      + 'bottom of a well. The two are the same fact differently written: '
      + '<b><i>g</i> = −d<i>V</i>/d<i>r</i></b>. The graph proves it — the dashed line is the '
      + 'gradient of the potential curve, measured off the drawing, laid over the field '
      + 'curve. <b>Read the map for strength, not the lines.</b> The equipotentials are at '
      + 'equal steps of potential, so every gap is the same joule per kilogram and their '
      + 'crowding really does show where the field is strong. The field lines do not: a '
      + 'line map drawn on a page thins out as 1/<i>r</i> while the field falls as '
      + '1/<i>r</i>², because the flux from a mass spreads over a sphere and the page shows '
      + 'a slice. <b>Two masses.</b> Somewhere between them the two pulls cancel — the '
      + 'field is zero but the potential is not, and it is at its highest there, which is '
      + 'the saddle you can see in the contours. That point is found here by hunting for '
      + 'where the computed field changes sign. <b>Orbits.</b> Launch something sideways '
      + 'and integrate <i>a</i> = <i>g</i>. Nobody tells the integrator what an ellipse is, '
      + 'and an ellipse is what comes out, with the planet at a focus. Press '
      + '<b>equal areas</b> to see it sweep the same area in the same time whether it is '
      + 'close and fast or far and slow, and <b>eight launches</b> to get '
      + '<i>T</i>² against <i>a</i>³ as a straight line whose gradient weighs the planet. '
      + '<b>Escape.</b> Push the launch speed up and the path stops closing. But "does not '
      + 'come back" depends on how long you watch: the threshold found from 50 radii out '
      + 'is lower than the one found from 600, and it only reaches the escape speed if you '
      + 'wait forever. Press <b>find the escape speed</b> and watch the three answers '
      + 'converge.'));

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  const GMp = () => {
    const W = mv.w, sm = W < NARROW, H = sm ? HM_SM : HM;
    return { W, H, sm, x0: 16, x1: W - 16, y0: 26, y1: H - 34 };
  };
  const GGr = () => {
    const W = gv.w, sm = W < NARROW, H = sm ? HG_SM : HG;
    const x0 = sm ? 66 : 92, x1 = W - (sm ? 18 : 34);
    const top = 30, gap = sm ? 58 : 50, bot = H - 42;
    const ph = (bot - top - gap) / 2;
    return { W, H, sm, x0, x1, top, gap, bot, ph,
             aY0: top, aY1: top + ph, bY0: top + ph + gap, bY1: bot };
  };

  /** the world-to-panel transform, fitted to whatever the mode has to show */
  function viewOf(g) {
    const B = bodies(), R = Rm();
    const pw = g.x1 - g.x0, phh = g.y1 - g.y0;
    let cx = 0, cy = 0, k;
    if (st.mode === 'one') {
      k = (phh / 2) / (4.3 * R);
    } else if (st.mode === 'two') {
      const D = B[1].x;
      k = pw / (1.26 * D);
      cx = 0.5 * D;
    } else {
      const o = orbit();
      let xa = -R, xb = R, ya = -R, yb = R;
      for (const p of o.pts) {
        if (p.x < xa) xa = p.x; if (p.x > xb) xb = p.x;
        if (p.y < ya) ya = p.y; if (p.y > yb) yb = p.y;
      }
      cx = (xa + xb) / 2; cy = (ya + yb) / 2;
      k = Math.min(pw / ((xb - xa) * 1.1), phh / ((yb - ya) * 1.14));
    }
    const mx = (g.x0 + g.x1) / 2, my = (g.y0 + g.y1) / 2;
    return {
      k, cx, cy,
      X: x => mx + (x - cx) * k,
      Y: y => my - (y - cy) * k,
      wx0: cx - (mx - g.x0) / k, wx1: cx + (g.x1 - mx) / k,
      wy0: cy - (g.y1 - my) / k, wy1: cy + (my - g.y0) / k,
    };
  }

  /* ------------------------------------------------- the equipotentials */

  /**
   * The levels to contour at. They are equally spaced in potential, so every
   * gap between two lines is the same work per kilogram — which is what makes
   * the crowding of the lines a measurement rather than a decoration.
   */
  function levels(B) {
    if (st.mode === 'two') {
      const np = neutralPoint(B);
      const Vsad = potentialAt(np.x, np.y, B);
      const Vsurf2 = potentialAt(B[1].x - B[1].R, 0, B);
      const dV = (Vsad - Vsurf2) / 5;
      const L = [];
      for (let j = 2; j >= -9; j--) L.push(Vsad + j * dV);
      return { L, dV: Math.abs(dV), Vsad };
    }
    /* equal steps still, but anchored a quarter of a radius above the
     * surface rather than on it: the step is set by the pair of distances the
     * panel has to show, so the innermost ring never smears into the ground */
    const R = Rm();
    const far = st.mode === 'orbit' ? orbit().rMax * 1.18 : 11.2 * R;
    const Vin = potentialAt(1.25 * R, 0, B), Vout = potentialAt(far, 0, B);
    const n = 9, dV = (Vout - Vin) / n;
    const L = [];
    for (let j = 0; j <= n; j++) L.push(Vin + j * dV);
    return { L, dV: Math.abs(dV), Vsad: null };
  }

  /** the contour segments for every level, in panel coordinates, cached */
  function contours(g, v, B) {
    const k = [keyOf(), g.W, g.H, v.k, v.cx, v.cy].join('|');
    if (cache.grid && cache.grid.k === k) return cache.grid;
    const grid = potentialGrid(g, v);
    const lv = levels(B);
    const set = lv.L.map(level => ({
      level,
      saddle: lv.Vsad != null && Math.abs(level - lv.Vsad) < 1e-9 * Math.abs(lv.Vsad),
      segs: contourGrid(grid.V, grid.nx, grid.ny, level)
        .map(([a, b]) => [[grid.px(a[0]), grid.py(a[1])],
                          [grid.px(b[0]), grid.py(b[1])]]),
    }));
    cache.grid = { k, set, dV: lv.dV };
    return cache.grid;
  }

  /** a grid of computed potentials over the visible rectangle */
  function potentialGrid(g, v) {
    const B = bodies();
    const step = g.sm ? 6 : 5;
    const nx = Math.max(8, Math.round((g.x1 - g.x0) / step)) + 1;
    const ny = Math.max(8, Math.round((g.y1 - g.y0) / step)) + 1;
    const V = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const py = g.y0 + (j / (ny - 1)) * (g.y1 - g.y0);
      const wy = v.cy + ((g.y0 + g.y1) / 2 - py) / v.k;
      for (let i = 0; i < nx; i++) {
        const px = g.x0 + (i / (nx - 1)) * (g.x1 - g.x0);
        const wx = v.cx + (px - (g.x0 + g.x1) / 2) / v.k;
        let inside = false;
        for (const b of B) if (Math.hypot(wx - b.x, wy - b.y) < b.R) inside = true;
        V[j * nx + i] = inside ? NaN : potentialAt(wx, wy, B);
      }
    }
    return { V, nx, ny,
             px: i => g.x0 + (i / (nx - 1)) * (g.x1 - g.x0),
             py: j => g.y0 + (j / (ny - 1)) * (g.y1 - g.y0) };
  }

  /* --------------------------------------------------- the field lines */

  /** follow the computed field outward from a starting point */
  function traceLine(x, y, B, g, v, px = 3, outward = true) {
    const h = px / v.k;                     // about three drawn pixels a step
    const pts = [[x, y]];
    for (let n = 0; n < 3600; n++) {
      const f1 = fieldAt(x, y, B);
      if (!(f1.mag > 0)) break;
      const s = (outward ? -1 : 1) * h;
      /* the midpoint rule: look ahead HALF a step, take the direction found
       * there, and use it for the whole step. Looking ahead a full step and
       * using the direction at the far end instead would be first order, and
       * the line would visibly cut the corner wherever the field turns */
      const mx = x + 0.5 * s * f1.gx / f1.mag, my = y + 0.5 * s * f1.gy / f1.mag;
      const f2 = fieldAt(mx, my, B);
      if (!(f2.mag > 0)) break;
      x += s * f2.gx / f2.mag; y += s * f2.gy / f2.mag;
      pts.push([x, y]);
      let hitBody = false;
      for (const b of B) if (Math.hypot(x - b.x, y - b.y) < b.R * 0.98) hitBody = true;
      if (hitBody) break;
      if (x < v.wx0 - h || x > v.wx1 + h || y < v.wy0 - h || y > v.wy1 + h) break;
    }
    return pts;
  }

  function fieldLines(B, g, v, px = 3) {
    const lines = [];
    const n = g.sm ? 14 : 20;
    for (const b of B) {
      for (let i = 0; i < n; i++) {
        const th = TAU * (i + 0.5) / n;
        lines.push(traceLine(b.x + b.R * 1.01 * Math.cos(th),
                             b.y + b.R * 1.01 * Math.sin(th), B, g, v, px));
      }
    }
    return lines;
  }

  /* ----------------------------------------------------------- helpers */

  /** tick values at 1, 2, 2.5 or 5 times a power of ten */
  function ticks(lo, hi, want = 6) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / want, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const stepN = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const out = [];
    for (let t = Math.ceil(lo / stepN) * stepN; t <= hi + stepN * 1e-9; t += stepN) {
      out.push(Math.abs(t) < stepN * 1e-9 ? 0 : t);
    }
    return out;
  }

  /* These are declarations rather than arrow constants because the sliders
   * format their own starting values while they are being built, which is
   * before anything written with const down here has been initialised. */
  /** scientific notation with a real minus sign, not a hyphen */
  function sciM(v, n) { return sci(v, n).replace('-', '\u2212'); }
  function kmS(v) { return `${fmt(v / 1000, 3)} km s⁻¹`; }
  function metres(m) {
    return m >= 1e9 ? `${sciM(m, 3)} m` : `${fmt(m / 1e6, m < 1e7 ? 3 : 2)} × 10⁶ m`;
  }
  function hours(s) {
    return s < 7200 ? `${fmt(s / 60, 1)} min`
         : s < 2 * 86400 ? `${fmt(s / 3600, 2)} h` : `${fmt(s / 86400, 2)} days`;
  }

  /* --------------------------------------------------------- the map */

  function drawMap() {
    const g = GMp(), v = viewOf(g), B = bodies();
    const ctx = mv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0); ctx.clip();

    /* the equipotentials, contoured from computed values. Kept between
     * frames: they depend on the masses and the view, not on the clock, and
     * the orbit panel would otherwise re-contour the whole grid sixty times
     * a second to move one dot. */
    const lv = contours(g, v, B);
    const faint = st.mode === 'orbit';
    for (const c of lv.set) {
      ctx.strokeStyle = P.accent;
      ctx.globalAlpha = c.saddle ? 1 : faint ? 0.34 : 0.5;
      ctx.lineWidth = c.saddle ? 2.4 : 1.3;
      ctx.beginPath();
      for (const [a, b] of c.segs) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* the field lines: direction only, and the caption says so */
    if (st.lines && st.mode !== 'orbit') {
      const FL = fieldLines(B, g, v);
      ctx.strokeStyle = P.text; ctx.globalAlpha = 0.22; ctx.lineWidth = 1;
      for (const L of FL) {
        ctx.beginPath();
        L.forEach((p, i) => i ? ctx.lineTo(v.X(p[0]), v.Y(p[1]))
                              : ctx.moveTo(v.X(p[0]), v.Y(p[1])));
        ctx.stroke();
      }
      ctx.globalAlpha = 0.4;
      for (const L of FL) {
        /* one head per line, pointing the way the field points: inward */
        const i = Math.min(L.length - 1, Math.round(L.length * 0.55));
        if (i < 2) continue;
        const a = L[i], b = L[i - 1];
        carrow(ctx, v.X(a[0]), v.Y(a[1]), v.X(b[0]), v.Y(b[1]),
               { color: P.text, width: 1.2, head: 7, min: 0 });
      }
      ctx.globalAlpha = 1;
    }

    if (st.mode === 'orbit') drawOrbit(ctx, g, v, B);
    else drawMarker(ctx, g, v, B);

    /* the masses themselves */
    for (const b of B) {
      const rr = Math.max(3, b.R * v.k);
      ctx.fillStyle = P.soft; ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(v.X(b.x), v.Y(b.y), rr, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(v.X(b.x), v.Y(b.y), 2, 0, TAU); ctx.fill();
    }
    ctx.restore();

    /* frame, scale bar and the two captions */
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, g.y0 + 0.5, g.x1 - g.x0 - 1, g.y1 - g.y0 - 1);

    scaleBar(ctx, g, v);
    ctext(ctx, `equipotentials every ${sciM(lv.dV, 2)} J kg⁻¹`,
          g.x0 + 4, g.y0 - 10, { font: `600 11.5px ${P.font}`, color: P.accent,
                                 align: 'left' });
    if (st.mode !== 'orbit' && st.lines) {
      /* on a phone this has to live inside the frame, because the scale bar
       * has the row below it to itself */
      if (g.sm) {
        ctext(ctx, 'line spacing means nothing — direction only',
              g.x0 + 6, g.y1 - 8, { font: `500 10.5px ${P.font}`, color: P.muted,
                                    align: 'left', halo: P.bg, haloWidth: 4 });
      } else {
        ctext(ctx, 'the spacing of the field lines means nothing — only their direction. '
                 + 'A plane map thins as 1/r; the field falls as 1/r²',
              g.x1 - 2, g.H - 12, { font: `500 11px ${P.font}`, color: P.muted,
                                    align: 'right' });
      }
    }
  }

  function scaleBar(ctx, g, v) {
    const want = (g.x1 - g.x0) * 0.2 / v.k;
    const p = Math.pow(10, Math.floor(Math.log10(want)));
    const m = want / p;
    const L = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
    const w = L * v.k, x = g.x0 + 10, y = g.H - 16;
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    ctx.moveTo(x + w, y - 4); ctx.lineTo(x + w, y + 4);
    ctx.stroke();
    ctext(ctx, metres(L), x + w + 8, y + 4,
          { font: `600 11.5px ${P.font}`, color: P.text, align: 'left' });
  }

  function drawMarker(ctx, g, v, B) {
    const R = Rm();
    let x, y = 0;
    if (st.mode === 'two') x = st.fp * B[1].x;
    else x = st.rp * R;
    const f = fieldAt(x, y, B);
    /* One fixed length, everywhere. An arrow drawn in proportion to the field
     * would be invisible two radii out and a foot long at the surface, and
     * any compression of that scale would be a second liberty on a panel that
     * has already declared its one. The map says which way; the graph below
     * says how much, and the marker is on both. */
    const len = 42;
    const X = v.X(x), Y = v.Y(y);
    if (f.mag > 0) {
      carrow(ctx, X, Y, X + len * f.gx / f.mag, Y - len * f.gy / f.mag,
             { color: P.accent, width: 2.6, head: 10 });
    }
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(X, Y, 5, 0, TAU); ctx.fill(); ctx.stroke();
  }

  function drawOrbit(ctx, g, v, B) {
    const o = orbit();
    /* the two equal-time sectors, if asked for */
    if (st.areas && o.closed) {
      const win = o.T / 9;
      const iMin = o.pts.reduce((b, p, i) => p.r < o.pts[b].r ? i : b, 0);
      const iMax = o.pts.reduce((b, p, i) => p.r > o.pts[b].r ? i : b, 0);
      ctx.fillStyle = P.soft;
      for (const i0 of [iMin, iMax]) {
        let i1 = i0;
        while (i1 + 1 < o.pts.length && o.pts[i1].t - o.pts[i0].t < win) i1++;
        ctx.beginPath();
        ctx.moveTo(v.X(0), v.Y(0));
        for (let i = i0; i <= i1; i++) ctx.lineTo(v.X(o.pts[i].x), v.Y(o.pts[i].y));
        ctx.closePath(); ctx.fill();
      }
      o.sect = [iMin, iMax].map(i0 => {
        let i1 = i0;
        while (i1 + 1 < o.pts.length && o.pts[i1].t - o.pts[i0].t < win) i1++;
        return { A: sweptArea(o.pts, i0, i1), dt: o.pts[i1].t - o.pts[i0].t };
      });
    } else o.sect = null;

    /* the path */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    ctx.beginPath();
    o.pts.forEach((p, i) => i ? ctx.lineTo(v.X(p.x), v.Y(p.y))
                              : ctx.moveTo(v.X(p.x), v.Y(p.y)));
    ctx.stroke(); ctx.globalAlpha = 1;

    /* the satellite, where it has got to */
    const tEnd = o.closed ? o.T : o.pts[o.pts.length - 1].t;
    const tt = o.closed ? (st.t % tEnd) : Math.min(st.t, tEnd);
    let i = 0;
    while (i + 1 < o.pts.length && o.pts[i + 1].t < tt) i++;
    const a = o.pts[i], b = o.pts[Math.min(i + 1, o.pts.length - 1)];
    const u = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0;
    const sx = a.x + (b.x - a.x) * u, sy = a.y + (b.y - a.y) * u;
    const vx = (b.x - a.x), vy = (b.y - a.y), vn = Math.hypot(vx, vy) || 1;
    const sp = a.v + (b.v - a.v) * u;
    const alen = clamp(52 * sp / Math.max(...o.pts.map(p => p.v)), 10, 60);
    carrow(ctx, v.X(sx), v.Y(sy), v.X(sx) + alen * vx / vn, v.Y(sy) - alen * vy / vn,
           { color: P.accent, width: 2.4, head: 9 });
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(v.X(sx), v.Y(sy), 4.6, 0, TAU); ctx.fill();

    /* Kepler's first law, made visible: the planet is at a focus, and the
     * centre of the ellipse is somewhere else entirely. Both points are
     * taken off the drawn path — the apsides are simply its nearest and
     * farthest points, and the centre is halfway between them. */
    if (o.closed && !o.hit) {
      const near = o.pts.reduce((b, q) => q.r < b.r ? q : b, o.pts[0]);
      const far = o.pts.reduce((b, q) => q.r > b.r ? q : b, o.pts[0]);
      const mx = (near.x + far.x) / 2, my = (near.y + far.y) / 2;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(v.X(near.x), v.Y(near.y));
      ctx.lineTo(v.X(far.x), v.Y(far.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const cross = (X, Y, s) => {
        ctx.beginPath();
        ctx.moveTo(X - s, Y - s); ctx.lineTo(X + s, Y + s);
        ctx.moveTo(X - s, Y + s); ctx.lineTo(X + s, Y - s);
        ctx.lineWidth = 2; ctx.stroke();
      };
      cross(v.X(mx), v.Y(my), 6);
      const tag = (s, X, Y, al) => ctext(ctx, s, X, Y,
        { font: `600 11.5px ${P.font}`, color: P.accent, align: al,
          halo: P.bg, haloWidth: 4.5 });
      tag(g.sm ? 'nearest' : `nearest ${metres(o.rMin)}`,
          v.X(near.x) + (near.x > mx ? 8 : -8), v.Y(near.y) - 12,
          near.x > mx ? 'left' : 'right');
      tag(g.sm ? 'farthest' : `farthest ${metres(o.rMax)}`,
          v.X(far.x) + (far.x > mx ? 8 : -8), v.Y(far.y) - 12,
          far.x > mx ? 'left' : 'right');
      /* the key goes in the wide empty margin the ellipse leaves behind */
      if (!g.sm) {
        const lx = g.x0 + 16, ly = g.y0 + 26;
        ctx.lineWidth = 2; ctx.strokeStyle = P.accent;
        cross(lx + 7, ly - 4, 5);
        tag('the centre of the ellipse', lx + 20, ly, 'left');
        ctx.fillStyle = P.soft; ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(lx + 7, ly + 16, 6, 0, TAU); ctx.fill(); ctx.stroke();
        tag('the planet — at a focus, not the centre', lx + 20, ly + 20, 'left');
      }
    }

    if (o.hit) {
      ctext(ctx, 'this one hits the surface', v.X(0), v.Y(0) - Rm() * v.k - 12,
            { font: `700 12px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
    } else if (!o.closed) {
      ctext(ctx, 'this path does not close', v.X(0), v.Y(0) - Rm() * v.k - 12,
            { font: `700 12px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
    }
  }

  /* ------------------------------------------------------- the graphs */

  /**
   * The field and the potential sampled along the axis the mode cares about:
   * straight out from the mass, or along the line joining two of them.
   *
   * `deriv` is the gradient of the SAMPLED potential, taken by central
   * differences on the same points that get drawn. It is not computed from
   * anything else, which is the whole point: it is the drawn curve's own
   * slope, and it is laid over the drawn field curve to see whether they
   * are the same line.
   */
  /**
   * The sample points. They are NOT evenly spaced, and that is deliberate.
   * A central difference can only measure a gradient if its two arms are
   * short compared with the distance over which the thing changes, and what
   * V changes over is the distance to the nearest mass. So the step is kept
   * at a fixed small fraction of that distance, which crowds the samples
   * against each body and spreads them out in between. An even grid over the
   * Earth–Moon line would be sampling the Moon's potential in strides longer
   * than the Moon is far away.
   */
  function axisSamples(B, u0, u1, frac = 0.006) {
    const us = [u0];
    let u = u0;
    while (u < u1 && us.length < 4000) {
      let near = Infinity;
      for (const b of B) near = Math.min(near, Math.abs(u - b.x));
      u = Math.min(u + Math.max(near * frac, (u1 - u0) * 2e-5), u1);
      us.push(u);
    }
    return us;
  }

  function radial() {
    const B = bodies(), R = Rm();
    const two = st.mode === 'two';
    const u0 = two ? B[0].R * 1.04 : R;
    const u1 = two ? B[1].x - B[1].R * 1.04 : 6.2 * R;
    const us = axisSamples(B, u0, u1);
    const gs = [], Vs = [], parts = B.map(() => []);
    for (const u of us) {
      const f = fieldAt(u, 0, B);
      gs.push(two ? f.gx : f.mag);
      Vs.push(potentialAt(u, 0, B));
      B.forEach((b, j) => parts[j].push(b.GM / Math.pow(Math.abs(u - b.x), 2)));
    }
    const n = us.length - 1;
    const deriv = us.map((_, i) => {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      const d = (Vs[b] - Vs[a]) / (us[b] - us[a]);
      return two ? -d : d;                 // g = −dV/dr; magnitudes drop the sign
    });
    const mark = two ? st.fp * B[1].x : st.rp * R;
    return { us, gs, Vs, deriv, parts, u0, u1, two, mark };
  }

  const plot = (b, xlo, xhi, ylo, yhi) => ({
    ...b, xlo, xhi, ylo, yhi,
    X: x => b.x0 + (x - xlo) / (xhi - xlo) * (b.x1 - b.x0),
    Y: y => b.y1 - (y - ylo) / (yhi - ylo) * (b.y1 - b.y0),
  });

  function frameOf(ctx, p, o) {
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(p.x0 + 0.5, p.y0 + 0.5, p.x1 - p.x0 - 1, p.y1 - p.y0 - 1);
    ctx.font = `500 10.5px ${P.font}`;
    for (const t of ticks(p.ylo, p.yhi, o.yw || 4)) {
      const y = p.Y(t);
      if (y < p.y0 - 1 || y > p.y1 + 1) continue;
      ctx.strokeStyle = Math.abs(t) < 1e-30 ? P.frame : P.soft;
      ctx.globalAlpha = Math.abs(t) < 1e-30 ? 1 : 0.8;
      ctx.beginPath(); ctx.moveTo(p.x0, y); ctx.lineTo(p.x1, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctext(ctx, o.yfmt(t), p.x0 - 6, y + 3.5,
            { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right' });
    }
    for (const t of ticks(p.xlo, p.xhi, o.xw || 6)) {
      const x = p.X(t);
      if (x < p.x0 - 1 || x > p.x1 + 1) continue;
      ctx.strokeStyle = P.soft; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(x, p.y0); ctx.lineTo(x, p.y1); ctx.stroke();
      ctx.globalAlpha = 1;
      if (o.xlab !== false) {
        ctext(ctx, o.xfmt(t), x, p.y1 + 15,
              { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });
      }
    }
    if (o.title) {
      ctext(ctx, o.title, p.x0, p.y0 - 7,
            { font: `600 11.5px ${P.font}`, color: P.accent, align: 'left' });
    }
    if (o.xtitle) {
      ctext(ctx, o.xtitle, (p.x0 + p.x1) / 2, p.y1 + 32,
            { font: `600 11.5px ${P.font}`, color: P.accent, align: 'center' });
    }
  }

  const curve = (ctx, p, xs, ys, o = {}) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); ctx.clip();
    ctx.strokeStyle = o.color || P.text; ctx.lineWidth = o.width || 2;
    ctx.lineJoin = 'round';
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      if (!isFinite(ys[i])) { started = false; continue; }
      const X = p.X(xs[i]), Y = p.Y(ys[i]);
      started ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      started = true;
    }
    ctx.stroke();
    ctx.restore();
  };

  function drawGraph() {
    const g = GGr(), ctx = gv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    if (st.mode === 'orbit') {
      if (st.graph === 'kepler') drawKepler(ctx, g); else drawEnergy(ctx, g);
      return;
    }
    const d = radial(), B = bodies(), R = Rm();
    const uScale = d.two ? B[1].x : R;
    const xf = t => fmt(t / uScale, d.two ? 2 : 1);
    const logY = d.two;

    /* --- top: the field along the axis, with the potential's own gradient
     * laid over it. With two masses the field runs from nine newtons a
     * kilogram at the planet's surface down through exactly zero and back up
     * again, so the magnitude is drawn on a log scale: the plunge to the
     * floor of the frame IS the neutral point, and no linear axis can show
     * both ends of a seven-decade range. */
    const gA = logY ? d.gs.map(v => Math.log10(Math.abs(v))) : d.gs;
    const dA = logY ? d.deriv.map(v => Math.log10(Math.abs(v))) : d.deriv;
    const gTop = Math.max(...gA.filter(isFinite));
    const pA = logY
      ? plot({ x0: g.x0, x1: g.x1, y0: g.aY0, y1: g.aY1 },
             d.u0, d.u1, gTop - 7.4, gTop + 0.35)
      : plot({ x0: g.x0, x1: g.x1, y0: g.aY0, y1: g.aY1 },
             d.u0, d.u1, 0, Math.max(...d.gs) * 1.08 || 1);
    frameOf(ctx, pA, {
      yfmt: t => logY ? sciM(Math.pow(10, t), 0) : fmt(t, gTop > 3 ? 1 : 2),
      xfmt: xf, xlab: false, yw: logY ? 7 : 4,
      title: d.two
        ? (g.sm ? '|g| along the join, N kg⁻¹ — log scale'
                : 'the size of g along the line joining them, N kg⁻¹ — log scale')
        : 'g, the field strength — N kg⁻¹',
    });
    if (d.two) {
      /* the two pulls separately: they are equal where the total vanishes */
      ctx.globalAlpha = 0.45;
      for (const part of d.parts) {
        curve(ctx, pA, d.us, part.map(v => Math.log10(v)),
              { color: P.text, width: 1.2 });
      }
      ctx.globalAlpha = 1;
    }
    curve(ctx, pA, d.us, dA, { color: P.accent, width: 3.6, dash: [7, 6] });
    curve(ctx, pA, d.us, gA, { color: P.text, width: 2 });

    /* --- bottom: the potential. With two masses the well beside the planet
     * is forty times deeper than anything else on the line, so the frame is
     * set by the outer part and the near-planet plunge runs off the bottom. */
    const keep = d.Vs.filter((_, i) => !d.two || d.us[i] > d.u0 + 0.12 * (d.u1 - d.u0));
    const vLo = Math.min(...keep) * (d.two ? 1.12 : 1.06);
    const vHi = d.two ? Math.max(...keep) * 0.55 : Math.max(...d.Vs) * 0.9;
    const pB = plot({ x0: g.x0, x1: g.x1, y0: g.bY0, y1: g.bY1 },
                    d.u0, d.u1, vLo, vHi);
    frameOf(ctx, pB, {
      yfmt: t => t === 0 ? '0' : sciM(t, 1), xfmt: xf,
      title: 'V, the potential — J kg⁻¹, counted from zero at infinity',
      xtitle: d.two ? 'distance from the planet, as a fraction of the separation d'
                    : 'distance from the centre, in planet radii R',
    });
    curve(ctx, pB, d.us, d.Vs, { color: P.text, width: 2.2 });

    /* the marker, on both */
    const fm = fieldAt(d.mark, 0, B);
    for (const [p, val] of [[pA, logY ? Math.log10(Math.abs(fm.gx)) : fm.mag],
                            [pB, potentialAt(d.mark, 0, B)]]) {
      const X = p.X(d.mark), Y = p.Y(val);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(X, p.y0); ctx.lineTo(X, p.y1); ctx.stroke();
      ctx.setLineDash([]);
      if (Y >= p.y0 - 2 && Y <= p.y1 + 2) {
        ctx.fillStyle = P.bg; ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(X, Y, 5, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }

    /* the neutral point, located on the drawn field curve itself: the sample
     * where the computed field changes sign, interpolated between neighbours */
    if (d.two) {
      const i = d.gs.findIndex((v, k) => k > 0 && d.gs[k - 1] * v <= 0);
      if (i > 0) {
        const t = d.gs[i - 1] / (d.gs[i - 1] - d.gs[i]);
        const xn = d.us[i - 1] + (d.us[i] - d.us[i - 1]) * t;
        for (const p of [pA, pB]) {
          ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.8;
          ctx.beginPath(); ctx.moveTo(p.X(xn), p.y0); ctx.lineTo(p.X(xn), p.y1);
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctext(ctx, g.sm ? 'g = 0' : 'the field is zero here — and V is at its highest',
              pA.X(xn) - 7, pA.y1 - 8,
              { font: `700 11px ${P.font}`, color: P.accent, align: 'right',
                halo: P.bg, haloWidth: 4.5 });
      }
    }

    if (!g.sm) {
      ctext(ctx, 'dashed: the gradient of the curve below, measured off it',
            g.x1, g.aY0 - 7,
            { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    } else {
      ctext(ctx, 'dashed: the gradient of V below', g.x1, g.bY0 - 26,
            { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right' });
    }
  }

  function drawEnergy(ctx, g) {
    const o = orbit(), B = bodies();
    const box = { x0: g.x0, x1: g.x1, y0: g.top + 8, y1: g.bot };
    const rs = [], ke = [], pe = [], tot = [];
    const N = 300;
    for (let i = 0; i <= N; i++) {
      const r = o.rMin + (o.rMax - o.rMin) * i / N;
      rs.push(r); pe.push(potentialAt(r, 0, B));
    }
    /* the kinetic term is not computed from anything — it is ½v² read off
     * the path the integrator drew, plotted against where it was */
    const pr = o.pts.map(p => p.r), pk = o.pts.map(p => 0.5 * p.v * p.v);
    const pt = o.pts.map((p, i) => pk[i] + potentialAt(p.x, p.y, B));
    const lo = Math.min(...pe) * 1.06, hi = Math.max(...pk) * 1.12;
    const p = plot(box, o.rMin, o.rMax, lo, hi);
    frameOf(ctx, p, {
      yfmt: t => t === 0 ? '0' : sciM(t, 1), xfmt: t => fmt(t / Rm(), 1), yw: 6,
      title: 'energy per kilogram along the orbit — J kg⁻¹',
      xtitle: 'distance from the centre, in planet radii R',
    });
    curve(ctx, p, pr, pk, { color: P.text, width: 2.2 });
    curve(ctx, p, rs, pe, { color: P.text, width: 2.2 });
    curve(ctx, p, pr, pt, { color: P.accent, width: 3.2 });
    const lab = (x, y, s, al) => ctext(ctx, s, x, y,
      { font: `600 11.5px ${P.font}`, color: P.accent, align: al || 'left',
        halo: P.bg, haloWidth: 4.5 });
    const atR = target => o.pts.reduce((b, q, i) =>
      Math.abs(q.r - target) < Math.abs(o.pts[b].r - target) ? i : b, 0);
    const iK = atR(o.rMin + 0.34 * (o.rMax - o.rMin));
    const iP = Math.round(rs.length * 0.66);
    lab(p.X(pr[iK]) + 12, p.Y(pk[iK]) + 26, 'kinetic, ½v²');
    lab(p.X(rs[iP]) + 10, p.Y(pe[iP]) - 12, 'potential, V');
    lab(p.X((o.rMin + o.rMax) / 2), p.Y(pt[0]) - 12,
        g.sm ? 'their sum — flat' : 'their sum — flat, though nothing was told to keep it so',
        'center');
  }

  function drawKepler(ctx, g) {
    const box = { x0: g.x0, x1: g.x1, y0: g.top + 8, y1: g.bot };
    const pts = st.runs.map(r => [Math.pow(r.a, 3), r.T * r.T]);
    const xhi = (pts.length ? Math.max(...pts.map(q => q[0])) : 1) * 1.14;
    const yhi = (pts.length ? Math.max(...pts.map(q => q[1])) : 1) * 1.14;
    const p = plot(box, 0, xhi, 0, yhi);
    frameOf(ctx, p, {
      yfmt: t => t === 0 ? '0' : sciM(t, 1), xfmt: t => t === 0 ? '0' : sciM(t, 1),
      yw: 5, xw: 5,
      title: 'T² against a³ — one point for each launch',
      xtitle: 'a³ / m³   (a is half the sum of the nearest and farthest distances reached)',
    });
    if (!pts.length) {
      ctext(ctx, 'press “work through eight launches”', (p.x0 + p.x1) / 2,
            (p.y0 + p.y1) / 2, { font: `600 13px ${P.font}`, color: P.muted,
                                 align: 'center' });
      return;
    }
    const grad = fitThroughOrigin(pts);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(p.X(0), p.Y(0)); ctx.lineTo(p.X(xhi), p.Y(grad * xhi));
    ctx.stroke();
    for (const [x, y] of pts) {
      ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.X(x), p.Y(y), 5, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }

  const fitThroughOrigin = pts => {
    let sxy = 0, sxx = 0;
    for (const [x, y] of pts) { sxy += x * y; sxx += x * x; }
    return sxx > 0 ? sxy / sxx : 0;
  };

  /* --------------------------------------------------------- readouts */

  /** how badly the gradient of the drawn potential curve misses the drawn
   *  field curve, as a fraction of the biggest field on the graph */
  function gradCheck(d) {
    const scale = Math.max(...d.gs.map(Math.abs));
    let worst = 0, rel = 0;
    for (let i = 2; i < d.us.length - 2; i++) {
      const gap = Math.abs(d.deriv[i] - d.gs[i]);
      worst = Math.max(worst, gap);
      /* a fractional miss is meaningless where the field itself is passing
       * through zero, so the fraction is taken only where there is a field
       * worth dividing by */
      if (Math.abs(d.gs[i]) > 1e-4 * scale) {
        rel = Math.max(rel, gap / Math.abs(d.gs[i]));
      }
    }
    return { worst, rel, scale };
  }

  function render() {
    drawMap(); drawGraph();
    const B = bodies(), R = Rm();
    const gS = fieldAt(R, 0, B).mag, VS = potentialAt(R, 0, B);
    const o = st.mode === 'orbit' ? orbit() : null;

    const vals = {
      src: `M = ${fmt(st.M, st.M < 10 ? 3 : 1)} M⊕ = ${sciM(st.M * ME, 3)} kg, `
         + `R = ${metres(R)} → at the surface g = ${fmt(gS, 3)} N kg⁻¹ `
         + `and V = ${sciM(VS, 3)} J kg⁻¹`,
      mark: 'switch away from the orbit to put a marker in the field',
      grad: '—', np: 'switch to two masses to see this',
      orb: 'switch to the orbit to see this',
      cons: 'switch to the orbit to see this',
      kep: st.runs.length
        ? '' : 'in the orbit panel, press “work through eight launches”',
      esc: st.esc ? '' : 'in the orbit panel, press “find the escape speed”',
    };

    if (st.mode !== 'orbit') {
      const d = radial(), c = gradCheck(d);
      const f = fieldAt(d.mark, 0, B), V = potentialAt(d.mark, 0, B);
      vals.mark = d.two
        ? `${fmt(st.fp, 3)} of the way across, ${metres(d.mark)} from the planet: `
          + `g = ${sciM(f.gx, 3)} N kg⁻¹ along the join, V = ${sciM(V, 3)} J kg⁻¹`
        : `${fmt(st.rp, 2)} R = ${metres(d.mark)} out: g = ${fmt(f.mag, 4)} N kg⁻¹ `
          + `(${fmt(gS / Math.max(f.mag, 1e-30), 2)}× weaker than at the surface, `
          + `for ${fmt(st.rp, 2)}× the distance), V = ${sciM(V, 3)} J kg⁻¹`;
      vals.grad = `across every sample drawn, the gradient of the potential curve `
        + `differs from the field curve by at most ${sciM(c.rel * 100, 2)}% `
        + `(${sciM(c.worst, 2)} N kg⁻¹ at the worst point), which is the error of the `
        + `central difference and not of the physics`;
      if (d.two) {
        const np = neutralPoint(B);
        const Vn = potentialAt(np.x, np.y, B);
        vals.np = `${fmt(np.f * 100, 3)}% of the way from the planet to the companion, `
          + `at ${metres(np.x)}. The field there is `
          + `${sciM(fieldAt(np.x, 0, B).mag, 2)} N kg⁻¹ — but the potential is `
          + `${sciM(Vn, 3)} J kg⁻¹, not zero, and it is the highest anywhere on the join`;
      }
    } else {
      const a = o.a, e = o.e;
      vals.mark = `launched at ${fmt(st.r0, 2)} R = ${metres(st.r0 * R)} out, `
        + `sideways at ${kmS(st.v0 * 1000)}`;
      vals.grad = 'switch away from the orbit to see the gradient check';
      vals.orb = o.hit
        ? `this launch reaches the surface — nothing to measure`
        : !o.closed
          ? `it was still climbing at 80 launch-radii out and had not turned round: `
            + `nearest ${metres(o.rMin)}, and no period to measure`
          : `nearest ${metres(o.rMin)}, farthest ${metres(o.rMax)} → `
            + `a = ${metres(a)}, e = ${fmt(e, 3)}, and it came back after `
            + `${hours(o.T)}. Taken in ${o.steps} steps of ${fmt(o.dt, 2)} s`;
      if (o.closed && !o.hit) {
        const sec = o.sect;
        vals.cons = `energy per kilogram ${sciM(o.eps0, 4)} J kg⁻¹, drifting by `
          + `${sciM(o.epsDrift * 100, 1)}% over the whole orbit; `
          + `angular momentum per kilogram ${sciM(o.L0, 4)} m² s⁻¹, by `
          + `${sciM(o.Ldrift * 100, 1)}%`
          + (sec ? `. The two shaded sectors take ${hours(sec[0].dt)} each and cover `
                 + `${sciM(sec[0].A, 4)} and ${sciM(sec[1].A, 4)} m²` : '');
      }
    }
    if (st.runs.length) {
      const grad = fitThroughOrigin(st.runs.map(r => [Math.pow(r.a, 3), r.T * r.T]));
      const GMfit = 4 * Math.PI * Math.PI / grad;
      vals.kep = `${st.runs.length} launches lie on a straight line through the origin `
        + `of gradient ${sciM(grad, 4)} s² m⁻³. Reading that as 4π²/GM gives `
        + `M = ${sciM(GMfit / G, 4)} kg = ${fmt(GMfit / G / ME, 3)} M⊕ `
        + `(the planet was set to ${fmt(st.M, 3)} M⊕)`;
    }
    if (st.esc) {
      vals.esc = st.esc.map(x => `watching out to ${x.far} R₀: ${kmS(x.v)}`).join(';  ')
        + `.  Each is larger than the last — the threshold creeps up as you watch `
        + `longer, and only at infinity is it the escape speed`;
    }
    out.setAll(vals);
  }

  /* -------------------------------------------------------- the animation */

  const anim = loop(dt => {
    if (!st.playing || st.mode !== 'orbit') return;
    const o = orbit();
    const span = o.closed ? o.T : o.pts[o.pts.length - 1].t;
    st.t += Math.min(dt, 0.05) * span / 11;
    drawMap();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  function fitAll() {
    P = palette(root);
    const cw = Math.round(mv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      mv.setLogical(w, w < NARROW ? HM_SM : HM);
      gv.setLogical(w, w < NARROW ? HG_SM : HG);
    }
    mv.fit(); gv.fit();
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

  setMode('one');
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      const m = p.mode;
      Object.assign(st, p);
      sM.set(Math.log10(st.M)); sR.set(st.R);
      sM2.set(Math.log10(st.M2)); sD.set(st.d);
      sP.set(st.mode === 'two' ? st.fp : st.rp);
      sR0.set(st.r0); sV0.set(st.v0);
      cache = { key: '', orbit: null, grid: null };
      if (m) setMode(m); else render();
    },
    _state: () => {
      const B = bodies(), R = Rm();
      const s = {
        mode: st.mode, M: st.M, R: st.R, M2: st.M2, d: st.d,
        rp: st.rp, fp: st.fp, r0: st.r0, v0: st.v0, graph: st.graph,
        GM: GMof(st.M), Rm: R,
        gSurf: fieldAt(R, 0, B).mag, VSurf: potentialAt(R, 0, B),
        runs: st.runs.map(r => ({ ...r })), esc: st.esc,
      };
      if (st.mode === 'two') {
        const np = neutralPoint(B);
        s.neutral = { f: np.f, x: np.x, g: fieldAt(np.x, 0, B).mag,
                      V: potentialAt(np.x, np.y, B) };
        s.d2 = B[1].x; s.GM2 = B[1].GM; s.R2 = B[1].R;
      }
      if (st.mode === 'orbit') {
        const o = orbit();
        s.orbit = { closed: o.closed, hit: o.hit, T: o.T, rMin: o.rMin, rMax: o.rMax,
                    a: o.a, e: o.e, eps0: o.eps0, L0: o.L0,
                    epsDrift: o.epsDrift, Ldrift: o.Ldrift,
                    steps: o.steps, dt: o.dt, n: o.pts.length };
      }
      return s;
    },
    _field: (x, y, over) => fieldAt(x, y, bodies(over)),
    _potential: (x, y, over) => potentialAt(x, y, bodies(over)),
    _bodies: over => bodies(over).map(b => ({ ...b })),
    _radial: () => {
      const d = radial();
      return { us: d.us, gs: d.gs, Vs: d.Vs, deriv: d.deriv,
               u0: d.u0, u1: d.u1, two: d.two, mark: d.mark,
               check: gradCheck(d) };
    },
    _orbit: over => {
      const B = bodies(over), s = { ...st, ...over };
      const o = integrate(B, s.r0 * s.R * RE, s.v0 * 1000, s.R * RE);
      return { closed: o.closed, hit: o.hit, T: o.T, rMin: o.rMin, rMax: o.rMax,
               dt: o.dt, steps: o.steps,
               eps: o.eps.slice(), L: o.L.slice(),
               pts: o.pts.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy,
                                      t: p.t, r: p.r, v: p.v })) };
    },
    _neutral: over => {
      const np = neutralPoint(bodies(over));
      return np && { f: np.f, x: np.x, d: np.d };
    },
    _escape: (far, over) => findEscape(bodies(over), st.r0 * Rm(), far, 30),
    _eight: () => { bEight.node.click(); return st.runs.map(r => ({ ...r })); },
    _levels: () => { const l = levels(bodies()); return { L: l.L.slice(), dV: l.dV }; },
    _contours: level => {
      const g = GMp(), v = viewOf(g), grid = potentialGrid(g, v);
      return contourGrid(grid.V, grid.nx, grid.ny, level)
        .map(([a, b]) => [[grid.px(a[0]), grid.py(a[1])],
                          [grid.px(b[0]), grid.py(b[1])]]);
    },
    _lines: (px) => {
      const g = GMp(), v = viewOf(g);
      return fieldLines(bodies(), g, v, px || 3)
        .map(L => L.map(p => [v.X(p[0]), v.Y(p[1])]));
    },
    _geomM: () => { const g = GMp(), v = viewOf(g);
                    return { ...g, k: v.k, cx: v.cx, cy: v.cy,
                             wx0: v.wx0, wx1: v.wx1, wy0: v.wy0, wy1: v.wy1 }; },
    _geomG: () => GGr(),
    _view: (x, y) => { const g = GMp(), v = viewOf(g); return [v.X(x), v.Y(y)]; },
    _consts: () => ({ MW, HM, HM_SM, HG, HG_SM, NARROW, G, ME, RE,
                      M_LO, M_HI, R_LO, R_HI, M2_LO, M2_HI, D_LO, D_HI,
                      V_LO, V_HI, RP_LO, RP_HI, N_LAUNCH, N_SWEEP }),
  };
}
