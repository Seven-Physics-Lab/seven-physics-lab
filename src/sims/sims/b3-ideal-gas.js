/* ============================================================================
 * B3-1  The Ideal Gas: a piston, and the molecules underneath it
 * IB Physics B.3 Gas laws
 *
 * The gas laws are not laws about gases. They are what you get when you put a
 * few hundred molecules in a box, let them fly in straight lines, bounce them
 * off the walls and off each other, and then count.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does not contain pV = nRT. It does not contain pV = constant, or
 * V ∝ T, or p ∝ T, or pV^γ = constant, or p = ⅓ρ⟨c²⟩, or the Maxwell–Boltzmann
 * distribution. None of the results of this topic are written down in it.
 *
 * What it contains is a model, stated once and then left alone:
 *
 *   N hard spheres of mass m in a box, moving in straight lines between
 *   collisions; every collision, with a wall or with another sphere, is
 *   elastic. Nothing else. No forces at a distance, no internal structure.
 *
 * and three MEASUREMENTS made on it while it runs:
 *
 *   pressure     every wall bounce delivers an impulse. Add them up over a
 *                stretch of time and divide by the area and the time. That is
 *                a pressure gauge, built the way a pressure gauge works.
 *   temperature  the mean kinetic energy of a molecule, which for this model
 *                IS the temperature, to within the constant that fixes the
 *                size of a kelvin. This is a definition, and is declared as
 *                one — it is the only thing here that is not measured.
 *   work         every bounce off the moving piston changes a molecule's
 *                kinetic energy. Add those changes up and you have the work,
 *                measured molecule by molecule rather than as ∫p dV.
 *
 * Everything else on the panel follows. Boyle's law is a sweep of the piston
 * with the numbers recorded. The adiabatic index is the gradient of a log–log
 * plot of the path the gas actually took. The first law is three measured
 * quantities that come out adding up. The Maxwell–Boltzmann distribution is
 * not sampled anywhere in this file: the molecules all start with the SAME
 * speed, and the distribution is what the collisions make of them.
 *
 * WHAT THE PICTURE IS FOR, AND THE ONE LIE IN IT
 *
 * The box is three-dimensional and the screen is not. You are looking in
 * through the front face of a cube, so two molecules that appear to touch are
 * usually at different depths, and a molecule drawn small is far away. Every
 * number on the panel is the three-dimensional one; only the drawing is flat.
 * That is the single liberty this panel takes.
 * ==========================================================================*/

/* ---------------------------------------------------------------- physics */

export const KB   = 1.380649e-23;        // J K⁻¹, the size of a kelvin
export const AMU  = 1.66053906660e-27;   // kg
export const NA   = 6.02214076e23;       // mol⁻¹

/** a small deterministic generator, so a run can be repeated exactly */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Set up the gas.
 *
 * Positions go on a lattice, which is only a way of starting without two
 * molecules inside each other; it is gone within a few collisions.
 *
 * Velocities all get the SAME SPEED and a random direction. This matters: the
 * distribution of speeds is meant to be a result of this simulation, so it
 * must not be an input to it. There is no Maxwell–Boltzmann sampler anywhere
 * in this file.
 */
export function createGas({ N, L, X, T, m, d, seed = 12345 }) {
  const R = rng(seed);
  const S = {
    N, L, X, m, d,
    x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
    vx: new Float64Array(N), vy: new Float64Array(N), vz: new Float64Array(N),
    t: 0,
    /* The pressure gauge. Impulse and area-time are kept for each PAIR of
     * faces separately, on an exponential window so the reading settles the
     * way a real gauge's does, and the three face pressures are then averaged
     * with equal weight. Equal weight, not weighted by area: the pressure of
     * a gas is one number, the same on every face, and a cylinder has far
     * more side wall than end wall. Adding all the impulses and dividing by
     * the total area would quietly report the side walls' answer. */
    sJx: 0, sAx: 0, sJy: 0, sAy: 0, sJz: 0, sAz: 0, tau: 2.5e-11,
    /* The volume and the temperature on the SAME window as the gauge. A
     * pressure gauge has a response time, so any number built out of a
     * pressure and something else has to use that something else as it was
     * over the same stretch of time. Divide a lagging pressure by an
     * instantaneous temperature and pV/T will lurch about every time the
     * bath is turned up — an artefact of the instruments, not the gas. */
    sVt: 0, sTt: 0, sDt: 0,
    /* ledgers, all in joules, all measured as they happen */
    wGas: 0,      // work done BY the gas on the piston
    qBath: 0,     // heat put in by the thermostat
    u0: 0,        // the internal energy when the ledger was last zeroed
    hits: 0,
  };

  const per = Math.ceil(Math.cbrt(N));
  let i = 0;
  for (let a = 0; a < per && i < N; a++) {
    for (let b = 0; b < per && i < N; b++) {
      for (let c = 0; c < per && i < N; c++, i++) {
        S.x[i] = X * (a + 0.5) / per;
        S.y[i] = L * (b + 0.5) / per;
        S.z[i] = L * (c + 0.5) / per;
      }
    }
  }
  /* one speed, every direction: the distribution has to earn itself */
  const speed = Math.sqrt(3 * KB * T / m);
  for (let j = 0; j < N; j++) {
    const u = 2 * R() - 1, ph = 2 * Math.PI * R(), s = Math.sqrt(1 - u * u);
    S.vx[j] = speed * s * Math.cos(ph);
    S.vy[j] = speed * s * Math.sin(ph);
    S.vz[j] = speed * u;
  }
  S.u0 = kinetic(S);
  return S;
}

/** the total kinetic energy, which for this model is the internal energy */
export function kinetic(S) {
  let e = 0;
  for (let i = 0; i < S.N; i++) {
    e += S.vx[i] * S.vx[i] + S.vy[i] * S.vy[i] + S.vz[i] * S.vz[i];
  }
  return 0.5 * S.m * e;
}

export const volume = S => S.X * S.L * S.L;
export const area = S => 2 * S.L * S.L + 4 * S.L * S.X;
/** the area of each pair of opposite faces */
export const faces = S => [2 * S.L * S.L, 2 * S.L * S.X, 2 * S.L * S.X];

/**
 * Temperature.
 *
 * This is the one line on the panel that is a DEFINITION rather than a
 * measurement. For a gas of structureless particles the temperature is the
 * mean kinetic energy of a molecule, and Boltzmann's constant is nothing but
 * the exchange rate between joules and kelvin. Every other number here is
 * counted off the simulation; this one fixes the unit the counting is
 * reported in.
 */
export const temperature = S => (2 / 3) * (kinetic(S) / S.N) / KB;

/** the volume and the temperature, averaged over the gauge's own window */
export const volumeAvg = S => (S.sDt > 0 ? S.sVt / S.sDt : volume(S));
export const tempAvg = S => (S.sDt > 0 ? S.sTt / S.sDt : temperature(S));

/** the gauge reading: impulse delivered to each pair of faces, over that
 *  pair's area and the time, and the three answers averaged */
export const pressure = S => {
  if (!(S.sAx > 0)) return 0;
  return (S.sJx / S.sAx + S.sJy / S.sAy + S.sJz / S.sAz) / 3;
};
/** the three face pressures on their own, which an isotropic gas makes equal */
export const pressures = S => (S.sAx > 0
  ? [S.sJx / S.sAx, S.sJy / S.sAy, S.sJz / S.sAz] : [0, 0, 0]);

/**
 * One step.
 *
 * The piston is moved first, then every molecule is flown for dt, then the
 * walls are applied, then the spheres are let collide with each other. The
 * sphere-sphere rule exchanges the velocity component along the line of
 * centres, which conserves momentum and kinetic energy EXACTLY whatever the
 * overlap is, so the arithmetic can never quietly heat or cool the gas.
 */
