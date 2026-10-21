/* ============================================================================
 * A3-2  Work: the area under the curve, and only the part along the motion
 * IB Physics A.3 Work, energy and power
 *
 * Two benches, one definition:
 *
 *   STRETCHING   a spring and a rubber band pulled out by hand. The force
 *                changes as you pull, so the work is not force times distance:
 *                it is the area under the graph, and for the rubber band that
 *                area is nothing like a triangle.
 *   PULLING      a block dragged across a floor by a rope held at an angle.
 *                Only the part of the pull that lies along the motion does any
 *                work at all, and lifting the rope lightens the block as well,
 *                so there is an angle that costs the least.
 *
 * ---------------------------------------------------------------------------
 * NOTHING QUOTED
 *
 * None of the following is written anywhere in this file. Each comes out of
 * the model, and the simulation reports it as a measurement:
 *
 *   * E_p = ½kx² for a stretched spring
 *   * that the work is ½Fx for a force proportional to extension, and that
 *     this is wrong for one that is not
 *   * W = Fs cos θ
 *   * that a force at right angles to the motion does no work
 *   * that the net work done on a body equals the change in its kinetic energy
 *   * tan θ = μ for the rope angle that drags a block for the least work
 *
 * WHAT GOES IN
 *
 *   The definition of work, and only the definition: a force acting through a
 *   small displacement does F·ds, the part of the force that lies along the
 *   motion times how far it moved. Everything the simulation reports as work
 *   is that quantity accumulated step by step along the actual path.
 *   Newton's second law, for the block on the floor.
 *   Hooke's law for the spring, F = kx, which is a measured property of a
 *   spring and not a result about work.
 *   A rubber band's force–extension behaviour, which is soft at first and
 *   stiffens as it is pulled out. That too is a measured property.
 *   Coulomb friction: the floor rubs back with μ times the force pressing the
 *   surfaces together.
 *
 * ---------------------------------------------------------------------------
 * HOW THE NUMBERS ARE GOT
 *
 * Work is never computed from a formula. On the stretching bench the hand's
 * position is tracked frame by frame and F·dx is added up as it moves, so
 * pulling out and pushing back in gives the energy back. On the pulling bench
 * the block's motion is integrated with classical RK4 and each force's F·ds is
 * accumulated separately, which is why the three traces on the graph close.
 * The angle that costs least is found by sweeping the angle, solving the force
 * balance at each one for the pull that just keeps the block going, and
 * accumulating the work — never by differentiating anything.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider, select,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, croundRect,
  chatch, callout,
} from '../sim-kit.js';

/* --------------------------------------------------------------- constants */

const G = 9.81, TAU = Math.PI * 2, DEG = Math.PI / 180;
const AW = 664, AH = 286;          // the apparatus
const GW = 664, GH = 320;          // the graph
const H = 1 / 2000;                // s, physics substep
const X_MAX = 0.32;                // m, as far as the bench will stretch
const S_MAX = 2.4;                 // m, the length of the floor

/* ========================================================================= *
 * THE MODELS
 * ========================================================================= */

/* ---- 1. stretching ----------------------------------------------------- */

/**
 * What the thing in the clamp pulls back with, at extension x.
 *
 *   a spring      obeys Hooke's law: the force is proportional to extension
 *   a rubber band is soft at first and stiffens as it is pulled out
 *
 * Both are measured properties of the object. Neither says anything about
 * work, energy or areas.
 */
function pullBack(x, p) {
  if (x <= 0) return 0;
  return p.mode === 'spring' ? p.k * x
                             : p.k * x * (1 + Math.pow(x / p.xc, 2));
}

/**
 * The work done in going from one extension to the next: the force acting
 * through the displacement, taken at the middle of the step so that a straight
 * stretch of the curve is handled exactly.
 */
function workStep(x0, x1, p) {
  return pullBack((x0 + x1) / 2, p) * (x1 - x0);
}

/** the area under the curve the graph actually draws, by the trapezium rule */
function areaUnder(x, p, n = 400) {
  let a = 0;
  for (let i = 0; i < n; i++) {
    const x0 = x * i / n, x1 = x * (i + 1) / n;
    a += (pullBack(x0, p) + pullBack(x1, p)) / 2 * (x1 - x0);
  }
  return a;
}

/* ---- 2. pulling at an angle -------------------------------------------- */

/**
 * A block on a floor, pulled by a rope at angle θ above the horizontal.
 * The rope's vertical part lifts some of the weight off the floor, so the
 * floor presses back with less and rubs back with less too.
 *
 * state: { s, v, t, wPull, wFric, lifted }   p: { F, th, mu, m }
 */
function floorForces(p) {
  const t = p.th * DEG;
  const along = p.F * Math.cos(t);
  const lift = p.F * Math.sin(t);
  const N = Math.max(0, p.m * G - lift);
  return { along, lift, N, fric: p.mu * N, lifted: lift >= p.m * G };
}

