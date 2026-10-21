/* ============================================================================
 * A2-5  The Circular Motion Rig
 * IB Physics A.2 Forces and momentum — circular motion
 *
 * Three benches, one idea: a body going round a circle is a body being pulled
 * towards the centre, and the interesting question is always what is doing the
 * pulling.
 *
 *   CONICAL PENDULUM   a bob swung round on a string. The string pulls along
 *                      itself; the horizontal part of that pull is all there is
 *                      to go round on.
 *   BANKED TRACK       a car on a banked bend, in three dimensions. The road
 *                      can push perpendicular to itself and rub along itself,
 *                      and between them they must do the job.
 *   VERTICAL LOOP      a body going round a loop in a vertical plane, held by
 *                      the track, a string or a rigid rod. Two of those three
 *                      can only pull one way, and that is what makes the top of
 *                      the loop interesting.
 *
 * ---------------------------------------------------------------------------
 * NOTHING QUOTED
 *
 * None of the results of this topic appear in this file. Each comes out of the
 * model, and the simulation reports it as a measurement:
 *
 *   * a = v²/r, or ω²r, anywhere at all
 *   * T = 2π√(L cos φ / g) for the conical pendulum, or that its period does
 *     not depend on the mass
 *   * tan β = v²/(rg) for the frictionless banked speed
 *   * the band of speeds a banked bend with friction can hold
 *   * v_min = √(gr) at the top of a vertical loop, or that the condition is
 *     independent of the mass
 *   * that the normal force at the bottom of a loop is mv²/r + mg
 *   * that a rigid rod can hold a body round a loop at any speed while a string
 *     cannot
 *
 * WHAT GOES IN
 *
 *   Newton's second law, in the form ma = ΣF, written along whichever
 *   directions the constraint makes natural — along a string, across a road
 *   surface, round a track. That is a choice of axes, not a result.
 *   The constraint itself: a string holds the bob at a fixed distance from the
 *   pivot, a road surface is a surface, a loop is a circle.
 *   The sign of each constraint: a road and a string and the inside of a loop
 *   can push or pull one way only; a rigid rod can do both.
 *   Coulomb friction on the banked road: it can hold with anything up to μN.
 *
 * ---------------------------------------------------------------------------
 * HOW THE NUMBERS ARE GOT
 *
 * Every bench integrates. The conical pendulum is a spherical pendulum: the
 * polar angle is stepped with classical RK4 and the azimuth follows from the
 * angular momentum about the vertical, which is conserved because gravity and
 * the string have no moment about that axis. The banked track integrates the
 * car's position ACROSS the road, so a car at the wrong speed is seen to drift
 * up or down the bank rather than being told that it would. The loop integrates
 * the tangential equation, and the body leaves the track the instant a
 * one-sided hold is asked to pull the wrong way, after which it is a
 * projectile until it lands back on the circle.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider, select,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, croundRect,
  chatch, callout,
} from '../sim-kit.js';

/* --------------------------------------------------------------- constants */

const G = 9.81, TAU = Math.PI * 2, DEG = Math.PI / 180;
const AW = 664, AH = 440;          // the apparatus
const GW = 664, GH = 300;          // the graph
const H = 1 / 1500;                // s, physics substep
const EL = 40 * DEG;               // the camera's elevation above the plane

/* ========================================================================= *
 * THE MODELS
 * ========================================================================= */

/* ---- 1. the conical pendulum ------------------------------------------- */

/**
 * A bob on a string of length L, free to swing in any direction: a spherical
 * pendulum. `ph` is the angle the string makes with the downward vertical and
 * `ps` the azimuth. Gravity and the string have no moment about the vertical,
 * so the angular momentum about it is a constant of the motion and the azimuth
 * follows from it rather than being integrated.
 *
 * state: { ph, phd, ps, t }    p: { L, m, Lz }     Lz is per unit mass
 */
function coneRate(ph, phd, p) {
  const s = Math.max(Math.abs(Math.sin(ph)), 1e-7) * Math.sign(Math.sin(ph) || 1);
  const psd = p.Lz / (p.L * p.L * s * s);
  return Math.sin(ph) * Math.cos(ph) * psd * psd - (G / p.L) * Math.sin(ph);
}

function coneStep(st, p, h) {
  const a1 = coneRate(st.ph, st.phd, p);
  const b1 = st.phd;
  const a2 = coneRate(st.ph + h / 2 * b1, st.phd + h / 2 * a1, p);
  const b2 = st.phd + h / 2 * a1;
  const a3 = coneRate(st.ph + h / 2 * b2, st.phd + h / 2 * a2, p);
  const b3 = st.phd + h / 2 * a2;
  const a4 = coneRate(st.ph + h * b3, st.phd + h * a3, p);
  const b4 = st.phd + h * a3;
  st.ph += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
  st.phd += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
  const s = Math.max(Math.abs(Math.sin(st.ph)), 1e-7);
  st.ps += h * p.Lz / (p.L * p.L * s * s);
  st.t += h;
}

/** what the string is pulling with, and what the bob is doing */
function coneReport(st, p) {
  const s = Math.max(Math.abs(Math.sin(st.ph)), 1e-7);
  const psd = p.Lz / (p.L * p.L * s * s);
  const vTan = p.L * s * psd;                      // round the axis
  const vPol = p.L * st.phd;                       // up and down the cone
  const T = p.m * (G * Math.cos(st.ph) + p.L * (st.phd * st.phd + s * s * psd * psd));
  const r = p.L * s;
  return { psd, vTan, vPol, T, r, speed: Math.hypot(vTan, vPol) };
}

/**
 * The speed round the axis that holds a given cone angle steady — found, not
 * calculated: the model is launched at that angle with a trial speed and asked
 * whether the string angle climbs or falls, and the answer is bisected on.
 */