export function stepGas(S, dt, opt = {}) {
  const { pistonTo = S.X, pistonSpeed = 0, bath = null, bathRate = 0.02 } = opt;

  /* the piston, moving at its own finite speed */
  let u = 0;
  if (pistonSpeed > 0 && pistonTo !== S.X) {
    const want = pistonTo - S.X;
    const move = Math.sign(want) * Math.min(Math.abs(want), pistonSpeed * dt);
    u = move / dt;
    S.X += move;
  }

  const m = S.m, N = S.N, L = S.L, X = S.X;
  let Jx = 0, Jy = 0, Jz = 0, sq = 0;

  for (let i = 0; i < N; i++) {
    S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt; S.z[i] += S.vz[i] * dt;

    /* the far end of the cylinder, fixed */
    if (S.x[i] < 0) { S.x[i] = -S.x[i]; Jx += 2 * m * Math.abs(S.vx[i]); S.vx[i] = -S.vx[i]; S.hits++; }
    /* the piston, moving at u: a molecule leaves it with 2u − v, which is
     * where every joule of compression heating in this file comes from */
    else if (S.x[i] > X) {
      const v = S.vx[i], vNew = 2 * u - v;
      Jx += m * Math.abs(v - vNew);
      S.wGas -= 0.5 * m * (vNew * vNew - v * v);   // the gas paid for that
      S.vx[i] = vNew;
      S.x[i] = Math.min(2 * X - S.x[i], X - 1e-15);
      if (S.x[i] < 0) S.x[i] = 0;
      S.hits++;
    }
    if (S.y[i] < 0) { S.y[i] = -S.y[i]; Jy += 2 * m * Math.abs(S.vy[i]); S.vy[i] = -S.vy[i]; S.hits++; }
    else if (S.y[i] > L) { S.y[i] = 2 * L - S.y[i]; Jy += 2 * m * Math.abs(S.vy[i]); S.vy[i] = -S.vy[i]; S.hits++; }
    if (S.z[i] < 0) { S.z[i] = -S.z[i]; Jz += 2 * m * Math.abs(S.vz[i]); S.vz[i] = -S.vz[i]; S.hits++; }
    else if (S.z[i] > L) { S.z[i] = 2 * L - S.z[i]; Jz += 2 * m * Math.abs(S.vz[i]); S.vz[i] = -S.vz[i]; S.hits++; }
    /* the kinetic energy, taken in the same pass. Sphere-on-sphere collisions
     * conserve it exactly, so counting it before they happen costs nothing
     * and is not an approximation. */
    sq += S.vx[i] * S.vx[i] + S.vy[i] * S.vy[i] + S.vz[i] * S.vz[i];
  }

  collide(S);

  /* the water bath, if there is one. It scales every speed by the same
   * factor, which sets how much energy the gas has and says nothing at all
   * about how the gas shares it out — so the shape of the distribution is
   * still the gas's own business. */
  if (bath != null) {
    const now = temperature(S);
    if (now > 0) {
      const want = Math.pow(bath / now, bathRate * 0.5);
      const lam = 1 + (want - 1);
      const before = kinetic(S);
      for (let i = 0; i < N; i++) { S.vx[i] *= lam; S.vy[i] *= lam; S.vz[i] *= lam; }
      S.qBath += kinetic(S) - before;
    }
  }

  /* the gauge: an exponential window, so it reads like an instrument */
  const decay = Math.exp(-dt / S.tau), A = faces(S);
  S.sJx = S.sJx * decay + Jx; S.sAx = S.sAx * decay + A[0] * dt;
  S.sJy = S.sJy * decay + Jy; S.sAy = S.sAy * decay + A[1] * dt;
  S.sJz = S.sJz * decay + Jz; S.sAz = S.sAz * decay + A[2] * dt;
  const Tnow = (2 / 3) * (0.5 * m * sq / N) / KB;
  S.sVt = S.sVt * decay + volume(S) * dt;
  S.sTt = S.sTt * decay + Tnow * dt;
  S.sDt = S.sDt * decay + dt;
  S.t += dt;
  return Jx + Jy + Jz;
}

/** sphere on sphere, through a uniform grid so the cost stays linear in N */
function collide(S) {
  const N = S.N, d = S.d, d2 = d * d;
  if (!(d > 0)) return;
  const cs = Math.max(d, S.L / 12);
  const nx = Math.max(1, Math.floor(S.X / cs)), ny = Math.max(1, Math.floor(S.L / cs));
  const nz = ny, nc = nx * ny * nz;
  if (!S.head || S.head.length < nc) { S.head = new Int32Array(nc); S.next = new Int32Array(N); }
  S.head.fill(-1, 0, nc);
  const cx = S.X / nx, cy = S.L / ny, cz = S.L / nz;
  for (let i = 0; i < N; i++) {
    const a = Math.min(nx - 1, Math.max(0, Math.floor(S.x[i] / cx)));
    const b = Math.min(ny - 1, Math.max(0, Math.floor(S.y[i] / cy)));
    const c = Math.min(nz - 1, Math.max(0, Math.floor(S.z[i] / cz)));
    const k = (c * ny + b) * nx + a;
    S.next[i] = S.head[k]; S.head[k] = i;
  }
  for (let c = 0; c < nz; c++) {
    for (let b = 0; b < ny; b++) {
      for (let a = 0; a < nx; a++) {
        for (let i = S.head[(c * ny + b) * nx + a]; i >= 0; i = S.next[i]) {
          for (let dc = 0; dc <= 1; dc++) {
            for (let db = (dc === 0 ? 0 : -1); db <= 1; db++) {
              for (let da = (dc === 0 && db === 0 ? 0 : -1); da <= 1; da++) {
                const a2 = a + da, b2 = b + db, c2 = c + dc;
                if (a2 < 0 || a2 >= nx || b2 < 0 || b2 >= ny || c2 < 0 || c2 >= nz) continue;
                let j = S.head[(c2 * ny + b2) * nx + a2];
                if (da === 0 && db === 0 && dc === 0) j = S.next[i];
                for (; j >= 0; j = S.next[j]) {
                  const dx = S.x[i] - S.x[j], dy = S.y[i] - S.y[j], dz = S.z[i] - S.z[j];
                  const r2 = dx * dx + dy * dy + dz * dz;
                  if (r2 >= d2 || r2 === 0) continue;
                  const dvx = S.vx[i] - S.vx[j], dvy = S.vy[i] - S.vy[j], dvz = S.vz[i] - S.vz[j];
                  const dot = dvx * dx + dvy * dy + dvz * dz;
                  if (dot >= 0) continue;              // already separating
                  const f = dot / r2;
                  S.vx[i] -= f * dx; S.vy[i] -= f * dy; S.vz[i] -= f * dz;
                  S.vx[j] += f * dx; S.vy[j] += f * dy; S.vz[j] += f * dz;
                }
              }
            }
          }
        }
      }
    }
  }
}

/* ========================================================================= */

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, ctext, croundRect,
} from '../sim-kit.js';

const TAU = Math.PI * 2;
const MW = 1120;
const HC = 362, HC_SM = 372;      // the cylinder
const HG = 340, HG_SM = 380;      // the graph
const NARROW = 760;

const M_AR = 39.948 * AMU;        // argon, because it is the gas that is most
/* the cylinder is a square prism rather than a cube: the cross-section is
 * fixed and the piston slides, which is what a cylinder is, and it gives the
 * panel a shape worth drawing */
const L_BOX = 6.5e-9;

const N_LO = 60, N_HI = 500;
const T_LO = 80, T_HI = 900;      // K
const X_LO = 4.5e-9, X_HI = 26e-9;
const D_LO = 0, D_HI = 0.55e-9;
const P_LO = 4e5, P_HI = 70e5;    // Pa, the load on a floating piston
const U_LO = 2, U_HI = 60;        // m s⁻¹, how fast the piston is allowed to move

const DT = 4e-14;                 // s per step

/* How much gas-time goes by in one drawn frame. Two different answers,
 * because there are two different things to watch. Standing still, the point
 * is the molecules, so the clock is slow enough to follow one across the box.
 * While the piston is moving the point is the piston, and a quasi-static
 * squeeze takes a thousand box-crossings however you draw it, so the clock
 * speeds up and the molecules blur — which is the honest picture of a
 * compression that is slow compared with molecular motion. */
const STEP_RUN = 40, STEP_MOVE = 260, STEP_SWEEP = 170;

const HIST = 620;                 // frames of history the live panel keeps