function pullStep(stt, p, h) {
  const { along, N, fric } = floorForces(p);
  if (stt.v <= 0 && along <= fric) { stt.t += h; return; }   /* it will not budge */
  const a = (along - fric * Math.sign(stt.v || 1)) / p.m;
  const ds = stt.v * h + 0.5 * a * h * h;
  stt.s += ds;
  stt.v += a * h;
  stt.t += h;
  /* each force's own F·ds, accumulated along the path the block really took */
  stt.wPull += along * ds;
  stt.wFric += fric * Math.abs(ds);
  if (stt.v < 0) stt.v = 0;
  if (stt.s >= S_MAX) { stt.s = S_MAX; stt.done = true; }
}

/**
 * The pull that would just keep the block going at a steady speed at this
 * angle — found by closing in on it, not by rearranging anything.
 */
function steadyPull(thDeg, p) {
  const net = F => {
    const q = floorForces({ ...p, F, th: thDeg });
    return q.along - q.fric;
  };
  let lo = 0, hi = 4 * p.m * G;
  if (net(hi) < 0) return Infinity;              // this angle cannot drag it at all
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (net(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The work that steady drag costs over a distance, accumulated along the path
 * the way every other number here is.
 */
function workToDrag(thDeg, p, s, n = 200) {
  const F = steadyPull(thDeg, p);
  if (!isFinite(F)) return Infinity;
  const along = F * Math.cos(thDeg * DEG);
  let w = 0;
  for (let i = 0; i < n; i++) w += along * (s / n);
  return w;
}

/**
 * The angle at which the rope has to be pulled hardest — or rather least hard.
 * Swept, then closed in on by golden-section search. Nothing is differentiated
 * and no condition for the minimum is written down.
 */
function easiestAngle(p) {
  let best = 0, bf = Infinity;
  for (let i = 0; i <= 89; i++) {
    const F = steadyPull(i, p);
    if (F < bf) { bf = F; best = i; }
  }
  let lo = Math.max(0, best - 1.5), hi = Math.min(89.9, best + 1.5);
  for (let i = 0; i < 70; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    /* ties keep the lower angle, so a surface with no friction at all — where
     * every angle needs the same nothing — answers "flat along the floor" */
    if (steadyPull(a, p) <= steadyPull(b, p)) hi = b; else lo = a;
  }
  const angle = (lo + hi) / 2;
  return { angle, pull: steadyPull(angle, p) };
}

/* ========================================================================= *
 * THE SIMULATION
 * ========================================================================= */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a3-work',
    title: 'Work: the area under the curve, and only the part along the motion',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    bench: 'stretch',
    playing: true, ann: false, speed: 1,

    /* stretching */
    mode: 'spring', k: 40, xc: 0.16,
    x: 0, xPrev: 0, w: 0, pulling: 1,          // +1 out, −1 back in
    auto: true,

    /* pulling */
    F: 22, th: 25, mu: 0.35, m: 6,
    b: { s: 0, v: 0, t: 0, wPull: 0, wFric: 0, done: false },
    trace: [],
  };

  const stretchP = () => ({ mode: st.mode, k: st.k, xc: st.xc });
  const pullP = () => ({ F: st.F, th: st.th, mu: st.mu, m: st.m });

  function resetStretch() { st.x = 0; st.xPrev = 0; st.w = 0; st.pulling = 1; }
  function resetPull() {
    st.b = { s: 0, v: 0, t: 0, wPull: 0, wFric: 0, done: false };
    st.trace = [];
  }

  /* the sweep is dear, so it is kept until something it depends on moves */
  let sweep = null;
  const sweepNow = () => {
    if (!sweep) {
      const p = pullP(), pull = [], work = [];
      for (let i = 0; i <= 89; i++) {
        pull.push([i, steadyPull(i, p)]);
        work.push([i, workToDrag(i, p, S_MAX)]);
      }
      sweep = { pull, work, best: easiestAngle(p) };
    }
    return sweep;
  };

  /* ---------------------------------------------------------- surfaces */

  const av = surface(AW, AH, { label: 'The work bench' });
  const gv = surface(GW, GH, { label: 'Work as an area, and work as it accumulates' });

  /* ---------------------------------------------------------- readouts */

  const outS = readouts([
    { key: 'x', label: 'Extension now' },
    { key: 'F', label: 'Force needed to hold it there' },
    { key: 'W', label: 'Work done so far, added up as it moved' },
    { key: 'A', label: 'Area under the drawn curve, up to here' },
    { key: 'tri', label: 'Half of force × extension (the triangle)' },
    { key: 'err', label: 'Is that triangle the right answer?' },
    { key: 'half', label: 'Work over the first half of the stretch' },
    { key: 'rest', label: 'Work over the second half' },
    { key: 'back', label: 'Energy stored, which comes back if you let go' },
    { key: 'k', label: 'Stiffness here, <i>F</i>/<i>x</i>' },
  ]);

  const outP = readouts([
    { key: 'th', label: 'Angle of the rope' },
    { key: 'comp', label: 'Part of the pull along the motion' },
    { key: 'lift', label: 'Part of it lifting the block' },
    { key: 'N', label: 'Force from the floor, <i>N</i>' },
    { key: 'f', label: 'Friction, <i>μN</i>' },
    { key: 's', label: 'Distance moved' },
    { key: 'wp', label: 'Work done by the pull' },
    { key: 'wf', label: 'Work done against friction' },
    { key: 'ke', label: 'Kinetic energy gained' },
    { key: 'books', label: 'Do the books close?' },
    { key: 'best', label: 'Angle needing the least pull, found by sweeping' },
    { key: 'tan', label: 'tan of that angle, against <i>μ</i>' },
    { key: 'cost', label: 'Work to drag it the length of the floor, here / flat' },
  ]);

  /* ---------------------------------------------------------- controls */

  const selMode = select({ label: 'in the clamp', value: st.mode,
    options: [{ value: 'spring', label: 'a spring' },
              { value: 'rubber', label: 'a rubber band' }],
    onChange: v => { st.mode = v; resetStretch(); render(); } });
  const sK = slider({ label: '<i>k</i>', min: 10, max: 120, step: 1, value: st.k,
    format: v => `${v.toFixed(0)} N m⁻¹`, onInput: v => { st.k = v; resetStretch(); } });
  const sXc = slider({ label: 'stiffens at', word: true, min: 0.06, max: 0.4, step: 0.01,
    value: st.xc, format: v => `${(v * 100).toFixed(0)} cm`,
    onInput: v => { st.xc = v; resetStretch(); } });
  const sX = slider({ label: '<i>x</i>', min: 0, max: X_MAX, step: 0.002, value: 0,
    format: v => `${(v * 100).toFixed(1)} cm`,
    onInput: v => { st.auto = false; tAuto.setPressed(false); setExtension(v); } });

  const sF = slider({ label: '<i>F</i>', min: 2, max: 60, step: 0.5, value: st.F,
    format: v => `${v.toFixed(1)} N`, onInput: v => { st.F = v; sweep = null; resetPull(); } });
  const sTh = slider({ label: '<i>θ</i>', min: 0, max: 90, step: 1, value: st.th,
    format: v => `${v.toFixed(0)}°`, onInput: v => { st.th = v; resetPull(); } });
  const sMu = slider({ label: '<i>μ</i>', min: 0, max: 1, step: 0.01, value: st.mu,
    format: v => v.toFixed(2), onInput: v => { st.mu = v; sweep = null; resetPull(); } });
  const sM = slider({ label: '<i>m</i>', min: 1, max: 20, step: 0.5, value: st.m,
    format: v => `${v.toFixed(1)} kg`, onInput: v => { st.m = v; sweep = null; resetPull(); } });

  const sS = slider({ label: 'sim speed', word: true, min: 0.1, max: 2, step: 0.1, value: 1,
    format: v => `× ${v.toFixed(1)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bReset = button({ label: 'Start again', onClick: () => {
    resetStretch(); resetPull(); render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });
  const tAuto = button({ label: 'Pull it out and back', pressed: true, onClick: b => {
    st.auto = !st.auto; b.setAttribute('aria-pressed', String(st.auto));
  } });
  const bBest = button({ label: 'Set the angle that needs the least pull', onClick: () => {
    st.th = Math.round(sweepNow().best.angle * 10) / 10;
    sTh.set(st.th); resetPull(); render();
  } });

  /* moving the hand is the one place the extension changes, so the work is
   * accumulated here and nowhere else */
  function setExtension(v) {
    const nx = clamp(v, 0, X_MAX);
    st.w += workStep(st.x, nx, stretchP());
    st.x = nx;
  }

  const benchBtns = {};
  const TITLES = {
    stretch: ['The bench — pull it out, and watch what the pulling costs',
              'Force against extension: the work is the area under it'],
    pull: ['The floor — a block on a rope held at an angle',
           'The work each force has done, as the block goes'],
  };
  const NOTES = {
    stretch: '<b>Physics.</b> Only one thing goes in here: a force acting through a small ' +
      'displacement does <i>F</i>·d<i>s</i>. The simulation watches the hand move and adds ' +
      'that up step by step, so the number in the readout is not a formula being evaluated, ' +
      'it is a running total. Put a spring in the clamp and the force climbs in proportion to ' +
      'the extension, so the area under the graph is a triangle and half of force × extension ' +
      'is exactly right. Put a rubber band in and the force is soft at first and then ' +
      'stiffens, the graph bends, and the triangle under the chord is visibly not the shaded ' +
      'area any more. The readout says by how much it is wrong. That is the whole reason work ' +
      'is defined as an area rather than a product: the product only works when the line is ' +
      'straight. Push the hand back in and the total falls again, because the force now ' +
      'points against the motion — which is what it means for the energy to be stored.',
    pull: '<b>Physics.</b> The rope pulls along the rope, and only the part of that pull lying ' +
      'along the motion does any work. Turn the rope towards the vertical and the work done ' +
      'over the same distance falls away, reaching nothing when the pull is at right angles to ' +
      'the motion — which is why carrying a bag across a room does no work on it, however ' +
      'tired your arm gets. But the vertical part is not doing nothing: it is taking some of ' +
      'the block’s weight off the floor, so the floor presses back less and rubs back ' +
      'less. Those two effects pull against each other, and somewhere between flat and ' +
      'vertical there is an angle at which the rope has to be pulled <em>least hard</em> of ' +
      'all. The simulation finds it by sweeping the angle and closing in, and its tangent ' +
      'turns out to be <i>μ</i> — try it at any mass or any weight you like. Watch the inset ' +
      'carefully though, because the two curves on it do different things: the pull has a ' +
      'genuine minimum, while the work keeps falling all the way to the vertical. They are ' +
      'not the same question. Lifting more of the weight costs you more force along the rope ' +
      'but less friction to fight, and in the limit you are carrying the block rather than ' +
      'dragging it, which is no work at all.',
  };

  function setBench(b) {
    st.bench = b;
    for (const k in benchBtns) benchBtns[k].setPressed(k === b);
    rowS.style.display = b === 'stretch' ? '' : 'none';
    rowS2.style.display = b === 'stretch' ? '' : 'none';
    rowP.style.display = b === 'pull' ? '' : 'none';
    rowP2.style.display = b === 'pull' ? '' : 'none';
    outS.node.style.display = b === 'stretch' ? '' : 'none';
    outP.node.style.display = b === 'pull' ? '' : 'none';
    boxA.querySelector('.ibs-panel__title').innerHTML = TITLES[b][0];
    boxG.querySelector('.ibs-panel__title').innerHTML = TITLES[b][1];
    noteEl.innerHTML = NOTES[b];
    render();
  }
  benchBtns.stretch = button({ label: '1 · Stretching', pressed: true,
    onClick: () => setBench('stretch') });
  benchBtns.pull = button({ label: '2 · Pulling at an angle', pressed: false,
    onClick: () => setBench('pull') });

  /* ------------------------------------------------------------ layout */

  const boxA = panelBox(TITLES.stretch[0], av.el);
  const boxG = panelBox(TITLES.stretch[1], gv.el);
  const rowS = controls([sK.node, sXc.node, sX.node]);
  const rowS2 = controls([selMode.node, el('div', { class: 'ibs-btns' }, [tAuto.node])]);
  const rowP = controls([sF.node, sTh.node, sMu.node, sM.node]);
  const rowP2 = controls([el('div', { class: 'ibs-btns' }, [bBest.node])]);
  const noteEl = note(NOTES.stretch);

  root.append(
    heading('Work',
            'the area under the curve, and only the part that lies along the motion'),
    boxA, boxG,
    controls([el('div', { class: 'ibs-btns' },
      [benchBtns.stretch.node, benchBtns.pull.node])], { label: 'bench:' }),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bReset.node, bAnn.node])]),
    rowS, rowP, rowS2, rowP2,
    controls([sS.node]),
    outS.node, outP.node,
    noteEl,
  );
  rowP.style.display = 'none';
  rowP2.style.display = 'none';
  outP.node.style.display = 'none';

  /* ================================================================== *
   * advancing
   * ================================================================== */

  let acc = 0;
  function advance(dt) {
    const d = Math.min(dt, 0.08) * st.speed;
    if (st.bench === 'stretch') {
      if (st.auto) {
        const rate = X_MAX / 5;                      // the whole stretch in five seconds
        let nx = st.x + st.pulling * rate * d;
        if (nx >= X_MAX) { nx = X_MAX; st.pulling = -1; }
        if (nx <= 0) { nx = 0; st.pulling = 1; }
        setExtension(nx);
        sX.set(st.x);
      }
    } else {
      acc += d;
      let guard = 0;
      const p = pullP();
      while (acc >= H && guard++ < 4000) { pullStep(st.b, p, H); acc -= H; }
      st.trace.push([st.b.s, st.b.wPull, st.b.wFric,
                     0.5 * st.m * st.b.v * st.b.v]);
      if (st.trace.length > 2000) st.trace.shift();
      if (st.b.done && st.b.t > 0) { /* it has reached the end of the floor */ }
    }
  }

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /* ------------------------------------------------- bench 1: stretching */

  const SPPM = 820;                     // px per metre of extension
  const CLAMP_X = 80, REST = 120;       // px: the clamp, and the slack length

  function drawStretch() {
    const ctx = av.ctx, p = stretchP();
    const F = pullBack(st.x, p);
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    const y = 108;
    const handX = CLAMP_X + REST + st.x * SPPM;

    /* the bench and the clamp */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, y + 86); ctx.lineTo(AW - 40, y + 86); ctx.stroke();
    chatch(ctx, 40, y + 86, AW - 80, 0, { color: P.muted, gap: 14, len: 11 });
    ctx.fillStyle = P.soft;
    croundRect(ctx, CLAMP_X - 26, y - 44, 26, 130, 4); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.stroke();

    /* the thing being stretched */
    if (st.mode === 'spring') {
      const n = 16, x0 = CLAMP_X, len = handX - CLAMP_X;
      ctx.strokeStyle = P.text; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + 12, y);
      for (let i = 0; i < n; i++) {
        ctx.lineTo(x0 + 12 + (len - 24) * (i + 0.5) / n, y + (i % 2 ? 17 : -17));
      }
      ctx.lineTo(x0 + len - 12, y); ctx.lineTo(handX, y);
      ctx.stroke();
    } else {
      /* a band thins as it is drawn out, which is what a rubber band does */
      const th = clamp(15 - st.x * 26, 4, 15);
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(CLAMP_X, y - th); ctx.lineTo(handX, y - th);
      ctx.lineTo(handX, y + th); ctx.lineTo(CLAMP_X, y + th); ctx.closePath();
      ctx.fillStyle = P.soft; ctx.fill(); ctx.stroke();
    }

    /* the hand */
    ctx.fillStyle = P.accent;
    croundRect(ctx, handX, y - 20, 17, 40, 5); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5; ctx.stroke();

    /* the force the hand is applying, which is what the bench reads */
    const FS = 118 / Math.max(pullBack(X_MAX, p), 1);
    const fEnd = handX + 24 + F * FS;
    if (carrow(ctx, handX + 24, y, fEnd, y, { color: P.accent, width: 2.6, head: 10, min: 7 })) {
      ctext(ctx, 'F', (handX + 24 + fEnd) / 2, y - 12,
        { font: P.sym(15), color: P.accent, align: 'center', halo: P.bg });
    }

    /* a ruler for the extension */
    const ry = y + 52;
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CLAMP_X + REST, ry); ctx.lineTo(CLAMP_X + REST + X_MAX * SPPM, ry); ctx.stroke();
    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let c = 0; c <= 32; c += 4) {
      const gx = CLAMP_X + REST + c / 100 * SPPM;
      ctx.beginPath(); ctx.moveTo(gx, ry - 5); ctx.lineTo(gx, ry + 5); ctx.stroke();
      ctx.fillText(String(c), gx, ry + 8);
    }
    ctext(ctx, 'extension (cm)', CLAMP_X + REST + X_MAX * SPPM / 2, ry + 30,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center' });
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(CLAMP_X + REST, ry); ctx.lineTo(handX, ry); ctx.stroke(); ctx.restore();

    ctext(ctx, st.pulling > 0 || !st.auto
      ? 'pulling out — the hand is doing work on it, and the running total is climbing'
      : 'letting it back — the force now points against the motion, so the total falls again',
      AW / 2, AH - 14, { font: `600 12px ${P.font}`,
        color: st.pulling > 0 || !st.auto ? P.text : P.accent, align: 'center' });

    if (st.ann) {
      callout(ctx, st.mode === 'spring'
        ? ['The force climbs in step with the extension,',
           'so the graph is a straight line and the area',
           'under it is a triangle. That is the only case',
           'where half of force × extension is right.']
        : ['A rubber band is soft at first and then',
           'stiffens. The graph bends, so the area under',
           'it is nothing like the triangle under the',
           'chord — and the readout says by how much.'],
        24, 22, handX, y, { palette: P });
    }
  }

  /* ---------------------------------------------- bench 2: at an angle */

  const PPM = 200;                       // px per metre along the floor
  const FLOOR = 180, BX0 = 62;
  const BW = 66, BH = 44;

  function drawPull() {
    const ctx = av.ctx, p = pullP(), q = floorForces(p);
    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    const bx = BX0 + st.b.s * PPM, by = FLOOR - BH;
    const cx = bx + BW / 2, cy = by + BH / 2;

    /* the floor */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(30, FLOOR); ctx.lineTo(AW - 30, FLOOR); ctx.stroke();
    chatch(ctx, 30, FLOOR, AW - 60, 0, { color: P.muted, gap: 14, len: 11 });
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let c = 0; c <= S_MAX * 10; c += 2) {
      const gx = BX0 + BW / 2 + c / 10 * PPM;
      if (gx > AW - 30) break;
      ctx.beginPath(); ctx.moveTo(gx, FLOOR + 2); ctx.lineTo(gx, FLOOR + 9); ctx.stroke();
      if (c % 10 === 0) ctx.fillText(`${c / 10} m`, gx, FLOOR + 12);
    }

    /* the block */
    const gr = ctx.createLinearGradient(bx, by, bx + BW, FLOOR);
    gr.addColorStop(0, '#5fa3ab'); gr.addColorStop(0.35, '#005F6A'); gr.addColorStop(1, '#00272d');
    croundRect(ctx, bx, by, BW, BH, 6);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#fff';
    croundRect(ctx, bx + 6, by + 6, BW - 12, 8, 3); ctx.fill(); ctx.restore();

    /* the rope, from the corner it is tied to */
    const t = st.th * DEG;
    const tie = [bx + BW - 6, by + 8];
    const FS = 92 / Math.max(st.m * G, 1);
    const rope = [tie[0] + Math.cos(t) * (st.F * FS + 56),
                  tie[1] - Math.sin(t) * (st.F * FS + 56)];
    ctx.save();
    ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(tie[0], tie[1]); ctx.lineTo(rope[0], rope[1]); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = P.accent;
    croundRect(ctx, rope[0] - 8, rope[1] - 14, 16, 28, 5); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.4; ctx.stroke();

    /* the angle it is held at */
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.6; ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tie[0], tie[1]); ctx.lineTo(tie[0] + 108, tie[1]);
    ctx.stroke(); ctx.restore();
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(tie[0], tie[1], 54, -t, 0); ctx.stroke(); ctx.restore();
    ctext(ctx, 'θ', tie[0] + 64, tie[1] - 22 * Math.sin(t / 2) - 2,
      { font: P.sym(15), color: P.accent, halo: P.bg });

    /* the forces, each from where it acts */
    const fEnd = [tie[0] + Math.cos(t) * st.F * FS, tie[1] - Math.sin(t) * st.F * FS];
    carrow(ctx, tie[0], tie[1], fEnd[0], fEnd[1], { color: P.accent, width: 2.8, head: 10 });
    ctext(ctx, 'F', fEnd[0] + 10, fEnd[1] - 4, { font: P.sym(15), color: P.accent, halo: P.bg });

    /* the part of the pull that lies along the motion, drawn off the face of
     * the block where it leaves, not from the knot */
    const aAt = [bx + BW, cy];
    const aEnd = [aAt[0] + q.along * FS, cy];
    if (carrow(ctx, aAt[0], aAt[1], aEnd[0], aEnd[1],
               { color: P.text, width: 1.9, head: 8, dash: [5, 4], min: 10 })) {
      ctext(ctx, 'the part along the motion', (aAt[0] + aEnd[0]) / 2, cy + 18,
        { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center', halo: P.bg });
    }

    carrow(ctx, cx - 16, FLOOR, cx - 16, FLOOR - q.N * FS,
      { color: P.text, width: 2.2, head: 9, min: 6 });
    ctext(ctx, 'N', cx - 30, FLOOR - q.N * FS - 4,
      { font: P.sym(14), color: P.text, halo: P.bg });

    const wEnd = cy + st.m * G * FS;
    carrow(ctx, cx + 14, cy, cx + 14, wEnd, { color: P.text, width: 2.2, head: 9 });
    ctext(ctx, 'W', cx + 21, wEnd + 4, { font: P.sym(14), color: P.text, halo: P.bg });

    if (carrow(ctx, bx + 4, FLOOR - 6, bx + 4 - q.fric * FS, FLOOR - 6,
               { color: P.accent, width: 2.4, head: 9, min: 7 })) {
      ctext(ctx, 'f', bx - 6 - q.fric * FS, FLOOR - 13,
        { font: P.sym(14), color: P.accent, halo: P.bg });
    }

    ctext(ctx, q.lifted ? 'the rope is taking the whole weight — the block is off the floor'
      : st.b.done ? 'it has reached the end of the floor'
      : st.b.v === 0 && q.along <= q.fric
        ? 'the pull along the motion is not beating the friction, so nothing moves and no work is done'
        : st.th >= 89.5 ? 'the pull is at right angles to the motion, so it does no work at all'
        : 'being dragged — the pull is doing work, and the friction is taking it away again',
      AW / 2, AH - 14, { font: `600 12px ${P.font}`,
        color: st.b.v === 0 || q.lifted ? P.accent : P.text, align: 'center' });

    if (st.ann) {
      callout(ctx, ['Turning the rope up costs you some of the',
                    'pull along the motion, but it also lifts',
                    'weight off the floor, so the friction drops.',
                    'Between those two there is a best angle.'],
        24, 20, tie[0], tie[1], { palette: P });
    }
  }

  /* ---------------------------------------------------- the graphs ---- */

  function drawGraph() {
    const ctx = gv.ctx;
    ctx.clearRect(0, 0, GW, GH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW, GH);
    const X0 = 74, X1 = GW - 150, Y0 = 22, Y1 = GH - 48;

    if (st.bench === 'stretch') {
      const p = stretchP();
      const fmax = pullBack(X_MAX, p) * 1.08;
      const TX = x => X0 + x / X_MAX * (X1 - X0);
      const TY = f => Y1 - f / fmax * (Y1 - Y0);

      ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
      ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let c = 8; c <= 32; c += 8) {
        const gx = TX(c / 100);
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(gx, Y0); ctx.lineTo(gx, Y1); ctx.stroke();
        ctx.fillText(`${c}`, gx, Y1 + 5);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fmax.toPrecision(2), X0 - 5, Y0 + 6);
      ctx.fillText('0', X0 - 5, Y1);
      ctx.fillStyle = P.text; ctx.font = P.sym(12);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('extension (cm)', (X0 + X1) / 2, Y1 + 32);
      ctx.save(); ctx.translate(18, (Y0 + Y1) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText('force (N)', 0, 0); ctx.restore();

      /* the area under the curve so far: this is the work */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(TX(0), TY(0));
      for (let i = 0; i <= 160; i++) {
        const x = st.x * i / 160;
        ctx.lineTo(TX(x), TY(pullBack(x, p)));
      }
      ctx.lineTo(TX(st.x), TY(0)); ctx.closePath();
      ctx.fillStyle = P.accent; ctx.globalAlpha = 0.20; ctx.fill();
      ctx.restore();

      /* the whole curve */
      ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const x = X_MAX * i / 200;
        i ? ctx.lineTo(TX(x), TY(pullBack(x, p))) : ctx.moveTo(TX(x), TY(pullBack(x, p)));
      }
      ctx.stroke();

      /* the chord, whose triangle is the ½Fx answer */
      const F = pullBack(st.x, p);
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(TX(0), TY(0)); ctx.lineTo(TX(st.x), TY(F)); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(TX(st.x), TY(F), 4.6, 0, TAU); ctx.fill();

      ctext(ctx, 'the shaded area is the', X1 + 10, Y0 + 40,
        { font: `600 11px ${P.font}`, color: P.accent });
      ctext(ctx, 'work done so far', X1 + 10, Y0 + 54,
        { font: `600 11px ${P.font}`, color: P.accent });
      ctext(ctx, 'the dashed chord cuts', X1 + 10, Y0 + 86,
        { font: `600 11px ${P.font}`, color: P.muted });
      ctext(ctx, 'off the ½Fx triangle', X1 + 10, Y0 + 100,
        { font: `600 11px ${P.font}`, color: P.muted });
      ctext(ctx, st.mode === 'spring' ? 'here they are the same' : 'here they are not',
        X1 + 10, Y0 + 120, { font: `600 11px ${P.font}`, color: P.text });

    } else {
      const sw = sweepNow();
      const TX = s => X0 + s / S_MAX * (X1 - X0);
      let wmax = 1e-6;
      for (const q of st.trace) wmax = Math.max(wmax, q[1], q[2], q[3]);
      wmax = Math.max(wmax, st.F * Math.cos(st.th * DEG) * S_MAX) * 1.12;
      const TY = w => Y1 - w / wmax * (Y1 - Y0);

      ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
      ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let s = 0.5; s <= S_MAX; s += 0.5) {
        const gx = TX(s);
        ctx.strokeStyle = P.line;
        ctx.beginPath(); ctx.moveTo(gx, Y0); ctx.lineTo(gx, Y1); ctx.stroke();
        ctx.fillText(s.toFixed(1), gx, Y1 + 5);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(wmax.toPrecision(2), X0 - 5, Y0 + 6);
      ctx.fillText('0', X0 - 5, Y1);
      ctx.fillStyle = P.text; ctx.font = P.sym(12);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('distance moved (m)', (X0 + X1) / 2, Y1 + 32);
      ctx.save(); ctx.translate(18, (Y0 + Y1) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText('energy (J)', 0, 0); ctx.restore();

      const trace = (idx, col, w, dash) => {
        if (st.trace.length < 2) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(X0, Y0, X1 - X0, Y1 - Y0); ctx.clip();
        ctx.strokeStyle = col; ctx.lineWidth = w;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        st.trace.forEach((q, i) => (i ? ctx.lineTo(TX(q[0]), TY(q[idx]))
                                      : ctx.moveTo(TX(q[0]), TY(q[idx]))));
        ctx.stroke(); ctx.restore();
      };
      trace(1, P.accent, 2.8);
      trace(2, P.text, 1.8, [6, 5]);
      trace(3, P.muted, 2);

      ctext(ctx, 'done by the pull', X1 + 10, Y0 + 40,
        { font: `600 11px ${P.font}`, color: P.accent });
      ctext(ctx, 'against friction', X1 + 10, Y0 + 62,
        { font: `600 11px ${P.font}`, color: P.text });
      ctext(ctx, 'kinetic energy', X1 + 10, Y0 + 84,
        { font: `600 11px ${P.font}`, color: P.muted });
      ctext(ctx, 'the first is the sum of', X1 + 10, Y0 + 108,
        { font: `500 10.5px ${P.font}`, color: P.muted });
      ctext(ctx, 'the other two, always', X1 + 10, Y0 + 121,
        { font: `500 10.5px ${P.font}`, color: P.muted });

      /* what every angle would cost, as an inset: the pull it needs, and the
       * work that pull ends up doing */
      const ix0 = X1 + 10, iw = GW - ix0 - 14, iy0 = Y0 + 168, ih = 76;
      const curve = (pts, col, w, dash) => {
        let lo = Infinity, hi = 0;
        for (const q of pts) if (isFinite(q[1])) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }

        ctx.save();
        ctx.beginPath(); ctx.rect(ix0, iy0, iw, ih); ctx.clip();
        ctx.strokeStyle = col; ctx.lineWidth = w;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        pts.forEach((q, i) => {
          const x = ix0 + q[0] / 90 * iw;
          const y = iy0 + ih - clamp((q[1] - lo) / Math.max(hi - lo, 1e-9), 0, 1) * (ih - 8) - 4;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke(); ctx.restore();
      };
      ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.strokeRect(ix0, iy0, iw, ih);
      curve(sw.work, P.muted, 1.6, [4, 4]);
      curve(sw.pull, P.accent, 2.2);
      const bx2 = ix0 + sw.best.angle / 90 * iw;
      ctx.save();
      ctx.strokeStyle = P.text; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(bx2, iy0); ctx.lineTo(bx2, iy0 + ih); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.55; ctx.fillStyle = P.accent;
      const mx = ix0 + st.th / 90 * iw;
      ctx.fillRect(mx - 1, iy0, 2, ih);
      ctx.restore();
      ctext(ctx, 'over every rope angle', ix0, iy0 - 20,
        { font: `600 10.5px ${P.font}`, color: P.muted });
      ctext(ctx, 'pull needed ——   work · · ·', ix0, iy0 - 7,
        { font: `500 9.5px ${P.font}`, color: P.muted });
      ctext(ctx, `least pull at ${fmt(sw.best.angle, 1)}°`, ix0, iy0 + ih + 14,
        { font: `600 10.5px ${P.font}`, color: P.text });
      ctext(ctx, '0°', ix0 + 2, iy0 + ih + 27,
        { font: `500 9.5px ${P.font}`, color: P.muted });
      ctext(ctx, '90°', ix0 + iw - 2, iy0 + ih + 27,
        { font: `500 9.5px ${P.font}`, color: P.muted, align: 'right' });
    }
  }

  /* ================================================================== *
   * readouts
   * ================================================================== */

  function renderReads() {
    if (st.bench === 'stretch') {
      const p = stretchP();
      const F = pullBack(st.x, p);
      const area = areaUnder(st.x, p);
      const tri = 0.5 * F * st.x;
      const half = areaUnder(st.x / 2, p);
      outS.setAll({
        x: `${fmt(st.x * 100, 1)} cm`,
        F: `${fmt(F, 2)} N`,
        W: `${fmt(st.w, 4)} J`,
        A: `${fmt(area, 4)} J`,
        tri: `${fmt(tri, 4)} J`,
        err: st.x < 1e-4 ? '—'
          : Math.abs(tri - area) / Math.max(area, 1e-9) < 1e-3
            ? 'yes, exactly — the graph is a straight line'
            : `no, it is out by ${fmt((tri - area) / area * 100, 1)} %`,
        half: `${fmt(half, 4)} J`,
        rest: `${fmt(area - half, 4)} J` +
              (area > 1e-9 ? `  (${fmt((area - half) / area * 100, 0)} % of the total)` : ''),
        back: `${fmt(area, 4)} J`,
        k: st.x < 1e-4 ? '—' : `${fmt(F / st.x, 1)} N m⁻¹`,
      });
    } else {
      const p = pullP(), q = floorForces(p), sw = sweepNow();
      const ke = 0.5 * st.m * st.b.v * st.b.v;
      const books = st.b.wPull - st.b.wFric - ke;
      outP.setAll({
        th: `${fmt(st.th, 0)}°`,
        comp: `${fmt(q.along, 2)} N  (cos θ = ${fmt(Math.cos(st.th * DEG), 3)})`,
        lift: `${fmt(q.lift, 2)} N`,
        N: `${fmt(q.N, 2)} N`,
        f: `${fmt(q.fric, 2)} N`,
        s: `${fmt(st.b.s, 3)} m`,
        wp: `${fmt(st.b.wPull, 3)} J`,
        wf: `${fmt(st.b.wFric, 3)} J`,
        ke: `${fmt(ke, 3)} J`,
        books: st.b.s < 1e-6 ? '—'
          : `out by ${fmt(Math.abs(books) / Math.max(st.b.wPull, 1e-9) * 100, 4)} %`,
        best: `${fmt(sw.best.angle, 2)}°, needing ${fmt(sw.best.pull, 2)} N`,
        tan: `${fmt(Math.tan(sw.best.angle * DEG), 4)}  against μ = ${fmt(st.mu, 2)}`,
        cost: `${fmt(workToDrag(st.th, p, S_MAX), 2)} J / ` +
              `${fmt(workToDrag(0, p, S_MAX), 2)} J`,
      });
    }
  }

  function render() {
    if (st.bench === 'stretch') drawStretch(); else drawPull();
    drawGraph();
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

  resetStretch(); resetPull();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _bench: b => setBench(b),
    _set: q => {
      Object.assign(st, q);
      if (q.k != null) sK.set(st.k);
      if (q.xc != null) sXc.set(st.xc);
      if (q.F != null) sF.set(st.F);
      if (q.th != null) sTh.set(st.th);
      if (q.mu != null) sMu.set(st.mu);
      if (q.m != null) sM.set(st.m);
      sweep = null;
      resetStretch(); resetPull();
      render();
    },
    _state: () => ({ bench: st.bench, x: st.x, w: st.w, block: { ...st.b } }),

    /* stretching */
    _force: (x, p) => pullBack(x, p ?? stretchP()),
    /** pull the hand out in n steps, adding up F·dx as it goes */
    _stretchTo: (x, p, n = 4000) => {
      const q = p ?? stretchP();
      let w = 0;
      for (let i = 0; i < n; i++) w += workStep(x * i / n, x * (i + 1) / n, q);
      return w;
    },
    /** out to a and then back in to b, so the sign of the work can be checked */
    _outAndBack: (a, b, p, n = 4000) => {
      const q = p ?? stretchP();
      let w = 0;
      for (let i = 0; i < n; i++) w += workStep(a * i / n, a * (i + 1) / n, q);
      for (let i = 0; i < n; i++) {
        w += workStep(a + (b - a) * i / n, a + (b - a) * (i + 1) / n, q);
      }
      return w;
    },
    _area: (x, p, n) => areaUnder(x, p ?? stretchP(), n ?? 400),

    /* pulling */
    _floorForces: p => floorForces(p ?? pullP()),
    _pullRun: (p, seconds, h) => {
      const s = { s: 0, v: 0, t: 0, wPull: 0, wFric: 0, done: false };
      const n = Math.round(seconds / h);
      for (let i = 0; i < n; i++) pullStep(s, p, h);
      return { ...s, ke: 0.5 * p.m * s.v * s.v };
    },
    _steadyPull: (th, p) => steadyPull(th, p ?? pullP()),
    _workToDrag: (th, p, s) => workToDrag(th, p ?? pullP(), s ?? S_MAX),
    _easiestAngle: p => easiestAngle(p ?? pullP()),
    _sweep: () => sweepNow(),
  };
}