function speedThatHolds(L, ph) {
  const rate = v => coneRate(ph, 0, { L, Lz: L * Math.sin(ph) * v });
  let lo = 0, hi = 60;
  if (rate(hi) < 0) return hi;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (rate(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---- 2. the banked track ----------------------------------------------- */

/**
 * A car going round a banked bend at a steady speed. `s` is where it sits
 * ACROSS the road, measured up the bank from the middle; ρ is its distance from
 * the axis, which depends on s because the road is tilted.
 *
 * Along the road surface (up the bank positive) and perpendicular to it:
 *     m(s̈ − (v²/ρ)cos β) = −mg sin β + f
 *     m (v²/ρ) sin β     =  N − mg cos β
 * The first is Newton's second law along the surface, the second across it.
 * Nothing in either is a result about banking.
 *
 * state: { s, sd, phi, t }   p: { r, beta, mu, v, m, w }
 */
function bankForces(s, p) {
  const b = p.beta * DEG;
  const rho = Math.max(0.2, p.r + s * Math.cos(b));
  const N = p.m * ((p.v * p.v / rho) * Math.sin(b) + G * Math.cos(b));
  /* what friction would have to be for the car to stay where it is */
  const need = p.m * (G * Math.sin(b) - (p.v * p.v / rho) * Math.cos(b));
  return { rho, N, need, grip: p.mu * N, b };
}

function bankStep(st, p, h) {
  const { rho, N, need, grip, b } = bankForces(st.s, p);
  let f;
  if (st.sliding || Math.abs(need) > grip) {
    st.sliding = true;
    f = -grip * Math.sign(st.sd || -Math.sign(need) || 1);
  } else {
    f = need;
  }
  const acc = (p.v * p.v / rho) * Math.cos(b) - G * Math.sin(b) + f / p.m;
  const sd0 = st.sd;
  st.s += h * (st.sd + h / 2 * acc);
  st.sd += h * acc;
  st.phi += h * p.v / rho;
  st.t += h;
  /* it has stopped drifting: can the grip hold it there? */
  if (st.sliding && (sd0 > 0 && st.sd <= 0 || sd0 < 0 && st.sd >= 0)) {
    st.sd = 0;
    if (Math.abs(bankForces(st.s, p).need) <= bankForces(st.s, p).grip) st.sliding = false;
  }
  if (Math.abs(st.s) > p.w / 2) { st.s = Math.sign(st.s) * p.w / 2; st.sd = 0; st.off = true; }
}

/** the speed at which this bend needs no friction at all — found by bisection */
function speedNeedingNoFriction(r, betaDeg, m = 1) {
  const p = { r, beta: betaDeg, mu: 0, v: 0, m, w: 1 };
  let lo = 0, hi = 200;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (bankForces(0, { ...p, v: mid }).need > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** the slowest and fastest this bend will hold with the friction it has */
function bankBand(p) {
  const ok = v => {
    const q = bankForces(0, { ...p, v });
    return Math.abs(q.need) <= q.grip + 1e-9;
  };
  const free = speedNeedingNoFriction(p.r, p.beta, p.m);
  let slowest = 0;
  if (!ok(0)) {
    let lo = 0, hi = free;
    for (let i = 0; i < 60; i++) { const x = (lo + hi) / 2; if (ok(x)) hi = x; else lo = x; }
    slowest = hi;
  }
  let hi = Math.max(free * 2, 10), guard = 0;
  while (ok(hi) && guard++ < 40) hi *= 1.6;
  let fastest = Infinity;
  if (!ok(hi)) {
    let lo = free;
    for (let i = 0; i < 60; i++) { const x = (lo + hi) / 2; if (ok(x)) lo = x; else hi = x; }
    fastest = lo;
  }
  return { slowest, fastest, free };
}

/* ---- 3. the vertical loop ---------------------------------------------- */

/**
 * A body going round the inside of a vertical circle, held by a track, a
 * string or a rigid rod. θ is measured from the bottom.
 *
 *   along the circle:   r θ̈ = −g sin θ
 *   across it:          C − mg cos θ = m v² / r,  v = r θ̇
 *
 * C is what the hold has to supply, towards the centre. A track or a string can
 * only supply it one way round; a rod can do either. Nothing here says what
 * speed is needed anywhere.
 *
 * state: { th, thd, t, free, x, y, vx, vy }   p: { r, m, hold }
 */
const loopRate = (th, p) => -(G / p.r) * Math.sin(th);

function loopHoldForce(st, p) {
  const v = p.r * st.thd;
  return p.m * (v * v / p.r) + p.m * G * Math.cos(st.th);
}

function loopStep(st, p, h) {
  if (st.free) {                                   /* a projectile, briefly */
    st.vy -= G * h;
    st.x += st.vx * h; st.y += st.vy * h; st.t += h;
    if (st.x * st.x + st.y * st.y >= p.r * p.r && st.y < 0) {
      /* back on the circle, somewhere near the bottom */
      st.th = Math.atan2(st.x, -st.y);
      const tang = [Math.cos(st.th), Math.sin(st.th)];
      st.thd = (st.vx * tang[0] + st.vy * tang[1]) / p.r;
      st.free = false; st.landed = true;
    }
    return;
  }
  const a1 = loopRate(st.th, p), b1 = st.thd;
  const a2 = loopRate(st.th + h / 2 * b1, p), b2 = st.thd + h / 2 * a1;
  const a3 = loopRate(st.th + h / 2 * b2, p), b3 = st.thd + h / 2 * a2;
  const a4 = loopRate(st.th + h * b3, p), b4 = st.thd + h * a3;
  st.th += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
  st.thd += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
  st.t += h;

  if (p.hold !== 'rod' && loopHoldForce(st, p) < 0) {
    /* the hold has been asked to pull the wrong way, and it cannot */
    const v = p.r * st.thd;
    st.x = p.r * Math.sin(st.th); st.y = -p.r * Math.cos(st.th);
    st.vx = v * Math.cos(st.th); st.vy = v * Math.sin(st.th);
    st.free = true; st.leftAt = st.th;
  }
}

/** the slowest launch at the bottom that gets all the way round — measured.
 *  The search integrates the model many times over, so the answer is kept. */
const roundCache = new Map();
function slowestRoundOf(p) {
  const key = `${p.r}|${p.hold}`;
  if (!roundCache.has(key)) roundCache.set(key, slowestRound(p));
  return roundCache.get(key);
}

function slowestRound(p, h = 1 / 2000) {
  const goes = v0 => {
    const st = { th: 0, thd: v0 / p.r, t: 0, free: false };
    for (let i = 0; i < 20000; i++) {
      loopStep(st, p, h);
      if (st.free) return false;
      if (st.th >= Math.PI) return true;
      if (st.thd <= 0) return false;
    }
    return false;
  };
  let lo = 0, hi = Math.sqrt(40 * G * p.r);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (goes(mid)) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/* ========================================================================= *
 * THE SIMULATION
 * ========================================================================= */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a2-circular',
    title: 'Circular motion: the conical pendulum, the banked track and the vertical loop',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    bench: 'cone',
    playing: true, ann: false, speed: 1,

    /* conical pendulum */
    L: 0.80, mc: 0.40, ph0: 35, v0: 1.6,
    c: { ph: 0, phd: 0, ps: 0, t: 0 },
    cTrace: [], cUp: null, cPeriod: null, cLast: null,

    /* banked track */
    r: 40, beta: 20, mu: 0.25, v: 12, mb: 1200, wRoad: 9,
    b: { s: 0, sd: 0, phi: 0, t: 0, sliding: false, off: false },

    /* vertical loop */
    rl: 1.2, ml: 0.25, vl: 8.0, hold: 'track',
    l: { th: 0.001, thd: 0, t: 0, free: false, x: 0, y: 0, vx: 0, vy: 0,
         leftAt: null, landed: false },
    lRing: [],
  };

  const coneP = () => ({ L: st.L, m: st.mc, Lz: st.cLz });
  const bankP = () => ({ r: st.r, beta: st.beta, mu: st.mu, v: st.v, m: st.mb, w: st.wRoad });
  const loopP = () => ({ r: st.rl, m: st.ml, hold: st.hold });

  function resetCone() {
    const ph = st.ph0 * DEG;
    st.cLz = st.L * Math.sin(ph) * st.v0;          // per unit mass
    st.c = { ph, phd: 0, ps: 0, t: 0 };
    st.cTrace = []; st.cUp = null; st.cPeriod = null; st.cLast = null;
  }
  function resetBank() {
    st.b = { s: 0, sd: 0, phi: 0, t: 0, sliding: false, off: false };
  }
  function resetLoop() {
    st.l = { th: 0.0001, thd: st.vl / st.rl, t: 0, free: false, x: 0, y: 0,
             vx: 0, vy: 0, leftAt: null, landed: false };
    st.lRing = [];
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(AW, AH, { label: 'The circular motion rig' });
  const gv = surface(GW, GH, { label: 'The forces that make the circle' });

  /* ---------------------------------------------------------- readouts */

  const outC = readouts([
    { key: 'r', label: 'Radius of the circle it is tracing' },
    { key: 'ph', label: 'Angle of the string to the vertical' },
    { key: 'v', label: 'Speed round the axis' },
    { key: 'T', label: 'Pull along the string' },
    { key: 'Th', label: 'Its horizontal part — the only force going spare' },
    { key: 'Tv', label: 'Its vertical part, which carries the weight' },
    { key: 'a', label: 'Acceleration towards the axis, measured' },
    { key: 'hold', label: 'Speed that would hold this cone steady, found by trial' },
    { key: 'per', label: 'Period, timed off the motion' },
    { key: 'steady', label: 'Is it a steady cone?' },
  ]);

  const outB = readouts([
    { key: 'v', label: 'Speed of the car' },
    { key: 'rho', label: 'Radius it is going round' },
    { key: 'N', label: 'Push from the road, <i>N</i>' },
    { key: 'f', label: 'Friction the road must find' },
    { key: 'grip', label: 'Most the tyres can give, <i>μN</i>' },
    { key: 'free', label: 'Speed needing no friction, found by trial' },
    { key: 'tan', label: 'tan of the bank, against <i>v</i>²/<i>rg</i> at that speed' },
    { key: 'band', label: 'Band of speeds this bend will hold' },
    { key: 'a', label: 'Acceleration towards the axis, measured' },
    { key: 'sta', label: 'The car is' },
  ]);

  const outL = readouts([
    { key: 'th', label: 'Angle round the loop, from the bottom' },
    { key: 'v', label: 'Speed there' },
    { key: 'C', label: 'What the hold is supplying, towards the centre' },
    { key: 'W', label: 'Component of the weight along the same line' },
    { key: 'a', label: 'Acceleration towards the centre, measured' },
    { key: 'bot', label: 'Hold at the bottom of the loop' },
    { key: 'top', label: 'Hold at the top of the loop' },
    { key: 'min', label: 'Slowest launch that gets round, measured' },
    { key: 'cmp', label: 'That speed squared, against <i>gr</i>' },
    { key: 'sta', label: 'What happened' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sL = slider({ label: '<i>L</i>', min: 0.3, max: 1.2, step: 0.01, value: st.L,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.L = v; resetCone(); } });
  const sMc = slider({ label: '<i>m</i>', min: 0.05, max: 2, step: 0.05, value: st.mc,
    format: v => `${v.toFixed(2)} kg`, onInput: v => { st.mc = v; } });
  const sPh = slider({ label: '<i>φ</i><sub>0</sub>', min: 5, max: 75, step: 1, value: st.ph0,
    format: v => `${v.toFixed(0)}°`, onInput: v => { st.ph0 = v; resetCone(); } });
  const sV0 = slider({ label: 'launch speed', word: true, min: 0.2, max: 6, step: 0.05, value: st.v0,
    format: v => `${v.toFixed(2)} m s⁻¹`, onInput: v => { st.v0 = v; resetCone(); } });

  const sR = slider({ label: '<i>r</i>', min: 15, max: 90, step: 1, value: st.r,
    format: v => `${v.toFixed(0)} m`, onInput: v => { st.r = v; resetBank(); } });
  const sB = slider({ label: '<i>β</i>', min: 0, max: 35, step: 0.5, value: st.beta,
    format: v => `${v.toFixed(1)}°`, onInput: v => { st.beta = v; resetBank(); } });
  const sMu = slider({ label: '<i>μ</i>', min: 0, max: 1.1, step: 0.01, value: st.mu,
    format: v => v.toFixed(2), onInput: v => { st.mu = v; resetBank(); } });
  const sV = slider({ label: '<i>v</i>', min: 2, max: 45, step: 0.5, value: st.v,
    format: v => `${v.toFixed(1)} m s⁻¹`, onInput: v => { st.v = v; resetBank(); } });

  const sRl = slider({ label: '<i>r</i>', min: 0.4, max: 2.2, step: 0.05, value: st.rl,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.rl = v; resetLoop(); } });
  const sMl = slider({ label: '<i>m</i>', min: 0.05, max: 1.5, step: 0.05, value: st.ml,
    format: v => `${v.toFixed(2)} kg`, onInput: v => { st.ml = v; } });
  const sVl = slider({ label: 'launch at the bottom', word: true, min: 1, max: 14, step: 0.1,
    value: st.vl, format: v => `${v.toFixed(1)} m s⁻¹`,
    onInput: v => { st.vl = v; resetLoop(); } });
  const selHold = select({ label: 'held by', value: st.hold,
    options: [{ value: 'track', label: 'the inside of a track' },
              { value: 'string', label: 'a string' },
              { value: 'rod', label: 'a rigid rod' }],
    onChange: v => { st.hold = v; resetLoop(); render(); } });

  const sS = slider({ label: 'sim speed', word: true, min: 0.1, max: 2, step: 0.1, value: 1,
    format: v => `× ${v.toFixed(1)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bReset = button({ label: 'Start again', onClick: () => {
    resetCone(); resetBank(); resetLoop(); render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });
  const bSteady = button({ label: 'Launch it for a steady cone', onClick: () => {
    st.v0 = Math.round(speedThatHolds(st.L, st.ph0 * DEG) * 100) / 100;
    sV0.set(st.v0); resetCone(); render();
  } });
  const bFree = button({ label: 'Set the speed that needs no friction', onClick: () => {
    st.v = Math.round(speedNeedingNoFriction(st.r, st.beta, st.mb) * 10) / 10;
    sV.set(st.v); resetBank(); render();
  } });
  const bMin = button({ label: 'Launch it at the slowest speed that gets round', onClick: () => {
    st.vl = Math.round(slowestRoundOf(loopP()) * 100) / 100 + 0.01;
    sVl.set(st.vl); resetLoop(); render();
  } });

  const benchBtns = {};
  const TITLES = {
    cone: ['The conical pendulum — the string pulls, and part of that pull goes round',
           'The cone angle as the bob goes round'],
    bank: ['The banked bend — the road pushes across itself and rubs along itself',
           'What friction the bend asks for, at every speed'],
    loop: ['The vertical loop — what the hold has to supply, all the way round',
           'The hold, right round the loop'],
  };
  const NOTES = {
    cone: '<b>Physics.</b> A bob on a string, swung so it traces a horizontal circle. The ' +
      'string can only pull along itself, so the pull splits into a vertical part, which has ' +
      'to carry the weight exactly or the bob would rise or fall, and a horizontal part, which ' +
      'is the entire force available to bend the path into a circle. That is why the cone has ' +
      'one speed for each angle, and the simulation finds it the way you would: launch at a ' +
      'speed, watch whether the string angle climbs or falls, and close in. The whole thing is ' +
      'integrated as a spherical pendulum, so launch it wrong and you get what you really get ' +
      '— a bob that wanders up and down the cone while it goes round. Change the mass and ' +
      'nothing about the geometry moves, because the pull needed and the weight to be carried ' +
      'grow together.',
    bank: '<b>Physics.</b> On a banked bend the road can do two things: push perpendicular to ' +
      'its own surface, and rub along it up to <i>μN</i>. Newton’s second law is written ' +
      'along the road and across it, and the car’s position <em>across</em> the road is ' +
      'integrated — so a car going too slowly is not told it would slide down the bank, it is ' +
      'watched sliding down. Take the friction to zero and there is exactly one speed the bend ' +
      'holds, because the sideways part of the road’s push is then the only thing going ' +
      'round on. Put friction back and that one speed becomes a band, which is what a real ' +
      'bend gives you. Note that the mass never appears in either limit: a lorry and a ' +
      'motorbike leave the road at the same speed.',
    loop: '<b>Physics.</b> Going round a vertical loop, the hold and gravity share the job, and ' +
      'how they share it changes all the way round. At the bottom gravity pulls <em>away</em> ' +
      'from the centre, so the hold must supply the lot and more. At the top gravity pulls ' +
      '<em>towards</em> the centre and does part of the work for free. A track and a string can ' +
      'only push or pull one way; ask them for the other and they simply stop acting, which is ' +
      'what the ball leaving the track is. A rigid rod can push outwards as well, so it will ' +
      'carry the body round at any speed at all, however slow — swap the hold and watch the ' +
      'gauge go negative near the top instead of the body falling off.',
  };

  function setBench(b) {
    st.bench = b;
    for (const k in benchBtns) benchBtns[k].setPressed(k === b);
    rowC.style.display = b === 'cone' ? '' : 'none';
    rowC2.style.display = b === 'cone' ? '' : 'none';
    rowB.style.display = b === 'bank' ? '' : 'none';
    rowB2.style.display = b === 'bank' ? '' : 'none';
    rowL.style.display = b === 'loop' ? '' : 'none';
    rowL2.style.display = b === 'loop' ? '' : 'none';
    outC.node.style.display = b === 'cone' ? '' : 'none';
    outB.node.style.display = b === 'bank' ? '' : 'none';
    outL.node.style.display = b === 'loop' ? '' : 'none';
    boxA.querySelector('.ibs-panel__title').innerHTML = TITLES[b][0];
    boxG.querySelector('.ibs-panel__title').innerHTML = TITLES[b][1];
    noteEl.innerHTML = NOTES[b];
    render();
  }
  benchBtns.cone = button({ label: '1 · Conical pendulum', pressed: true,
    onClick: () => setBench('cone') });
  benchBtns.bank = button({ label: '2 · Banked track', pressed: false,
    onClick: () => setBench('bank') });
  benchBtns.loop = button({ label: '3 · Vertical loop', pressed: false,
    onClick: () => setBench('loop') });

  /* ------------------------------------------------------------ layout */

  const boxA = panelBox(TITLES.cone[0], av.el);
  const boxG = panelBox(TITLES.cone[1], gv.el);
  const rowC = controls([sL.node, sMc.node, sPh.node, sV0.node]);
  const rowC2 = controls([el('div', { class: 'ibs-btns' }, [bSteady.node])]);
  const rowB = controls([sR.node, sB.node, sMu.node, sV.node]);
  const rowB2 = controls([el('div', { class: 'ibs-btns' }, [bFree.node])]);
  const rowL = controls([sRl.node, sMl.node, sVl.node]);
  const rowL2 = controls([selHold.node, el('div', { class: 'ibs-btns' }, [bMin.node])]);
  const noteEl = note(NOTES.cone);

  root.append(
    heading('The Circular Motion Rig',
            'three ways of being pulled towards a centre — a string, a road, a loop'),
    boxA, boxG,
    controls([el('div', { class: 'ibs-btns' },
      [benchBtns.cone.node, benchBtns.bank.node, benchBtns.loop.node])], { label: 'bench:' }),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bReset.node, bAnn.node])]),
    rowC, rowB, rowL, rowC2, rowB2, rowL2,
    controls([sS.node]),
    outC.node, outB.node, outL.node,
    noteEl,
  );
  for (const r of [rowB, rowB2, rowL, rowL2]) r.style.display = 'none';
  outB.node.style.display = 'none';
  outL.node.style.display = 'none';

  /* ================================================================== *
   * advancing
   * ================================================================== */

  let acc = 0;
  function advance(dt) {
    const d = Math.min(dt, 0.08) * st.speed;
    acc += d;
    let guard = 0;
    if (st.bench === 'cone') {
      const p = coneP();
      while (acc >= H && guard++ < 3000) {
        const was = st.c.ph;
        coneStep(st.c, p, H);
        /* time the circuit the way a stopwatch would: once round the axis */
        const turns = Math.floor(st.c.ps / TAU);
        if (st.cLast !== null && turns > st.cLast) st.cPeriod = st.c.t - st.cUp;
        if (st.cLast === null || turns > st.cLast) { st.cUp = st.c.t; st.cLast = turns; }
        acc -= H;
      }
      st.cTrace.push([st.c.t, st.c.ph / DEG]);
      if (st.cTrace.length > 1600) st.cTrace.shift();
      if (st.c.t > 40) resetCone();
    } else if (st.bench === 'bank') {
      const p = bankP();
      while (acc >= H && guard++ < 3000) { bankStep(st.b, p, H); acc -= H; }
    } else {
      const p = loopP();
      while (acc >= H && guard++ < 3000) {
        loopStep(st.l, p, H);
        if (!st.l.free) {
          const k = Math.round(((st.l.th % TAU) + TAU) % TAU / TAU * 180) % 180;
          st.lRing[k] = loopHoldForce(st.l, p);
        }
        acc -= H;
      }
      if (st.l.landed && st.l.t > 12) resetLoop();
    }
  }

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /** the name of the net arrow, set beside it rather than on top of anything */
  function netLabel(ctx, x1, y1, x2, y2, text) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    if (L < 30) return;                    // too short to label without a collision
    const px = -dy / L, py = dx / L;
    ctext(ctx, text, (x1 + x2) / 2 + px * 15, (y1 + y2) / 2 + py * 15 + 4,
      { font: `600 10.5px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });
  }

  /** parallel projection: x right, y into the screen, z up */
  const prj = (X, Y, Z, cx, cy, k) =>
    [cx + X * k, cy - (Y * Math.sin(EL) + Z * Math.cos(EL)) * k];

  /* ---------------------------------------------- bench 1: the cone ---- */

  function drawCone() {
    const ctx = av.ctx, p = coneP(), q = coneReport(st.c, p);
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    const cx = AW / 2, cyPivot = 76, k = 290 / Math.max(st.L, 0.3);
    const R = p.L * Math.sin(st.c.ph);
    const drop = p.L * Math.cos(st.c.ph);

    /* the support */
    chatch(ctx, cx - 90, cyPivot - 18, 180, 0, { color: P.muted, gap: 13, len: 12, side: 'bottom' });
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 90, cyPivot - 18); ctx.lineTo(cx + 90, cyPivot - 18);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cyPivot - 18); ctx.lineTo(cx, cyPivot); ctx.stroke();

    /* the axis */
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cyPivot); ctx.lineTo(cx, cyPivot + drop * k + 40);
    ctx.stroke(); ctx.restore();

    /* the circle the bob is tracing, as an ellipse */
    const ringY = cyPivot + drop * k * Math.cos(EL);
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.65; ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, ringY, R * k, R * k * Math.sin(EL), 0, 0, TAU);
    ctx.stroke(); ctx.restore();

    /* the cone the string sweeps, as its outline */
    const bob = [R * Math.cos(st.c.ps), R * Math.sin(st.c.ps), -drop];
    const bp = prj(bob[0], bob[1], bob[2], cx, cyPivot, k);
    const eL = prj(-R, 0, -drop, cx, cyPivot, k);
    const eR = prj(R, 0, -drop, cx, cyPivot, k);
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(eL[0], eL[1]); ctx.lineTo(cx, cyPivot); ctx.lineTo(eR[0], eR[1]);
    ctx.stroke(); ctx.restore();

    /* the string and the bob */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cyPivot); ctx.lineTo(bp[0], bp[1]); ctx.stroke();
    const grd = ctx.createRadialGradient(bp[0] - 4, bp[1] - 5, 2, bp[0], bp[1], 15);
    grd.addColorStop(0, '#5fa3ab'); grd.addColorStop(1, '#00343b');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(bp[0], bp[1], 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5; ctx.stroke();

    /* the forces at the bob, projected the same way */
    const FS = 46 / Math.max(st.mc * G, 0.3);
    const u = [-bob[0] / p.L, -bob[1] / p.L, (drop) / p.L];      // towards the pivot
    const tip = (vec, len) => prj(bob[0] + vec[0] * len / k, bob[1] + vec[1] * len / k,
                                  bob[2] + vec[2] * len / k, cx, cyPivot, k);
    const tEnd = tip(u, q.T * FS);
    carrow(ctx, bp[0], bp[1], tEnd[0], tEnd[1], { color: P.text, width: 2.4, head: 9 });
    ctext(ctx, 'T', tEnd[0] + 9, tEnd[1] - 2, { font: P.sym(14), color: P.text, halo: P.bg });

    const wEnd = tip([0, 0, -1], st.mc * G * FS);
    carrow(ctx, bp[0], bp[1], wEnd[0], wEnd[1], { color: P.text, width: 2.4, head: 9 });
    ctext(ctx, 'W', wEnd[0] + 9, wEnd[1] + 4, { font: P.sym(14), color: P.text, halo: P.bg });

    const inward = R > 1e-6 ? [-bob[0] / R, -bob[1] / R, 0] : [0, 0, 0];
    const net = q.T * Math.sin(st.c.ph);
    const nEnd = tip(inward, net * FS);
    if (carrow(ctx, bp[0], bp[1], nEnd[0], nEnd[1],
               { color: P.accent, width: 2.8, head: 10, min: 7 })) {
      netLabel(ctx, bp[0], bp[1], nEnd[0], nEnd[1], 'net, to the axis');
    }

    ctext(ctx, Math.abs(st.c.phd) < 0.02
      ? 'a steady cone — the string angle is holding still'
      : 'not a steady cone — the bob is wandering up and down as it goes round',
      AW / 2, AH - 14, { font: `600 12px ${P.font}`,
        color: Math.abs(st.c.phd) < 0.02 ? P.text : P.accent, align: 'center' });

    if (st.ann) {
      callout(ctx, ['The string can only pull along itself.',
                    'Its vertical part has to carry the weight,',
                    'so only what is left over — the horizontal',
                    'part — is available to go round on.'],
        20, 150, bp[0], bp[1], { palette: P });
    }
  }

  /* ---------------------------------------------- bench 2: the bank ---- */

  function bankGeom() {
    const cx = AW / 2, cy = 214, k = 158 / Math.max(st.r, 10);
    const b = st.beta * DEG;
    const edge = s => ({ rho: st.r + s * Math.cos(b), z: s * Math.sin(b) });
    return { cx, cy, k, b, edge };
  }

  function drawBank() {
    const ctx = av.ctx, g = bankGeom(), p = bankP();
    const { rho, N, need, grip } = bankForces(st.b.s, p);
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    const inner = g.edge(-st.wRoad / 2), outer = g.edge(st.wRoad / 2);
    const ring = (e, n = 120) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = TAU * i / n;
        pts.push(prj(e.rho * Math.cos(a), e.rho * Math.sin(a), e.z, g.cx, g.cy, g.k));
      }
      return pts;
    };
    const ri = ring(inner), ro = ring(outer);

    /* the road: one ribbon between the two edges, filled with the hole in it */
    ctx.save();
    ctx.beginPath();
    ro.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    ri.slice().reverse().forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    ctx.closePath();
    const grd = ctx.createLinearGradient(0, g.cy - 150, 0, g.cy + 170);
    grd.addColorStop(0, P.bg); grd.addColorStop(1, P.soft);
    ctx.fillStyle = grd; ctx.fill('evenodd');
    ctx.restore();
    const edgeLine = (pts, w, al) => {
      ctx.save(); ctx.globalAlpha = al; ctx.strokeStyle = P.text; ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.stroke(); ctx.restore();
    };
    edgeLine(ro, 2, 1); edgeLine(ri, 2, 1);
    edgeLine(ring(g.edge(0)), 1.4, 0.3);

    /* the axis of the bend, which is what everything is pulled towards */
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(g.cx - 9, g.cy); ctx.lineTo(g.cx + 9, g.cy);
    ctx.moveTo(g.cx, g.cy - 9); ctx.lineTo(g.cx, g.cy + 9);
    ctx.stroke(); ctx.restore();
    ctext(ctx, 'the axis', g.cx, g.cy + 24,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });

    /* the car, on the road where the model put it */
    const e = g.edge(st.b.s);
    const a = st.b.phi;
    const car = prj(e.rho * Math.cos(a), e.rho * Math.sin(a), e.z, g.cx, g.cy, g.k);
    const ahead = prj(e.rho * Math.cos(a + 0.02), e.rho * Math.sin(a + 0.02), e.z,
                      g.cx, g.cy, g.k);
    const rot = Math.atan2(ahead[1] - car[1], ahead[0] - car[0]);
    ctx.save();
    ctx.translate(car[0], car[1]); ctx.rotate(rot);
    const cg = ctx.createLinearGradient(0, -10, 0, 10);
    cg.addColorStop(0, '#5fa3ab'); cg.addColorStop(0.4, '#005F6A'); cg.addColorStop(1, '#00272d');
    croundRect(ctx, -17, -9, 34, 18, 5); ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff';
    croundRect(ctx, -6, -6, 12, 6, 2); ctx.fill(); ctx.restore();
    ctx.restore();

    /* the forces on the car, projected the same way */
    const FS = 72 / Math.max(st.mb * G, st.mb * st.v * st.v / rho, 1);
    const radial = [Math.cos(a), Math.sin(a), 0];
    const up = [0, 0, 1];
    const nDir = [-Math.sin(g.b) * radial[0], -Math.sin(g.b) * radial[1], Math.cos(g.b)];
    const uDir = [Math.cos(g.b) * radial[0], Math.cos(g.b) * radial[1], Math.sin(g.b)];
    const f = st.b.sliding ? -grip * Math.sign(st.b.sd || -Math.sign(need) || 1) : need;
    const put = (d, len) => prj(e.rho * Math.cos(a) + d[0] * len / g.k,
                                e.rho * Math.sin(a) + d[1] * len / g.k,
                                e.z + d[2] * len / g.k, g.cx, g.cy, g.k);

    let q2 = put(nDir, N * FS);
    carrow(ctx, car[0], car[1], q2[0], q2[1], { color: P.text, width: 2.4, head: 9 });
    ctext(ctx, 'N', q2[0] + 8, q2[1] - 2, { font: P.sym(14), color: P.text, halo: P.bg });

    q2 = put(up, -st.mb * G * FS);
    carrow(ctx, car[0], car[1], q2[0], q2[1], { color: P.text, width: 2.4, head: 9 });
    ctext(ctx, 'W', q2[0] + 8, q2[1] + 4, { font: P.sym(14), color: P.text, halo: P.bg });

    q2 = put(uDir, f * FS);
    if (carrow(ctx, car[0], car[1], q2[0], q2[1],
               { color: P.accent, width: 2.6, head: 9, min: 7 })) {
      ctext(ctx, 'f', q2[0] + 7, q2[1] + 4, { font: P.sym(14), color: P.accent, halo: P.bg });
    }

    const net = st.mb * st.v * st.v / rho;
    q2 = put([-radial[0], -radial[1], 0], net * FS);
    if (carrow(ctx, car[0], car[1], q2[0], q2[1],
               { color: P.accent, width: 3, head: 11, min: 7 })) {
      netLabel(ctx, car[0], car[1], q2[0], q2[1], 'net, to the axis');
    }

    ctext(ctx, st.b.off
      ? 'it has run out of road'
      : st.b.sliding
        ? (st.b.sd > 0 ? 'too fast for this grip — the car is sliding up the bank'
                       : 'too slow for this grip — the car is sliding down the bank')
        : 'the bend is holding it',
      AW / 2, AH - 14, { font: `600 12px ${P.font}`,
        color: st.b.sliding || st.b.off ? P.accent : P.text, align: 'center' });

    if (st.ann) {
      callout(ctx, ['The road can only push at right angles to',
                    'itself. Tilt it, and part of that push points',
                    'towards the axis — that is the whole trick of',
                    'banking, and at one speed it is enough on its own.'],
        18, 26, car[0], car[1], { palette: P });
    }
  }

  /* ---------------------------------------------- bench 3: the loop ---- */

  function loopGeom() {
    const k = 132 / Math.max(st.rl, 0.4);
    return { cx: AW / 2, cy: 206, k };
  }

  function drawLoop() {
    const ctx = av.ctx, g = loopGeom(), p = loopP();
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);
    const R = st.rl * g.k;
    const pos = st.l.free ? [st.l.x, st.l.y]
                          : [st.rl * Math.sin(st.l.th), -st.rl * Math.cos(st.l.th)];
    const sx = x => g.cx + x * g.k, sy = y => g.cy - y * g.k;

    /* the ground under it */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(24, sy(-st.rl) + 26); ctx.lineTo(AW - 24, sy(-st.rl) + 26);
    ctx.stroke();
    chatch(ctx, 24, sy(-st.rl) + 26, AW - 48, 0, { color: P.muted, gap: 14, len: 11 });

    /* the hold, drawn as what it is */
    if (st.hold === 'track') {
      ctx.save();
      ctx.strokeStyle = P.text; ctx.lineWidth = 7; ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R + 11, 0, TAU); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R + 15, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R + 7, 0, TAU); ctx.stroke();
    } else {
      ctx.save();
      ctx.strokeStyle = P.muted; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R, 0, TAU); ctx.stroke(); ctx.restore();
      if (!st.l.free) {
        ctx.strokeStyle = P.text;
        ctx.lineWidth = st.hold === 'rod' ? 5 : 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(sx(pos[0]), sy(pos[1]));
        ctx.stroke();
      }
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, 5, 0, TAU); ctx.fill();
    }

    /* the gauge: how hard the hold is working, right round the loop, drawn as a
     * bar pointing inwards from each point of the circle */
    let gmax = st.ml * G;
    for (const C of st.lRing) if (C !== undefined) gmax = Math.max(gmax, Math.abs(C));
    const gscale = 42 / Math.max(gmax, 1e-6);
    ctx.save();
    ctx.lineWidth = 2.6; ctx.lineCap = 'butt';
    for (let i = 0; i < 180; i++) {
      const C = st.lRing[i];
      if (C === undefined) continue;
      const a = i / 180 * TAU;
      const px = g.cx + Math.sin(a) * R, py = g.cy + Math.cos(a) * R;
      const ix = -Math.sin(a), iy = -Math.cos(a);          // inwards, on screen
      const len = C * gscale;
      ctx.strokeStyle = C >= 0 ? P.accent : P.text;
      ctx.globalAlpha = C >= 0 ? 0.55 : 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + ix * len, py + iy * len);
      ctx.stroke();
    }
    ctx.restore();
    ctext(ctx, 'how hard the hold is working, right round', g.cx, g.cy - R - 36,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });

    /* the body */
    const bx = sx(pos[0]), by = sy(pos[1]);
    const grd = ctx.createRadialGradient(bx - 4, by - 5, 2, bx, by, 16);
    grd.addColorStop(0, '#5fa3ab'); grd.addColorStop(1, '#00343b');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(bx, by, 13, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5; ctx.stroke();

    /* the forces on it */
    /* one scale for both arrows, fixed so that the hardest pull of the run —
     * the one at the bottom — just reaches the centre of the loop */
    const FS = (R * 0.92) / Math.max(st.ml * (st.vl * st.vl / st.rl + G), 1e-6);
    const C = st.l.free ? 0 : loopHoldForce(st.l, p);
    const inward = [-Math.sin(st.l.th), Math.cos(st.l.th)];
    const cEnd = [bx + inward[0] * C * FS, by - inward[1] * C * FS];
    if (carrow(ctx, bx, by, cEnd[0], cEnd[1],
               { color: P.accent, width: 2.8, head: 10, min: 16 })) {
      ctext(ctx, st.hold === 'string' ? 'T' : 'N', cEnd[0] + 9, cEnd[1] - 2,
        { font: P.sym(14), color: P.accent, halo: P.bg });
    }
    const wEnd = [bx, by + st.ml * G * FS];
    carrow(ctx, bx, by, wEnd[0], wEnd[1], { color: P.text, width: 2.4, head: 9 });
    ctext(ctx, 'W', wEnd[0] + 9, wEnd[1] + 4, { font: P.sym(14), color: P.text, halo: P.bg });

    if (!st.l.free) {
      const vNow = st.rl * st.l.thd;
      const net = st.ml * vNow * vNow / st.rl;
      const netEnd = [bx + inward[0] * net * FS, by - inward[1] * net * FS];
      if (carrow(ctx, bx, by, netEnd[0], netEnd[1],
                 { color: P.accent, width: 1.8, head: 9, dash: [5, 4], min: 10 })) {
        netLabel(ctx, bx, by, netEnd[0], netEnd[1], 'net, to the centre');
      }
    }

    ctext(ctx, st.l.free
      ? 'the hold was asked to pull the wrong way, so it stopped acting and the body is falling'
      : st.l.th >= Math.PI * 0.97 && st.l.th <= Math.PI * 1.03
        ? 'at the top — gravity is pointing towards the centre and doing part of the job'
        : 'going round',
      AW / 2, AH - 14, { font: `600 12px ${P.font}`,
        color: st.l.free ? P.accent : P.text, align: 'center' });

    if (st.ann) {
      callout(ctx, ['At the bottom, gravity pulls away from the',
                    'centre, so the hold must supply everything',
                    'and the weight besides. At the top it pulls',
                    'towards the centre and helps.'],
        18, 26, bx, by, { palette: P });
    }
  }

  /* ---------------------------------------------------- the graphs ---- */

  function frame2() {
    const ctx = gv.ctx;
    ctx.clearRect(0, 0, GW, GH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW, GH);
    const X0 = 70, X1 = GW - 24, Y0 = 22, Y1 = GH - 46;
    const axes = (xlab, ylab, ticks) => {
      ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
      ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const [x, lab] of ticks) {
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(x, Y0); ctx.lineTo(x, Y1); ctx.stroke();
        ctx.fillText(lab, x, Y1 + 5);
      }
      ctx.fillStyle = P.text; ctx.font = P.sym(12);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(xlab, (X0 + X1) / 2, Y1 + 32);
      ctx.save(); ctx.translate(16, (Y0 + Y1) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(ylab, 0, 0); ctx.restore();
    };

    if (st.bench === 'cone') {
      const span = 12;
      const t1 = Math.max(span, st.c.t), t0 = t1 - span;
      const TX = t => X0 + (t - t0) / span * (X1 - X0);
      const hi = clamp(Math.round(st.ph0 * 1.9 / 10) * 10, 20, 90);
      const TY = a => Y1 - a / hi * (Y1 - Y0);
      const ticks = [];
      for (let t = Math.ceil(t0 / 2) * 2; t <= t1; t += 2) ticks.push([TX(t), t.toFixed(0)]);
      axes('t (s)', 'cone angle (°)', ticks);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.muted; ctx.font = `500 9.5px ${P.font}`;
      ctx.fillText(String(hi), X0 - 5, Y0 + 5); ctx.fillText('0', X0 - 5, Y1);
      /* the angle that would hold steady at this launch speed */
      ctx.save();
      ctx.strokeStyle = P.muted; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(X0, TY(st.ph0)); ctx.lineTo(X1, TY(st.ph0)); ctx.stroke();
      ctx.restore();
      ctext(ctx, 'launched at this angle', X1 - 8, TY(st.ph0) - 7,
        { font: `600 10.5px ${P.font}`, color: P.muted, align: 'right', halo: P.bg });
      ctx.save();
      ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.2;
      ctx.beginPath();
      st.cTrace.forEach((q, i) => (i ? ctx.lineTo(TX(q[0]), TY(q[1]))
                                     : ctx.moveTo(TX(q[0]), TY(q[1]))));
      ctx.stroke(); ctx.restore();

    } else if (st.bench === 'bank') {
      const p = bankP(), vmax = 45;
      const TX = v => X0 + v / vmax * (X1 - X0);
      /* scaled to the grip the tyres have, not to the enormous demand at the
       * top of the speed range, so the crossing stays in the middle of the frame */
      let fmax = 0;
      for (let i = 0; i <= 60; i++) {
        const q = bankForces(0, { ...p, v: vmax * i / 60 });
        fmax = Math.max(fmax, q.grip, Math.abs(bankForces(0, { ...p, v: 0 }).need));
      }
      fmax *= 2.2;
      const TY = f => (Y0 + Y1) / 2 - f / fmax * (Y1 - Y0) / 2;
      const ticks = [];
      for (let v = 10; v <= vmax; v += 10) ticks.push([TX(v), String(v)]);
      axes('speed (m s⁻¹)', 'friction the bend asks for (N)', ticks);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.muted; ctx.font = `500 9.5px ${P.font}`;
      ctx.fillText(`+${(fmax / 1000).toPrecision(2)} kN`, X0 - 5, Y0 + 6);
      ctx.fillText('0', X0 - 5, TY(0));
      ctx.fillText(`−${(fmax / 1000).toPrecision(2)} kN`, X0 - 5, Y1 - 6);
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = P.frame;
      ctx.beginPath(); ctx.moveTo(X0, TY(0)); ctx.lineTo(X1, TY(0)); ctx.stroke(); ctx.restore();
      const line = (fn, col, w, dash) => {
        ctx.save();
        ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
        ctx.strokeStyle = col; ctx.lineWidth = w;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const v = vmax * i / 160, y = TY(fn(v));
          i ? ctx.lineTo(TX(v), y) : ctx.moveTo(TX(v), y);
        }
        ctx.stroke(); ctx.restore();
      };
      line(v => bankForces(0, { ...p, v }).grip, P.text, 1.6, [6, 5]);
      line(v => -bankForces(0, { ...p, v }).grip, P.text, 1.6, [6, 5]);
      line(v => bankForces(0, { ...p, v }).need, P.accent, 2.8);
      const band = bankBand(p);
      ctx.save();
      ctx.fillStyle = P.accent; ctx.globalAlpha = 0.10;
      ctx.fillRect(TX(band.slowest), Y0, TX(band.fastest) - TX(band.slowest), Y1 - Y0);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(TX(band.free), Y0); ctx.lineTo(TX(band.free), Y1);
      ctx.stroke(); ctx.restore();
      ctext(ctx, 'no friction needed here', TX(band.free) - 7, Y0 + 14,
        { font: `600 10.5px ${P.font}`, color: P.accent, align: 'right', halo: P.bg });
      ctext(ctx, 'the band this bend will hold', (TX(band.slowest) + TX(band.fastest)) / 2,
        Y1 - 10, { font: `600 10.5px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });
      ctext(ctx, '± μN', X1 - 8, TY(bankForces(0, { ...p, v: vmax }).grip) - 8,
        { font: `600 10.5px ${P.font}`, color: P.text, align: 'right', halo: P.bg });
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(TX(st.v), TY(bankForces(st.b.s, p).need), 4.6, 0, TAU); ctx.fill();

    } else {
      const TX = th => X0 + th / 360 * (X1 - X0);
      let m = 1e-9;
      for (const C of st.lRing) if (C !== undefined) m = Math.max(m, Math.abs(C));
      m = Math.max(m, st.ml * G) * 1.15;
      const TY = C => (Y0 + Y1) / 2 - C / m * (Y1 - Y0) / 2;
      const ticks = [[TX(90), '90°'], [TX(180), '180°'], [TX(270), '270°']];
      axes('angle round the loop, from the bottom', 'force the hold supplies (N)', ticks);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.muted; ctx.font = `500 9.5px ${P.font}`;
      ctx.fillText(`+${m.toPrecision(2)}`, X0 - 5, Y0 + 6);
      ctx.fillText('0', X0 - 5, TY(0));
      ctx.fillText(`−${m.toPrecision(2)}`, X0 - 5, Y1 - 6);
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = P.frame;
      ctx.beginPath(); ctx.moveTo(X0, TY(0)); ctx.lineTo(X1, TY(0)); ctx.stroke(); ctx.restore();
      ctext(ctx, 'zero: the hold has stopped acting', X0 + 8, TY(0) - 7,
        { font: `600 10.5px ${P.font}`, color: P.muted, halo: P.bg });
      ctx.save();
      ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < 180; i++) {
        const C = st.lRing[i];
        if (C === undefined) { started = false; continue; }
        const x = TX(i * 2), y = TY(C);
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke(); ctx.restore();
      const now = st.l.free ? null : loopHoldForce(st.l, loopP());
      if (now !== null) {
        ctx.fillStyle = P.text;
        ctx.beginPath();
        ctx.arc(TX(((st.l.th / DEG) % 360 + 360) % 360), TY(now), 4.6, 0, TAU);
        ctx.fill();
      }
    }
  }

  /* ================================================================== *
   * readouts
   * ================================================================== */

  function renderReads() {
    if (st.bench === 'cone') {
      const p = coneP(), q = coneReport(st.c, p);
      const hold = speedThatHolds(st.L, st.c.ph);
      const aMeas = q.vTan * q.vTan / Math.max(q.r, 1e-9);
      outC.setAll({
        r: `${fmt(q.r * 100, 1)} cm`,
        ph: `${fmt(st.c.ph / DEG, 1)}°`,
        v: `${fmt(q.vTan, 3)} m s⁻¹`,
        T: `${fmt(q.T, 3)} N`,
        Th: `${fmt(q.T * Math.sin(st.c.ph), 3)} N`,
        Tv: `${fmt(q.T * Math.cos(st.c.ph), 3)} N  (weight ${fmt(st.mc * G, 3)} N)`,
        a: `${fmt(aMeas, 2)} m s⁻²`,
        hold: `${fmt(hold, 3)} m s⁻¹ at this angle`,
        per: st.cPeriod ? `${fmt(st.cPeriod, 3)} s` : 'timing…',
        steady: Math.abs(st.c.phd) < 0.02 ? 'yes — the angle is holding'
          : `no — it is swinging between ${fmt(Math.min(...st.cTrace.map(x => x[1]).slice(-900), 90), 1)}° and ` +
            `${fmt(Math.max(...st.cTrace.map(x => x[1]).slice(-900), 0), 1)}°`,
      });
    } else if (st.bench === 'bank') {
      const p = bankP(), q = bankForces(st.b.s, p), band = bankBand(p);
      const f = st.b.sliding ? -q.grip * Math.sign(st.b.sd || 1) : q.need;
      outB.setAll({
        v: `${fmt(st.v, 1)} m s⁻¹  (${fmt(st.v * 3.6, 0)} km/h)`,
        rho: `${fmt(q.rho, 2)} m`,
        N: `${fmt(q.N / 1000, 2)} kN`,
        f: `${fmt(f / 1000, 2)} kN  ${q.need > 0 ? 'up the bank' : 'down the bank'}`,
        grip: `${fmt(q.grip / 1000, 2)} kN`,
        free: `${fmt(band.free, 2)} m s⁻¹`,
        tan: `${fmt(Math.tan(st.beta * DEG), 4)} against ` +
             `${fmt(band.free * band.free / (st.r * G), 4)}`,
        band: st.mu <= 0 ? 'one speed only, with no friction'
          : `${fmt(band.slowest, 1)} to ` +
            (isFinite(band.fastest) ? `${fmt(band.fastest, 1)} m s⁻¹`
                                    : 'any speed at all'),
        a: `${fmt(st.v * st.v / q.rho, 2)} m s⁻²`,
        sta: st.b.off ? 'off the road' : st.b.sliding ? 'sliding across the road' : 'holding',
      });
    } else {
      const p = loopP();
      const v = st.l.free ? Math.hypot(st.l.vx, st.l.vy) : st.rl * st.l.thd;
      const C = st.l.free ? 0 : loopHoldForce(st.l, p);
      const min = slowestRoundOf(p);
      const deg = ((st.l.th / DEG) % 360 + 360) % 360;
      outL.setAll({
        th: `${fmt(deg, 1)}°`,
        v: `${fmt(v, 2)} m s⁻¹`,
        C: `${fmt(C, 2)} N` + (C < 0 ? '  (the rod is pushing outwards)' : ''),
        W: `${fmt(st.ml * G * Math.cos(st.l.th), 2)} N`,
        a: `${fmt(v * v / st.rl, 1)} m s⁻²`,
        bot: `${fmt(st.lRing[0] ?? NaN, 2)} N`,
        top: `${fmt(st.lRing[90] ?? NaN, 2)} N`,
        min: `${fmt(min, 3)} m s⁻¹`,
        cmp: `${fmt(min * min, 3)} against gr = ${fmt(G * st.rl, 3)}`,
        sta: st.l.free ? `it left the hold at ${fmt((st.l.leftAt ?? 0) / DEG, 0)}°`
          : st.l.landed ? 'it fell off and came back down'
          : st.hold === 'rod' ? 'the rod will carry it round at any speed'
          : 'still on',
      });
    }
  }

  function render() {
    if (st.bench === 'cone') drawCone();
    else if (st.bench === 'bank') drawBank();
    else drawLoop();
    frame2();
    renderReads();
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

  resetCone(); resetBank(); resetLoop();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _bench: b => setBench(b),
    _set: q => {
      Object.assign(st, q);
      if (q.L != null) sL.set(st.L);
      if (q.ph0 != null) sPh.set(st.ph0);
      if (q.v0 != null) sV0.set(st.v0);
      if (q.r != null) sR.set(st.r);
      if (q.beta != null) sB.set(st.beta);
      if (q.mu != null) sMu.set(st.mu);
      if (q.v != null) sV.set(st.v);
      if (q.rl != null) sRl.set(st.rl);
      if (q.vl != null) sVl.set(st.vl);
      resetCone(); resetBank(); resetLoop();
      render();
    },
    _state: () => ({ bench: st.bench, cone: { ...st.c }, bank: { ...st.b }, loop: { ...st.l } }),

    /* the conical pendulum */
    _coneHold: (L, phDeg) => speedThatHolds(L, phDeg * DEG),
    _coneRun: (L, m, phDeg, v0, seconds, h) => {
      const ph = phDeg * DEG;
      const p = { L, m, Lz: L * Math.sin(ph) * v0 };
      const s = { ph, phd: 0, ps: 0, t: 0 };
      const n = Math.round(seconds / h);
      let lo = ph, hi = ph, period = null, last = null, up = null;
      for (let i = 0; i < n; i++) {
        coneStep(s, p, h);
        lo = Math.min(lo, s.ph); hi = Math.max(hi, s.ph);
        const turns = Math.floor(s.ps / TAU);
        if (last !== null && turns > last) period = s.t - up;
        if (last === null || turns > last) { up = s.t; last = turns; }
      }
      const q = coneReport(s, p);
      return { ...s, lo: lo / DEG, hi: hi / DEG, period, ...q,
               energy: 0.5 * m * q.speed * q.speed - m * G * L * Math.cos(s.ph) };
    },

    /* the banked track */
    _bankForces: (s, p) => bankForces(s, p),
    _bankFree: (r, beta, m) => speedNeedingNoFriction(r, beta, m),
    _bankBand: p => bankBand(p),
    _bankRun: (p, seconds, h) => {
      const s = { s: 0, sd: 0, phi: 0, t: 0, sliding: false, off: false };
      const n = Math.round(seconds / h);
      for (let i = 0; i < n; i++) bankStep(s, p, h);
      return { ...s };
    },

    /* the vertical loop */
    _loopMin: p => slowestRound(p ?? loopP()),
    _loopMinCached: () => slowestRoundOf(loopP()),
    _loopForce: (p, th, v) =>
      loopHoldForce({ th, thd: v / p.r }, p),
    _loopRun: (p, v0, seconds, h) => {
      const s = { th: 1e-4, thd: v0 / p.r, t: 0, free: false, x: 0, y: 0, vx: 0, vy: 0,
                  leftAt: null, landed: false };
      const n = Math.round(seconds / h);
      let top = null, bottom = null, maxTh = 0;
      for (let i = 0; i < n; i++) {
        loopStep(s, p, h);
        if (!s.free) {
          maxTh = Math.max(maxTh, s.th);
          if (bottom === null && s.th > 0) bottom = loopHoldForce(s, p);
          if (top === null && s.th >= Math.PI) top = loopHoldForce(s, p);
        }
      }
      const v = p.r * s.thd;
      return { ...s, top, bottom, maxTh,
               energy: 0.5 * p.m * v * v + p.m * G * p.r * (1 - Math.cos(s.th)) };
    },
  };
}