const MODES = {
  isothermal: { name: 'hold the temperature' },
  isobaric:   { name: 'hold the pressure' },
  isochoric:  { name: 'hold the volume' },
  adiabatic:  { name: 'insulate it' },
};

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'b3-ideal-gas',
    title: 'The ideal gas, from the molecules up',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    mode: 'isothermal',
    N: 300,
    T: 300,          // the bath setting, K
    X: 15e-9,        // where the piston is asked to be
    d: 0.34e-9,
    pSet: 20e5,      // the load on the piston, for the floating case
    u: 12,           // m s⁻¹
    graph: 'live',   // 'live', 'speeds' or 'experiment'
    playing: true,
    data: [],        // the readings taken
    path: [],        // what the gauges have read, for the live panel
    sweep: null,
    ledger: null,    // the first-law ledger, once one has been started
  };

  let S = null;
  function fresh(keepLedger) {
    S = createGas({ N: st.N, L: L_BOX, X: st.X, T: st.T, m: M_AR, d: st.d,
                    seed: 20260919 });
    /* let the gauge fill before anything is read off it */
    for (let i = 0; i < 4000; i++) stepGas(S, DT, { bath: bathOn() ? st.T : null });
    if (!keepLedger) st.ledger = null;
    st.path = [];
  }
  const bathOn = () => st.mode !== 'adiabatic';

  /* what the gas is doing, as numbers, right now */
  function now() {
    const V = volume(S), p = pressure(S), T = temperature(S), U = kinetic(S);
    return {
      V, p, T, U, N: S.N, X: S.X,
      nMol: S.N / NA,
      rho: S.N * S.m / V,
      phi: S.N * (Math.PI / 6) * Math.pow(S.d, 3) / V,
      pvOverU: p * V / ((2 / 3) * U),
      Z: p * V / (S.N * KB * T),
      vrms: Math.sqrt(2 * U / (S.N * S.m)),
      hits: S.hits,
    };
  }

  /* ------------------------------------------------------------ controls */

  const sN = slider({ label: '<i>N</i>', min: N_LO, max: N_HI, step: 10, value: st.N,
    format: v => `${v} molecules = ${sci(v / NA, 2)} mol`,
    onInput: v => { st.N = v; fresh(); render(); } });
  const sT = slider({ label: '<i>T</i>', min: T_LO, max: T_HI, step: 5, value: st.T,
    format: v => `${v} K = ${fmt(v - 273.15, 0)} °C`,
    onInput: v => { st.T = v; render(); } });
  const sX = slider({ label: '<i>V</i>', min: X_LO * 1e9, max: X_HI * 1e9, step: 0.05,
    value: st.X * 1e9,
    format: v => `${sci(v * 1e-9 * L_BOX * L_BOX, 2)} m³`,
    onInput: v => { st.X = v * 1e-9; render(); } });
  const sD = slider({ label: '<i>d</i>', min: 0, max: D_HI * 1e12, step: 1,
    value: st.d * 1e12,
    format: v => v === 0 ? 'point molecules — no size at all'
                         : `${fmt(v / 1000, 3)} nm across`,
    onInput: v => { st.d = v * 1e-12; S.d = st.d; render(); } });
  const sP = slider({ label: '<i>p</i>', min: P_LO / 1e5, max: P_HI / 1e5, step: 0.5,
    value: st.pSet / 1e5,
    format: v => `${fmt(v, 1)} bar on the piston`,
    onInput: v => { st.pSet = v * 1e5; render(); } });
  const sU = slider({ label: 'piston', min: U_LO, max: U_HI, step: 0.5, value: st.u,
    format: v => `${fmt(v, 1)} m s⁻¹ — ${fmt(100 * v / 400, 1)}% of a molecule’s speed`,
    onInput: v => { st.u = v; render(); } });

  const bMode = Object.keys(MODES).map(k => button({
    label: MODES[k].name, pressed: k === st.mode, onClick: () => setMode(k),
  }));

  function setMode(k) {
    st.mode = k;
    st.sweep = null;
    bMode.forEach((b, i) => b.setPressed(Object.keys(MODES)[i] === k));
    sX.node.hidden = !(k === 'isothermal' || k === 'adiabatic');
    sP.node.hidden = k !== 'isobaric';
    sT.node.hidden = k === 'adiabatic';
    sU.node.hidden = k === 'isochoric';
    bSweep.node.textContent = SWEEP[k].label;
    st.data = []; st.path = [];
    st.ledger = null;
    render();
  }

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const GRAPHS = {
    live:       'What is happening now',
    speeds:     'The speeds',
    experiment: 'The readings taken',
  };
  const bGraph = Object.keys(GRAPHS).map(k => button({
    label: GRAPHS[k], pressed: k === st.graph, onClick: () => setGraph(k),
  }));
  function setGraph(k) {
    st.graph = k;
    bGraph.forEach((b, i) => b.setPressed(Object.keys(GRAPHS)[i] === k));
    render();
  }
  const bSame = button({ label: 'Start them all at the same speed', onClick: () => {
    const R = rng((Math.random() * 1e9) | 0);
    const speed = Math.sqrt(3 * KB * temperature(S) / S.m);
    for (let i = 0; i < S.N; i++) {
      const u = 2 * R() - 1, ph = TAU * R(), s = Math.sqrt(1 - u * u);
      S.vx[i] = speed * s * Math.cos(ph);
      S.vy[i] = speed * s * Math.sin(ph);
      S.vz[i] = speed * u;
    }
    setGraph('speeds');
  } });
  const bLedger = button({ label: 'Start the energy ledger here', onClick: () => {
    S.wGas = 0; S.qBath = 0; S.u0 = kinetic(S);
    st.ledger = { V: volume(S), p: pressure(S), T: temperature(S), t: S.t };
    render();
  } });
  const bSweep = button({ label: 'Work through eight volumes', onClick: () => startSweep() });
  const bClr = button({ label: 'Clear the readings', onClick: () => {
    st.data = []; st.path = []; render();
  } });

  /* ---------------------------------------------------------- the sweeps */

  const SWEEP = {
    isothermal: { label: 'Work through eight volumes', what: 'X',
      values: () => [6.0, 8.0, 10.4, 13.0, 16.0, 19.0, 22.2, 25.5].map(v => v * 1e-9) },
    adiabatic: { label: 'Squeeze it, recording as it goes', what: 'X',
      values: () => [24.0, 21.0, 18.3, 15.9, 13.6, 11.5, 9.6, 7.8].map(v => v * 1e-9) },
    isobaric: { label: 'Work through eight temperatures', what: 'T',
      /* how hot the gas can be got before the piston runs out of cylinder
       * depends on the load and on how much gas there is, so the eight
       * temperatures are chosen from the apparatus rather than fixed */
      values: () => {
        const hi = clamp(st.pSet * X_HI * L_BOX * L_BOX / (st.N * KB) * 0.92, 160, T_HI);
        const lo = clamp(st.pSet * X_LO * 1.7 * L_BOX * L_BOX / (st.N * KB), T_LO, hi - 100);
        return Array.from({ length: 8 }, (_, i) => Math.round(lo + (hi - lo) * i / 7));
      } },
    isochoric: { label: 'Work through eight temperatures', what: 'T',
      values: () => [120, 220, 320, 420, 520, 620, 720, 850] },
  };

  function startSweep() {
    const S_ = SWEEP[st.mode];
    st.data = [];
    if (st.mode === 'adiabatic') {
      st.X = S_.values()[0]; sX.set(st.X * 1e9);
      fresh();
      S.wGas = 0; S.qBath = 0; S.u0 = kinetic(S);
      st.ledger = { V: volume(S), p: pressure(S), T: temperature(S), t: S.t };
    }
    st.sweep = { vals: S_.values(), i: 0, what: S_.what, phase: 'settle',
                 clock: 0, acc: 0, accT: 0, accV: 0, n: 0 };
    setGraph('experiment');
  }

  /** one frame of a sweep: put the dial where it should be, wait for the gas
   *  to settle, then average the gauge for a while and write it down */
  function sweepFrame() {
    const sw = st.sweep;
    if (!sw) return;
    const target = sw.vals[sw.i];
    if (sw.what === 'X') { st.X = target; sX.set(target * 1e9); }
    else { st.T = target; sT.set(target); }
    sw.clock += STEP_SWEEP * DT;

    /* "settled" means something different in each experiment: the piston has
     * arrived, or the free piston has stopped drifting because the gas is
     * pushing back exactly as hard as the load */
    const settled = sw.what === 'X'
      ? Math.abs(S.X - target) < 1e-12
      : st.mode === 'isobaric'
        ? Math.abs(pSlow - st.pSet) / st.pSet < 0.012 || sw.clock > 2.4e-9
        : true;
    if (sw.phase === 'settle') {
      if (settled && sw.clock > 2.2e-10) {
        sw.phase = 'measure'; sw.clock = 0;
        sw.acc = 0; sw.accT = 0; sw.accV = 0; sw.n = 0;
      }
      return;
    }
    sw.acc += pressure(S); sw.accT += temperature(S); sw.accV += volume(S); sw.n++;
    if (sw.clock > 3.2e-10) {
      st.data.push({ p: sw.acc / sw.n, T: sw.accT / sw.n, V: sw.accV / sw.n,
                     U: kinetic(S) });
      sw.i++; sw.phase = 'settle'; sw.clock = 0;
      if (sw.i >= sw.vals.length) st.sweep = null;
      render();
    }
  }

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'gas',  label: 'The gas: how many, in what space, at what temperature' },
    { key: 'gauge', label: 'The gauge: impulse delivered to the walls, over area and time' },
    { key: 'kin',  label: 'Kinetic theory: <i>pV</i> measured, against two thirds of the kinetic energy' },
    { key: 'law',  label: 'The equation of state: <i>pV</i> divided by <i>NkT</i>' },
    { key: 'sweep', label: 'The experiment, and the law that comes out of it' },
    { key: 'first', label: 'The first law: three quantities measured separately' },
    { key: 'speeds', label: 'The speeds: what the collisions made of them' },
    { key: 'limit', label: 'Where the ideal gas model gives out' },
  ]);

  /* ------------------------------------------------------------- canvas */

  const cv = surface(MW, HC, { label: 'the cylinder and the molecules in it' });
  const gv = surface(MW, HG, { label: 'the indicator diagram' });

  /* ------------------------------------------------------------- layout */

  root.append(
    heading('The Ideal Gas, from the Molecules Up',
            'nothing here uses <i>pV</i> = <i>nRT</i>, or <i>p</i> = ⅓ρ⟨<i>c</i>²⟩, or '
            + 'Maxwell–Boltzmann — a few hundred hard spheres are flown about and '
            + 'the walls are asked how hard they were hit'),
    controls([el('div', { class: 'ibs-btns' }, bMode.map(b => b.node))],
             { label: 'what is held fixed:' }),
    panelBox('The cylinder — every molecule in it is being followed', cv.el),
    panelBox('What the gauge and the thermometer say', gv.el),
    controls([el('div', { class: 'ibs-btns' }, bGraph.map(b => b.node))],
             { label: 'the panel below shows:' }),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bSame.node, bLedger.node])]),
    controls([el('div', { class: 'ibs-btns' }, [bSweep.node, bClr.node])],
             { label: 'experiments:' }),
    controls([sN.node, sT.node, sX.node, sP.node, sD.node, sU.node]),
    out.node,
    note('<b>A gas is not a substance with laws. It is a crowd.</b> Put a few hundred '
      + 'hard spheres in a box, let them fly in straight lines and bounce elastically, '
      + 'and every gas law follows from counting. <b>Pressure</b> is not assumed here: '
      + 'each bounce delivers an impulse to a wall, the impulses are added up over a '
      + 'stretch of time, and the total is divided by the area and the time. That is a '
      + 'gauge, and it reads in bars. <b>Temperature</b> is the mean kinetic energy of a '
      + 'molecule — the one line on this panel that is a definition rather than a '
      + 'measurement, because Boltzmann’s constant is only the exchange rate between '
      + 'joules and kelvin. <b>The rest comes out.</b> Squeeze at constant temperature '
      + 'and <i>pV</i> stays put, which is Boyle. Warm it under a free piston and the '
      + 'volume climbs a straight line that, run backwards, hits zero at −273 °C — '
      + 'absolute zero, read off a graph of an expanding gas. Lock the piston instead '
      + 'and the pressure does the same. <b>Lag the cylinder</b> and squeeze: no heat '
      + 'goes in, yet the gas gets hotter, and the panel shows you exactly why — a '
      + 'molecule bouncing off an advancing piston comes away faster than it arrived. '
      + '<b>The first law</b> is three separately measured numbers: the change in the '
      + 'total kinetic energy, the energy the bath put in, and the work counted one '
      + 'bounce at a time. They add up because nothing was arranged for them to. '
      + '<b>The speeds.</b> Every molecule starts with exactly the same speed — there is '
      + 'no Maxwell–Boltzmann sampler anywhere in this file — and within a fraction of a '
      + 'nanosecond the collisions have made the distribution you were taught. Set the '
      + 'molecules to <b>no size at all</b> and they never collide, so the speeds never '
      + 'change: the distribution is the collisions’ doing, not the gas’s. <b>And the '
      + 'limits.</b> <i>pV</i>/<i>NkT</i> is not quite one. Shrink the molecules and it '
      + 'goes to one; swell them and it climbs, because the room they take up is room '
      + 'the others cannot have. That is the first thing the ideal gas model gets wrong.'));

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /**
   * The cylinder has to hold the piston at the far end of its travel, so the
   * scale is set by the width. The panel's HEIGHT then follows from the
   * scale rather than the other way round: a fixed-height panel would leave
   * a narrow screen with a sliver of cylinder above a field of nothing.
   */
  function cylGeom(W) {
    const sm = W < NARROW;
    const left = sm ? 22 : 54;
    const room = W - left - (sm ? 52 : 140);
    const s = room / X_HI;
    const top = sm ? 40 : 48, bottom = sm ? 74 : 83;
    return { W, sm, left, s, top, hBox: L_BOX * s,
             H: Math.round(top + L_BOX * s + bottom) };
  }
  const GC = () => cylGeom(cv.w);
  const GG = () => {
    const W = gv.w, sm = W < NARROW, H = sm ? HG_SM : HG;
    return { W, H, sm, x0: sm ? 62 : 92, x1: W - (sm ? 18 : 34),
             y0: 34, y1: H - (sm ? 54 : 46) };
  };

  /* a real minus sign, not a hyphen, wherever a number can go negative */
  const neg = s => String(s).replace('-', '\u2212');
  const bar = p => `${fmt(p / 1e5, p < 1e6 ? 2 : 1)} bar`;
  const nm3 = V => `${fmt(V * 1e27, 1)} nm³`;
  const joule = e => `${sci(e, 3)} J`;

  /** a lagged edge: a line with short strokes leaning off it */
  function lag(ctx, x, y, w, dir) {
    ctx.save();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    for (let i = 0; i <= w; i += 8) {
      ctx.moveTo(x + i, y); ctx.lineTo(x + i - 7, y + dir * 9);
    }
    ctx.stroke(); ctx.restore();
  }

  function drawCell() {
    const g = GC(), ctx = cv.ctx;
    const s = g.s, x0 = g.left, y0 = g.top, hb = g.hBox;
    const xp = x0 + S.X * s, y1 = y0 + hb;
    ctx.clearRect(0, 0, g.W, g.H);

    /* the lagging, or the bath */
    const lagged = !bathOn();
    if (lagged) {
      lag(ctx, x0 - 16, y0, xp - x0 + 30, -1);
      lag(ctx, x0 - 16, y1, xp - x0 + 30, 1);
      ctext(ctx, g.sm ? 'lagged' : 'lagged — no heat in or out',
            x0, y1 + 32, { font: `600 12px ${P.font}`, color: P.accent, align: 'left' });
    } else {
      ctx.fillStyle = P.soft;
      croundRect(ctx, x0 - 22, y1 + 6, xp - x0 + 36, 16, 5); ctx.fill();
      ctext(ctx, g.sm ? `bath ${fmt(st.T, 0)} K`
                      : `a water bath holding the walls at ${fmt(st.T, 0)} K`,
            x0, y1 + 36, { font: `600 12px ${P.font}`, color: P.accent, align: 'left' });
    }

    /* the closed end and the cylinder walls */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0, y1);
    ctx.moveTo(x0, y0); ctx.lineTo(g.W - 6, y0);
    ctx.moveTo(x0, y1); ctx.lineTo(g.W - 6, y1);
    ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.6; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = y0; i <= y1; i += 9) { ctx.moveTo(x0, i); ctx.lineTo(x0 - 10, i + 7); }
    ctx.stroke(); ctx.restore();

    /* the molecules, drawn where they are, sized by how near the front they
     * are — the box is a cube and the screen is looking in through its face */
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, Math.max(1, xp - x0), hb); ctx.clip();
    const order = [];
    for (let i = 0; i < S.N; i++) order.push(i);
    order.sort((a, b) => S.z[a] - S.z[b]);
    const rBase = Math.max(1.6, (S.d / 2) * s);
    for (const i of order) {
      const f = 0.68 + 0.6 * (S.z[i] / S.L);
      ctx.globalAlpha = 0.35 + 0.55 * (S.z[i] / S.L);
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(x0 + S.x[i] * s, y0 + S.y[i] * s, Math.max(1.5, rBase * f), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    /* the piston: a block, a rod, and whatever is holding it there */
    const pw = g.sm ? 16 : 24;
    ctx.fillStyle = P.soft; ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.rect(xp, y0, pw, hb); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.globalAlpha = 0.65;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      ctx.moveTo(xp + 3, y0 + hb * i / 4); ctx.lineTo(xp + pw - 3, y0 + hb * i / 4);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(xp + pw, (y0 + y1) / 2); ctx.lineTo(g.W - 10, (y0 + y1) / 2);
    ctx.stroke();

    /* the handle: this is the thing you take hold of */
    if (canDrag()) {
      const cy = (y0 + y1) / 2, hx = xp + pw + (g.sm ? 20 : 30);
      ctx.fillStyle = dragging ? P.accent : P.soft;
      ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      croundRect(ctx, hx, cy - 15, g.sm ? 16 : 20, 30, 5);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = dragging ? P.bg : P.text; ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const gx = hx + (g.sm ? 5 : 6) + i * (g.sm ? 3.5 : 4.5);
        ctx.moveTo(gx, cy - 8); ctx.lineTo(gx, cy + 8);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (!g.sm) {
        ctext(ctx, dragging ? 'let go to stop' : 'take hold and slide it',
              hx + 28, cy - 12,
              { font: `600 12px ${P.font}`, color: P.accent,
                halo: P.bg, haloWidth: 5 });
      }
    }

    if (st.mode === 'isochoric') {
      /* a catch, holding it */
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(xp + pw + 14, (y0 + y1) / 2 - 16);
      ctx.lineTo(xp + pw + 14, (y0 + y1) / 2 + 16);
      ctx.stroke();
      ctext(ctx, g.sm ? 'locked' : 'the piston is locked', xp + pw + 22,
            (y0 + y1) / 2 - 22, { font: `600 12px ${P.font}`, color: P.accent });
    } else if (st.mode === 'isobaric') {
      ctext(ctx, g.sm ? `${fmt(st.pSet / 1e5, 1)} bar`
                      : `free, under a load of ${fmt(st.pSet / 1e5, 1)} bar`,
            xp + pw + 16, (y0 + y1) / 2 - 12,
            { font: `600 12px ${P.font}`, color: P.accent });
    }

    /* the one liberty, said out loud */
    ctext(ctx, g.sm ? 'seen through the front face'
                    : 'the cylinder is square in cross-section and this is a view in '
                      + 'through its front face — two molecules that seem to touch are '
                      + 'at different depths',
          g.W - 8, g.H - 10,
          { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* the size of the box, as a dimension */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 12); ctx.lineTo(xp, y0 - 12);
    ctx.moveTo(x0, y0 - 16); ctx.lineTo(x0, y0 - 8);
    ctx.moveTo(xp, y0 - 16); ctx.lineTo(xp, y0 - 8);
    ctx.stroke();
    ctext(ctx, `${fmt(S.X * 1e9, 1)} nm × ${fmt(L_BOX * 1e9, 1)} nm × ${fmt(L_BOX * 1e9, 1)} nm`
               + `  =  ${nm3(volume(S))}`,
          (x0 + xp) / 2, y0 - 18,
          { font: `600 11.5px ${P.font}`, color: P.accent, align: 'center' });
  }

  /* --------------------------------------------------------- the graph */

  function ticks(lo, hi, want = 6) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / want, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const stp = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const o = [];
    for (let t = Math.ceil(lo / stp) * stp; t <= hi + stp * 1e-9; t += stp) {
      o.push(Math.abs(t) < stp * 1e-9 ? 0 : t);
    }
    return o;
  }

  const plot = (b, xlo, xhi, ylo, yhi) => ({
    ...b, xlo, xhi, ylo, yhi,
    X: x => b.x0 + (x - xlo) / (xhi - xlo) * (b.x1 - b.x0),
    Y: y => b.y1 - (y - ylo) / (yhi - ylo) * (b.y1 - b.y0),
  });

  function frameOf(ctx, p, o) {
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(p.x0 + 0.5, p.y0 + 0.5, p.x1 - p.x0 - 1, p.y1 - p.y0 - 1);
    for (const t of ticks(p.ylo, p.yhi, o.yw || 5)) {
      const y = p.Y(t);
      if (y < p.y0 - 1 || y > p.y1 + 1) continue;
      ctx.strokeStyle = P.soft; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(p.x0, y); ctx.lineTo(p.x1, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctext(ctx, o.yfmt(t), p.x0 - 6, y + 3.5,
            { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right' });
    }
    for (const t of ticks(p.xlo, p.xhi, o.xw || 6)) {
      const x = p.X(t);
      if (x < p.x0 - 1 || x > p.x1 + 1) continue;
      ctx.strokeStyle = Math.abs(t) < 1e-12 ? P.frame : P.soft;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x, p.y0); ctx.lineTo(x, p.y1); ctx.stroke();
      ctx.globalAlpha = 1;
      ctext(ctx, o.xfmt(t), x, p.y1 + 15,
            { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, o.title, p.x0, p.y0 - 8,
          { font: `600 11.5px ${P.font}`, color: P.accent, align: 'left' });
    ctext(ctx, o.xtitle, (p.x0 + p.x1) / 2, p.y1 + 33,
          { font: `600 11.5px ${P.font}`, color: P.accent, align: 'center' });
  }

  /** a straight line through the recorded points, by least squares */
  function fitLine(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-300) return null;
    const grad = (n * sxy - sx * sy) / den;
    return { grad, inter: (sy - grad * sx) / n };
  }

  /* ------------------------------------------------- what is happening now
   *
   * Four traces of the last few seconds, each drawn from zero so that the
   * height of the filled area IS the quantity, not a magnified wiggle of it.
   * Three of them are what you are doing to the gas. The fourth is pV/T, and
   * the whole point of it is that it does not move: with the number of
   * molecules fixed there is nothing left for it to depend on. That is the
   * gas law, arrived at by watching three separate instruments rather than
   * by being written down anywhere.
   */
  const LIVE = [
    { label: 'Volume', unit: 'nm³', of: q => q.V * 1e27,
      top: () => X_HI * L_BOX * L_BOX * 1e27, show: v => fmt(v, 0),
      why: 'where you have put the piston' },
    { label: 'Pressure', unit: 'bar', of: q => q.p / 1e5, top: null,
      show: v => fmt(v, v < 20 ? 2 : 1),
      why: 'how hard the molecules are hammering the walls' },
    { label: 'Temperature', unit: 'K', of: q => q.T, top: () => T_HI,
      show: v => fmt(v, 0), why: 'the mean kinetic energy of a molecule' },
    { label: 'pV / T', unit: 'J K⁻¹', of: q => q.p * q.V / q.T, top: null,
      show: v => sci(v, 3),
      why: 'N is fixed — so this one cannot move' },
  ];

  /* Every word in the left-hand column goes through here: measured, shrunk
   * a little if that is enough, wrapped if it is not, and cut with an
   * ellipsis rather than allowed to run across the strip beside it. What it
   * draws is recorded so the verifier can prove none of it ever touches a
   * box. */
  let TEXTS = [], BOXES = [];

  function colText(ctx, str, x, y, maxW, size, weight, color, maxLines = 2) {
    let px = size;
    ctx.font = `${weight} ${px}px ${P.font}`;
    while (px > size - 1.5 && ctx.measureText(str).width > maxW) {
      px -= 0.5;
      ctx.font = `${weight} ${px}px ${P.font}`;
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
      TEXTS.push({ str: ln, x, y: yy - px * 0.8,
                   w: ctx.measureText(ln).width, h: px * 1.05 });
    });
    return lines.length * (px + 3);
  }

  function drawLive(ctx, g) {
    TEXTS = []; BOXES = [];
    const H = (g.y1 - g.y0) / LIVE.length;
    const labW = g.sm ? 130 : 268;
    const hist = st.path;
    const last = hist.length ? hist[hist.length - 1]
                             : { V: volume(S), p: pressure(S), T: temperature(S) };
    LIVE.forEach((row, i) => {
      const y0 = g.y0 + i * H, y1 = y0 + H - (g.sm ? 8 : 10);
      const x0 = g.x0 + labW, x1 = g.x1;
      const vals = hist.map(row.of);
      const nowV = row.of(last);
      let top = row.top ? row.top() : Math.max(nowV, ...vals) * 1.25;
      if (!(top > 0)) top = 1;
      if (!row.top) {                       // a round number, so it reads
        const pw = Math.pow(10, Math.floor(Math.log10(top)));
        const m = top / pw;
        top = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pw;
      }
      const Y = v => y1 - clamp(v / top, 0, 1) * (y1 - y0);
      const X = k => x1 - (hist.length - 1 - k) * (x1 - x0) / Math.max(HIST - 1, 1);

      /* the strip */
      ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
      BOXES.push({ x0, y0, x1, y1 });
      ctx.save();
      croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.clip();
      if (vals.length > 1) {
        ctx.fillStyle = P.soft;
        ctx.beginPath();
        ctx.moveTo(X(0), y1);
        vals.forEach((v, k) => ctx.lineTo(X(k), Y(v)));
        ctx.lineTo(X(vals.length - 1), y1);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
        ctx.beginPath();
        vals.forEach((v, k) => k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)));
        ctx.stroke();
      }
      ctx.restore();
      /* the top of the scale, so the height of the fill means something */
      ctext(ctx, row.show(top), x1 - 4, y0 + 12,
            { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
      ctext(ctx, '0', x1 - 4, y1 - 4,
            { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
      /* where it is now */
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(x1 - 1.5, Y(nowV), 4, 0, TAU); ctx.fill();

      /* the name and the number */
      const maxW = labW - 16;
      colText(ctx, row.label, g.x0, y0 + (g.sm ? 14 : 16), maxW,
              g.sm ? 11.5 : 13, 600, P.accent, 1);
      colText(ctx, `${row.show(nowV)} ${row.unit}`, g.x0, y0 + (g.sm ? 34 : 40),
              maxW, g.sm ? 16 : 20, 700, P.text, 1);
      if (!g.sm) colText(ctx, row.why, g.x0, y0 + 60, maxW, 10.5, 500, P.muted, 3);
    });
    ctext(ctx, `the last few nanoseconds of gas — about `
             + `${fmt(HIST / 60, 0)} seconds of watching. All three instruments `
             + `read over the same short window, the way instruments do`,
          g.x1, g.y1 + 16,
          { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
  }

  function drawGraph() {
    const g = GG(), ctx = gv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    if (st.graph === 'speeds') { drawSpeeds(ctx, g); return; }
    if (st.graph === 'live') { drawLive(ctx, g); return; }
    const box = { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 };
    const s = now();
    const pv = st.mode === 'isothermal' || st.mode === 'adiabatic';

    if (!st.data.length && !st.sweep) {
      ctext(ctx, 'no readings yet — press one of the experiments below',
            (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2,
            { font: `600 13px ${P.font}`, color: P.muted, align: 'center' });
      return;
    }
    if (pv) {
      const Vmax = X_HI * L_BOX * L_BOX * 1e27;
      const pMax = Math.max(s.p / 1e5, ...st.data.map(d => d.p / 1e5),
                            ...st.path.map(q => q.p / 1e5)) * 1.18;
      const p = plot(box, 0, Vmax * 1.04, 0, pMax);
      frameOf(ctx, p, {
        yfmt: t => fmt(t, 0), xfmt: t => fmt(t, 0), yw: 6,
        title: 'the indicator diagram — p / bar against V / nm³',
        xtitle: 'V / nm³        (the area under the path is the work)',
      });


      /* the area under the path since the ledger was started: this is the
       * work, drawn, and the readout compares it with the work counted one
       * bounce at a time */
      if (st.ledger && st.path.length > 2) {
        ctx.fillStyle = P.soft; ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(p.X(st.path[0].V * 1e27), p.Y(0));
        for (const q of st.path) ctx.lineTo(p.X(q.V * 1e27), p.Y(q.p / 1e5));
        ctx.lineTo(p.X(st.path[st.path.length - 1].V * 1e27), p.Y(0));
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      }
      /* where the gas has been */
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.5;
      ctx.beginPath();
      st.path.forEach((q, i) => i ? ctx.lineTo(p.X(q.V * 1e27), p.Y(q.p / 1e5))
                                  : ctx.moveTo(p.X(q.V * 1e27), p.Y(q.p / 1e5)));
      ctx.stroke(); ctx.globalAlpha = 1;

      const fit = fitPower();
      if (fit) {
        ctx.save();
        ctx.beginPath(); ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); ctx.clip();
        ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const V = Vmax * 1e-27 * (0.06 + 0.98 * i / 160);
          const pp = Math.exp(fit.lnC - fit.gamma * Math.log(V)) / 1e5;
          const X = p.X(V * 1e27), Y = p.Y(pp);
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.restore();
      }
      for (const d of st.data) mark(ctx, p.X(d.V * 1e27), p.Y(d.p / 1e5));
      dot(ctx, p.X(s.V * 1e27), p.Y(s.p / 1e5));
      return;
    }

    /* the two straight-line laws, plotted against temperature in °C so that
     * the intercept — absolute zero — is on the paper */
    const isoP = st.mode === 'isobaric';
    const ys = st.data.map(d => isoP ? d.V * 1e27 : d.p / 1e5);
    const yNow = isoP ? s.V * 1e27 : s.p / 1e5;
    const yMax = Math.max(yNow, ...ys, 1) * 1.2;
    const p = plot(box, -320, 680, 0, yMax);
    frameOf(ctx, p, {
      yfmt: t => fmt(t, 0), xfmt: t => neg(fmt(t, 0)), yw: 5, xw: 6,
      title: isoP ? 'V / nm³ against temperature, at a fixed load on the piston'
                  : 'p / bar against temperature, with the piston locked',
      xtitle: 'temperature / °C',
    });


    const fit = fitLine(st.data.map(d => [d.T - 273.15, isoP ? d.V * 1e27 : d.p / 1e5]));
    if (fit) {
      const xAt0 = -fit.inter / fit.grad;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(p.X(xAt0), p.Y(0));
      ctx.lineTo(p.X(660), p.Y(fit.inter + fit.grad * 660));
      ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.X(xAt0), p.Y(0)); ctx.lineTo(p.X(xAt0), p.y0);
      ctx.stroke(); ctx.setLineDash([]);
      ctext(ctx, neg(`${fmt(xAt0, 1)} °C`), p.X(xAt0) + 6, p.y0 + 16,
            { font: `700 12px ${P.font}`, color: P.accent, halo: P.bg, haloWidth: 4 });
      if (!g.sm) {
        ctext(ctx, 'run the line back and it reaches zero here', p.X(xAt0) + 6,
              p.y0 + 32, { font: `500 11px ${P.font}`, color: P.muted });
      }
    }
    for (const d of st.data) mark(ctx, p.X(d.T - 273.15), p.Y(isoP ? d.V * 1e27 : d.p / 1e5));
    dot(ctx, p.X(s.T - 273.15), p.Y(yNow));
  }

  const mark = (ctx, x, y) => {
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); ctx.stroke();
  };
  const dot = (ctx, x, y) => {
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.fill();
  };

  /** ln p against ln V over the readings: the gradient is −γ */
  function fitPower() {
    if (st.data.length < 3) return null;
    const f = fitLine(st.data.map(d => [Math.log(d.V), Math.log(d.p)]));
    if (!f) return null;
    return { gamma: -f.grad, lnC: f.inter };
  }

  /** the speeds, as a histogram, with the curve nobody put in laid over it */
  function drawSpeeds(ctx, g) {
    const T = temperature(S), m = S.m;
    const vp = Math.sqrt(2 * KB * T / m);          // the most likely speed
    const vMax = 3.1 * vp;
    const nb = g.sm ? 16 : 24;
    const hist = new Float64Array(nb);
    for (let i = 0; i < S.N; i++) {
      const v = Math.hypot(S.vx[i], S.vy[i], S.vz[i]);
      const b = Math.floor(v / vMax * nb);
      if (b >= 0 && b < nb) hist[b]++;
    }
    const w = vMax / nb;
    let top = 0;
    for (let i = 0; i < nb; i++) { hist[i] /= S.N * w; top = Math.max(top, hist[i]); }
    const mb = v => 4 * Math.PI * Math.pow(m / (TAU * KB * T), 1.5) * v * v
                    * Math.exp(-m * v * v / (2 * KB * T));
    for (let i = 0; i <= 200; i++) top = Math.max(top, mb(vMax * i / 200));
    const p = plot({ x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 },
                   0, vMax, 0, top * 1.14);
    frameOf(ctx, p, {
      yfmt: () => '', xfmt: t => fmt(t, 0), yw: 4,
      title: 'how many molecules have each speed, right now',
      xtitle: 'speed / m s⁻¹',
    });
    ctx.fillStyle = P.soft;
    for (let i = 0; i < nb; i++) {
      const x = p.X(i * w), x2 = p.X((i + 1) * w);
      ctx.fillRect(x + 0.5, p.Y(hist[i]), x2 - x - 1, p.y1 - p.Y(hist[i]));
    }
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
    for (let i = 0; i < nb; i++) {
      const x = p.X(i * w), x2 = p.X((i + 1) * w);
      ctx.strokeRect(x + 0.5, p.Y(hist[i]), x2 - x - 1, p.y1 - p.Y(hist[i]));
    }
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const v = vMax * i / 240, X = p.X(v), Y = p.Y(mb(v));
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctext(ctx, g.sm ? 'Maxwell–Boltzmann at the measured T'
                    : 'dashed: Maxwell–Boltzmann at the temperature just measured — '
                      + 'drawn for comparison, never used',
          g.x1 - 6, g.y0 + 16,
          { font: `600 11px ${P.font}`, color: P.accent, align: 'right',
            halo: P.bg, haloWidth: 4 });
  }

  /* --------------------------------------------------------- readouts */

  function erf(x) {
    const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
              - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return s * y;
  }

  /**
   * How far the speeds are from Maxwell–Boltzmann, as the largest gap between
   * the measured cumulative distribution and the predicted one. With a finite
   * number of molecules it can never reach zero: a sample of N drawn from the
   * right distribution still sits about 0.78/√N away, and that floor is
   * quoted beside the measurement so the reader knows when it has arrived.
   */
  function mbGap() {
    const T = temperature(S), a = Math.sqrt(KB * T / S.m), v = [];
    for (let i = 0; i < S.N; i++) v.push(Math.hypot(S.vx[i], S.vy[i], S.vz[i]));
    v.sort((x, y) => x - y);
    let D = 0;
    for (let i = 0; i < v.length; i++) {
      const u = v[i] / a;
      const c = erf(u / Math.SQRT2) - Math.sqrt(2 / Math.PI) * u * Math.exp(-u * u / 2);
      D = Math.max(D, Math.abs(c - (i + 0.5) / v.length));
    }
    return { D, floor: 0.78 / Math.sqrt(S.N) };
  }

  /* Two readings of the same gauge. pSlow is a long average, which is what a
   * free piston has to be servoed on — a piston that chased the instantaneous
   * reading would jiggle, because with a few hundred molecules the
   * instantaneous reading jiggles. wobble is how much it jiggles by, and is
   * quoted on the panel as the instrument's own noise. */
  let pSlow = 0, wobble = 0;

  function fillReadouts() {
    const s = now();
    const v = {
      gas: `${S.N} molecules of argon (39.95 u) = ${sci(s.nMol, 3)} mol, in `
         + `${nm3(s.V)} = ${sci(s.V, 3)} m³, at ${fmt(s.T, 1)} K. `
         + `Root-mean-square speed ${fmt(s.vrms, 0)} m s⁻¹; density `
         + `${fmt(s.rho, 2)} kg m⁻³`,
      gauge: `${bar(s.p)} = ${sci(s.p, 4)} Pa, from ${sci(s.hits, 3)} wall impulses `
           + `so far. The reading wobbles by about ±${fmt(100 * wobble / Math.max(pSlow, 1), 1)}% — `
           + `a gauge with only ${S.N} molecules behind it is a noisy instrument`,
      kin: `pV = ${joule(s.p * s.V)}.  Two thirds of the total kinetic energy = `
         + `${joule((2 / 3) * s.U)}.  The two agree to `
         + `${fmt(100 * Math.abs(s.pvOverU - 1), 2)}% — and nothing connected them: `
         + `one was counted off the walls, the other off the speeds`,
      law: `pV / NkT = ${fmt(s.Z, 4)}.  An ideal gas gives exactly 1`,
      sweep: '', first: '', speeds: '', limit: '',
    };

    const mb = mbGap();
    v.speeds = st.d === 0
      ? `the molecules have no size, so they never meet and never swap energy: every `
        + `one still has the speed it started with. The gap from Maxwell–Boltzmann is `
        + `${fmt(mb.D, 3)} and it will stay there`
      : `the largest gap between the measured distribution and Maxwell–Boltzmann is `
        + `${fmt(mb.D, 3)}. With ${S.N} molecules even a perfect gas sits about `
        + `${fmt(mb.floor, 3)} away, so anything near that has arrived. `
        + `They all started at ${fmt(Math.sqrt(3 * KB * s.T / S.m), 0)} m s⁻¹`;

    v.limit = `the molecules fill ${fmt(100 * s.phi, 3)}% of the box, and pV/NkT is `
      + `over by ${neg(fmt(s.Z - 1, 4))}. Four times the packing fraction is `
      + `${fmt(4 * s.phi, 4)}, which is the size of excess to expect: the room the `
      + `molecules take up is room the others cannot have, so they hit the walls more `
      + `often than points would. Drag d down to nothing and the excess goes with it`;

    if (st.ledger) {
      const dU = kinetic(S) - S.u0;
      v.first = `since the ledger was started: ΔU = ${joule(dU)} (the kinetic energy, `
        + `added up), Q = ${joule(S.qBath)} (what the bath put in), W = `
        + `${joule(S.wGas)} (work done by the gas, counted one bounce at a time). `
        + `Q − W = ${joule(S.qBath - S.wGas)}, which misses ΔU by `
        + `${sci(Math.abs(S.qBath - S.wGas - dU) / Math.max(Math.abs(dU), 1e-30), 1)} of `
        + `itself. The area swept on the diagram gives W = ${joule(st.ledgerArea)}`;
    } else {
      v.first = 'press “start the energy ledger here”, then move something';
    }

    if (st.sweep) {
      v.sweep = `taking reading ${st.sweep.i + 1} of ${st.sweep.vals.length} — `
        + `${st.sweep.phase === 'settle' ? 'waiting for the gas to settle'
                                          : 'averaging the gauge'}`;
    } else if (st.data.length >= 2) {
      if (st.mode === 'isothermal') {
        const pvs = st.data.map(d => d.p * d.V);
        const lo = Math.min(...pvs), hi = Math.max(...pvs);
        v.sweep = `${st.data.length} readings over a ${fmt(Math.max(...st.data.map(d => d.V))
          / Math.min(...st.data.map(d => d.V)), 1)}-fold change of volume. pV runs from `
          + `${joule(lo)} to ${joule(hi)} — constant to ${fmt(100 * (hi / lo - 1), 1)}%, `
          + `and that residue is the molecules’ own size, not the measurement`;
      } else if (st.mode === 'adiabatic') {
        const f = fitPower();
        v.sweep = f
          ? `ln p against ln V over the ${st.data.length} readings is a straight line of `
            + `gradient −${fmt(f.gamma, 3)}, so pV^${fmt(f.gamma, 3)} held while the gas `
            + `was squeezed. For point molecules squeezed infinitely slowly it would be `
            + `5/3 = 1.667; the excess is the molecules’ size and the piston’s speed`
          : 'three readings or more give a gradient';
      } else {
        const isoP = st.mode === 'isobaric';
        const f = fitLine(st.data.map(d => [d.T - 273.15, isoP ? d.V * 1e27 : d.p / 1e5]));
        const z = f ? -f.inter / f.grad : 0;
        v.sweep = f
          ? `${st.data.length} readings lie on a straight line. Run it back and the `
            + `${isoP ? 'volume' : 'pressure'} reaches zero at ${neg(fmt(z, 1))} °C — `
            + `absolute zero, read off a graph of a gas being warmed up, and out by `
            + `${fmt(Math.abs(z + 273.15), 1)} °C`
          : 'two readings or more give a line';
      }
    } else {
      v.sweep = `press “${SWEEP[st.mode].label.toLowerCase()}”`;
    }
    out.setAll(v);
  }

  const render = () => { drawCell(); drawGraph(); fillReadouts(); };

  /* -------------------------------------------------------- the handle
   *
   * The cursor does not move the piston. It moves the place the piston is
   * TRYING to get to, and the piston follows at the speed the dial allows —
   * which is what a piston does, and is the only way the work can be right.
   * Snatch the handle across the panel and the piston still takes the time a
   * squeeze at that speed takes.
   */
  let dragging = false;
  const canDrag = () => st.mode === 'isothermal' || st.mode === 'adiabatic';
  const pistonPx = g => g.left + S.X * g.s;
  function overHandle(pt, g) {
    const pw = g.sm ? 16 : 24;
    return pt.x > pistonPx(g) - 10
        && pt.x < pistonPx(g) + pw + (g.sm ? 40 : 54)
        && pt.y > g.top - 12 && pt.y < g.top + g.hBox + 12;
  }
  function aimAt(pt, g) {
    st.X = clamp((pt.x - g.left) / g.s, X_LO, X_HI);
    sX.set(st.X * 1e9);
    if (!st.playing) render();
  }
  cv.el.style.touchAction = 'none';
  cv.el.addEventListener('pointerdown', e => {
    if (!canDrag()) return;
    const g = GC(), pt = cv.at(e);
    if (!overHandle(pt, g)) return;
    dragging = true;
    try { cv.el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    aimAt(pt, g);
  });
  cv.el.addEventListener('pointermove', e => {
    const g = GC(), pt = cv.at(e);
    if (dragging) { aimAt(pt, g); e.preventDefault(); return; }
    cv.el.style.cursor = canDrag() && overHandle(pt, g) ? 'ew-resize' : 'default';
  });
  const letGo = () => { if (dragging) { dragging = false; render(); } };
  cv.el.addEventListener('pointerup', letGo);
  cv.el.addEventListener('pointercancel', letGo);
  cv.el.addEventListener('pointerleave', letGo);

  /* -------------------------------------------------------- the animation */

  let frame = 0;

  /** one frame of gas, whoever is asking: the animation, or a verifier
   *  running the whole experiment at once with the clock turned off */
  function advance(n) {
    let pistonTo = S.X, pistonSpeed = 0;
    if (st.mode === 'isothermal' || st.mode === 'adiabatic') {
      pistonTo = st.X; pistonSpeed = st.u;
    } else if (st.mode === 'isobaric') {
      /* the piston is free and carries a load: it drifts until the gas
       * underneath is pushing exactly as hard as the load pushes down. It is
       * driven by the long average, not the instantaneous reading, because
       * the instantaneous reading is noise on this many molecules */
      const err = clamp(((pSlow || pressure(S)) - st.pSet) / st.pSet, -1, 1);
      pistonTo = clamp(S.X * (1 + 0.10 * err), X_LO, X_HI);
      pistonSpeed = st.u;
    }
    const bath = bathOn() ? st.T : null;
    const V0 = volume(S);
    for (let i = 0; i < n; i++) stepGas(S, DT, { pistonTo, pistonSpeed, bath });
    if (st.mode === 'isobaric') st.X = S.X;
    const p = pressure(S);
    if (st.ledger) st.ledgerArea += p * (volume(S) - V0);
    pSlow = pSlow ? pSlow * 0.97 + p * 0.03 : p;
    wobble = wobble * 0.97 + Math.abs(p - pSlow) * 0.03;
    /* all three read over the same window, so the fourth trace means what
     * it says rather than lurching whenever an instrument catches up */
    st.path.push({ V: volumeAvg(S), p, T: tempAvg(S) });
    while (st.path.length > HIST) st.path.shift();
    return p;
  }

  const anim = loop(() => {
    if (!st.playing) return;
    const moving = (st.mode === 'isothermal' || st.mode === 'adiabatic')
      ? Math.abs(S.X - st.X) > 1e-12
      : st.mode === 'isobaric';
    const p = advance(st.sweep ? STEP_SWEEP : moving ? STEP_MOVE : STEP_RUN);

    if (st.sweep) sweepFrame();
    drawCell(); drawGraph();
    if ((frame++ % 6) === 0) fillReadouts();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  function fitAll() {
    P = palette(root);
    const cw = Math.round(cv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      cv.setLogical(w, cylGeom(w).H);
      gv.setLogical(w, w < NARROW ? HG_SM : HG);
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

  st.ledgerArea = 0;
  fresh();
  setMode('isothermal');
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: q => {
      const m = q.mode, needs = q.N != null || q.reset;
      Object.assign(st, q);
      sN.set(st.N); sT.set(st.T); sX.set(st.X * 1e9);
      sD.set(st.d * 1e12); sP.set(st.pSet / 1e5); sU.set(st.u);
      /* st.X is where the piston is ASKED to be. It is never written
       * straight into the gas: a piston that teleported would do no work,
       * and the work is the point. A fresh gas is built at the new place
       * instead when the molecule count changes. */
      if (needs) fresh(); else S.d = st.d;
      if (m) setMode(m); else render();
    },
    /** run the gas forward by a given time, with whatever is set now */
    _run: (seconds, opt = {}) => {
      const steps = Math.min(600000, Math.round(seconds / DT));
      const bath = (opt.bath !== undefined) ? opt.bath : (bathOn() ? st.T : null);
      for (let i = 0; i < steps; i++) {
        stepGas(S, DT, { pistonTo: opt.pistonTo != null ? opt.pistonTo : S.X,
                         pistonSpeed: opt.pistonSpeed || 0, bath });
      }
      render();
      return steps;
    },
    /** average the gauge over a stretch, the way the sweep does */
    _measure: seconds => {
      const steps = Math.round(seconds / DT);
      const bath = bathOn() ? st.T : null;
      let sp = 0, sT = 0, sV = 0;
      for (let i = 0; i < steps; i++) {
        stepGas(S, DT, { bath });
        sp += pressure(S); sT += temperature(S); sV += volume(S);
      }
      render();
      return { p: sp / steps, T: sT / steps, V: sV / steps, U: kinetic(S) };
    },
    _pressures: () => pressures(S),
    _history: () => st.path.map(q => ({ ...q })),
    _texts: () => TEXTS.map(q => ({ ...q })),
    _boxes: () => BOXES.map(q => ({ ...q })),
    _avg: () => ({ p: pressure(S), V: volumeAvg(S), T: tempAvg(S) }),
    _dragTo: xnm => { st.X = clamp(xnm * 1e-9, X_LO, X_HI);
                      sX.set(st.X * 1e9); return st.X; },
    _state: () => {
      const s = now();
      /* X is where the piston IS; Xset is where it has been asked to go, and
       * between the two lies every joule of work the gas does */
      return { mode: st.mode, N: st.N, T: st.T, X: S.X, Xset: st.X, d: st.d, u: st.u,
               pSet: st.pSet, t: S.t,
               p: s.p, V: s.V, Tm: s.T, U: s.U, Z: s.Z, phi: s.phi,
               pvOverU: s.pvOverU, vrms: s.vrms, hits: s.hits,
               wGas: S.wGas, qBath: S.qBath, u0: S.u0,
               ledger: st.ledger, ledgerArea: st.ledgerArea,
               data: st.data.map(d => ({ ...d })), sweeping: !!st.sweep };
    },
    _speeds: () => {
      const a = [];
      for (let i = 0; i < S.N; i++) a.push(Math.hypot(S.vx[i], S.vy[i], S.vz[i]));
      return a;
    },
    _vel: () => ({ vx: Array.from(S.vx), vy: Array.from(S.vy), vz: Array.from(S.vz) }),
    _pos: () => ({ x: Array.from(S.x), y: Array.from(S.y), z: Array.from(S.z) }),
    _mbGap: () => mbGap(),
    _sameSpeed: () => { bSame.node.click(); },
    _ledger: () => { bLedger.node.click(); st.ledgerArea = 0; },
    _fitPower: () => fitPower(),
    _fitLine: pts => fitLine(pts),
    _sweepNow: () => {
      /* the whole experiment, run at once rather than over the next few
       * seconds — the same frames the animation would have shown */
      startSweep();
      let guard = 0;
      while (st.sweep && guard++ < 20000) {
        advance(STEP_SWEEP);
        sweepFrame();
      }
      render();
      return st.data.map(d => ({ ...d }));
    },
    _advance: n => advance(n),
    _geomC: () => GC(),
    _geomG: () => GG(),
    _consts: () => ({ MW, HC, HC_SM, HG, HG_SM, NARROW, DT, M_AR, L_BOX, KB, NA, AMU,
                      N_LO, N_HI, T_LO, T_HI, X_LO, X_HI, D_LO, D_HI,
                      P_LO, P_HI, U_LO, U_HI }),
  };
}
