/* ============================================================================
 * A2-1  Collisions, in One Dimension and Two
 * IB Physics A.2 Forces and momentum
 *
 * Two bodies meet. Everybody is taught what comes out — momentum conserved,
 * kinetic energy conserved if the collision is elastic, equal masses parting
 * at a right angle. Almost nobody is shown WHY, because the usual treatment
 * skips the collision itself: the bodies go in with one pair of velocities
 * and come out with another, and the moment in between is a black box with a
 * formula written on the lid.
 *
 * This file opens the lid. There is no collision formula in it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED, AND WHAT IS NOT
 *
 * This file does not contain m₁u₁ + m₂u₂ = m₁v₁ + m₂v₂. It does not contain
 * v₁ = ((m₁ − m₂)u₁ + 2m₂u₂)/(m₁ + m₂), or the coefficient of restitution, or
 * "equal masses separate at 90°", or ½mv² anywhere except as a thing to
 * measure. None of the results of this topic are written down in it.
 *
 * What it contains is the contact. The two bodies are springy. While they are
 * touching they push each other apart with a force that grows as they squash,
 * and a second force that resists the squashing changing — that is what makes
 * a collision inelastic, and a ball that does not bounce back is one whose
 * contact ate the energy. The force on the first body is applied to the
 * second, backwards. That is Newton's third law, and it is the only thing
 * this file is told:
 *
 *     F = kδ − cδ̇      while the two overlap by δ
 *     F₁ = +F n̂,  F₂ = −F n̂        equal, opposite, along the line of centres
 *     a = F/m                      integrated, symplectically
 *
 * Everything else is measured while it happens. The momentum is added up
 * every step and drawn. The impulse is the area under the force curve, taken
 * by the trapezium rule over the contact the panel has just drawn. The
 * coefficient of restitution is the speed they part at over the speed they
 * met at. Nothing is arranged: momentum comes out conserved because the two
 * forces are equal and opposite, which is the whole of the reason it ever is.
 *
 * WHAT THE PICTURE IS FOR, AND THE ONE LIE IN IT
 *
 * Real steel balls squash by a few microns and are in contact for a fraction
 * of a millisecond. These are soft enough to see squash, and the contact
 * lasts tens of milliseconds, because a collision you cannot see is a
 * collision you cannot learn anything from. Every number on the panel is the
 * number for THESE balls, and they are consistent with each other; what is
 * exaggerated is only the softness, and the panel says so.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, sci, clamp, surface, palette, ctext, carrow, croundRect,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;
const HT = 340, HT_SM = 320;      // the table
const HG = 392, HG_SM = 430;      // the instruments
const NARROW = 760;

const TABLE_W = 5.0, TABLE_H = 1.4;   // metres
const K_CONTACT = 6000;               // N m⁻¹, how stiff the bodies are
const DT = 1e-5;                      // s per step
const HIST = 560;                     // frames of history kept

const M_LO = 0.1, M_HI = 6;
const V_LO = -5, V_HI = 5;
const B_LO = 0, B_HI = 1;             // impact parameter, as a fraction of 2r
const Z_LO = 0, Z_HI = 1;             // how much the contact absorbs
const E_LO = 0.2, E_HI = 12;          // J, the charge in an explosion

const MODES = {
  line:      { name: 'along a line' },
  glancing:  { name: 'a glancing blow' },
  explosion: { name: 'an explosion' },
};

/* ========================================================================= *
 * THE MODEL
 * ========================================================================= */

/** the radius of a body, if they are all made of the same stuff */
export const radiusOf = m => 0.15 * Math.cbrt(m);

/**
 * The contact force between two bodies, and nothing else.
 *
 * While they overlap, a spring pushes them apart and a dashpot resists the
 * squashing changing. The total is never allowed to pull: bodies that are
 * merely touching do not stick, so the force is clamped at zero, which is
 * also what stops the dashpot from dragging them back together as they part.
 *
 * @returns { fx, fy, F, delta } the force ON BODY 1. Body 2 gets minus it,
 *          which is the only place Newton's third law enters this file.
 */
export function contact(a, b, c) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const sum = a.r + b.r;
  if (!(d > 0) || d >= sum) return { fx: 0, fy: 0, F: 0, delta: 0 };
  const nx = dx / d, ny = dy / d;                 // from 1 towards 2
  const delta = sum - d;                          // how far they have squashed
  /* how fast the squashing is growing */
  const squashRate = -((b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
  /* the spring pushes them apart; the dashpot resists the squashing
   * changing, so it adds to the push going in and takes from it coming out.
   * The total is never allowed to pull: two bodies in contact do not stick. */
  const F = Math.max(0, K_CONTACT * delta + c * squashRate);
  return { fx: -F * nx, fy: -F * ny, F, delta };
}

/** one velocity-Verlet step of the pair, under their contact force alone */
export function step(S, dt) {
  const [a, b] = S.bodies;
  const f0 = contact(a, b, S.c);
  const ax0 = f0.fx / a.m, ay0 = f0.fy / a.m;
  const bx0 = -f0.fx / b.m, by0 = -f0.fy / b.m;

  a.x += a.vx * dt + 0.5 * ax0 * dt * dt;
  a.y += a.vy * dt + 0.5 * ay0 * dt * dt;
  b.x += b.vx * dt + 0.5 * bx0 * dt * dt;
  b.y += b.vy * dt + 0.5 * by0 * dt * dt;

  const f1 = contact(a, b, S.c);
  a.vx += 0.5 * (ax0 + f1.fx / a.m) * dt;
  a.vy += 0.5 * (ay0 + f1.fy / a.m) * dt;
  b.vx += 0.5 * (bx0 - f1.fx / b.m) * dt;
  b.vy += 0.5 * (by0 - f1.fy / b.m) * dt;

  S.t += dt;
  S.F = f1.F; S.delta = f1.delta;
  return f1;
}

export const momentum = S => {
  let px = 0, py = 0;
  for (const q of S.bodies) { px += q.m * q.vx; py += q.m * q.vy; }
  return { px, py, mag: Math.hypot(px, py) };
};
export const energy = S => {
  let e = 0;
  for (const q of S.bodies) e += 0.5 * q.m * (q.vx * q.vx + q.vy * q.vy);
  return e;
};

/** the damping that a given "how bouncy" setting asks for. This is a dial
 *  calibration, not a physical claim: what the collision actually gives back
 *  is measured afterwards from the speeds, and reported separately. */
export const dampingFor = (zeta, m1, m2) =>
  2 * zeta * Math.sqrt(K_CONTACT * (m1 * m2) / (m1 + m2));

/* ========================================================================= */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a2-collisions',
    title: 'Collisions in one dimension and two',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    mode: 'line',
    m1: 1.0, m2: 1.0,
    u1: 2.0, u2: -1.0,
    zeta: 0,          // how much the contact absorbs
    b: 0.45,          // impact parameter, as a fraction of the touching distance
    charge: 4.0,      // J, for an explosion
    rate: 1 / 3,      // how much of a second goes by in a second
    playing: true,
    loop: true,
    done: false, idle: 0,
    /* an explosion is one object until it is set off: the two halves are
     * already there with the spring squashed between them, but they are held
     * and they are drawn as one */
    armed: false, fuse: 0, burst: 0,
    hist: [],         // { px, py, E }
    trail: [[], []],
    contact: null,    // the force–time record of the last contact
    live: null,       // the contact being recorded right now
    before: null, after: null,
  };

  let S = null;

  function reset() {
    const r1 = radiusOf(st.m1), r2 = radiusOf(st.m2);
    let A, B;
    if (st.mode === 'explosion') {
      /* the charge is a squashed spring: all of its energy is in the
       * squashing, and the only thing that gets it out is the contact */
      const d0 = Math.sqrt(2 * st.charge / K_CONTACT);
      const gap = Math.max(0.002, r1 + r2 - d0);
      A = { m: st.m1, r: r1, x: -gap / 2, y: 0, vx: 0, vy: 0 };
      B = { m: st.m2, r: r2, x: gap / 2, y: 0, vx: 0, vy: 0 };
      st.armed = true; st.fuse = 0; st.burst = 0;
    } else {
      const off = st.mode === 'glancing' ? st.b * (r1 + r2) : 0;
      A = { m: st.m1, r: r1, x: -1.5, y: -off / 2, vx: st.u1, vy: 0 };
      B = { m: st.m2, r: r2, x: 1.5, y: off / 2, vx: st.u2, vy: 0 };
      st.armed = false; st.fuse = 0; st.burst = 0;
    }
    S = { bodies: [A, B], c: dampingFor(st.zeta, st.m1, st.m2), t: 0, F: 0, delta: 0 };
    st.hist = []; st.trail = [[], []];
    st.contact = null; st.live = null; st.done = false; st.idle = 0;
    st.before = snapshot(); st.after = null;
  }

  const snapshot = () => ({
    v: S.bodies.map(q => ({ vx: q.vx, vy: q.vy, sp: Math.hypot(q.vx, q.vy) })),
    p: momentum(S), E: energy(S),
  });

  /* ------------------------------------------------------------ controls */

  const sM1 = slider({ label: '<i>m</i>₁', min: M_LO, max: M_HI, step: 0.05, value: st.m1,
    format: v => `${fmt(v, 2)} kg`, onInput: v => { st.m1 = v; reset(); render(); } });
  const sM2 = slider({ label: '<i>m</i>₂', min: M_LO, max: M_HI, step: 0.05, value: st.m2,
    format: v => `${fmt(v, 2)} kg`, onInput: v => { st.m2 = v; reset(); render(); } });
  const sU1 = slider({ label: '<i>u</i>₁', min: V_LO, max: V_HI, step: 0.05, value: st.u1,
    format: v => `${fmt(v, 2)} m s⁻¹`, onInput: v => { st.u1 = v; reset(); render(); } });
  const sU2 = slider({ label: '<i>u</i>₂', min: V_LO, max: V_HI, step: 0.05, value: st.u2,
    format: v => `${fmt(v, 2)} m s⁻¹`, onInput: v => { st.u2 = v; reset(); render(); } });
  const sZ = slider({ label: 'contact', min: Z_LO, max: Z_HI, step: 0.01, value: st.zeta,
    format: v => v === 0 ? 'springy — gives everything back'
                         : `absorbs ${fmt(v * 100, 0)}% as much as it springs`,
    onInput: v => { st.zeta = v; reset(); render(); } });
  const sB = slider({ label: '<i>b</i>', min: B_LO, max: B_HI, step: 0.01, value: st.b,
    format: v => `${fmt(v, 2)} of a full miss — ${fmt(v * (radiusOf(st.m1) + radiusOf(st.m2)) * 100, 1)} cm off centre`,
    onInput: v => { st.b = v; reset(); render(); } });
  const sC = slider({ label: 'charge', min: E_LO, max: E_HI, step: 0.1, value: st.charge,
    format: v => `${fmt(v, 1)} J stored in the spring`,
    onInput: v => { st.charge = v; reset(); render(); } });

  const bMode = Object.keys(MODES).map(k => button({
    label: MODES[k].name, pressed: k === st.mode, onClick: () => setMode(k),
  }));
  function setMode(k) {
    st.mode = k;
    bMode.forEach((b, i) => b.setPressed(Object.keys(MODES)[i] === k));
    sU1.node.hidden = k === 'explosion';
    sU2.node.hidden = k === 'explosion';
    sB.node.hidden = k !== 'glancing';
    sC.node.hidden = k !== 'explosion';
    bFire.node.hidden = k !== 'explosion';
    bSwap.node.hidden = k === 'explosion';
    reset(); render();
  }

  const RATES = { 1: 'real time', 0.3333333: 'a third of real time',
                  0.05: 'one twentieth' };
  const bRate = Object.keys(RATES).map(k => button({
    label: RATES[k], pressed: Math.abs(+k - st.rate) < 1e-6,
    onClick: () => { st.rate = +k;
      bRate.forEach((b, i) => b.setPressed(Object.keys(RATES)[i] === k)); },
  }));
  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAgain = button({ label: 'Run it again', onClick: () => { reset(); render(); } });
  const bLoop = button({ label: 'Repeat', pressed: true, onClick: b => {
    st.loop = !st.loop; b.setAttribute('aria-pressed', String(st.loop));
  } });
  const bSwap = button({ label: 'Make the masses equal', onClick: () => {
    st.m2 = st.m1; sM2.set(st.m2); reset(); render();
  } });
  const bFire = button({ label: 'Set it off', onClick: () => { fire(); render(); } });
  function fire() { if (st.armed) { st.armed = false; st.burst = 1; } }

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'before', label: 'Going in' },
    { key: 'after',  label: 'Coming out' },
    { key: 'mom',    label: 'Momentum: added up every step, and never told to stay put' },
    { key: 'energy', label: 'Kinetic energy: the one that is allowed to change' },
    { key: 'imp',    label: 'Impulse: the area under the force curve, and the change in momentum' },
    { key: 'cont',   label: 'The contact itself' },
    { key: 'rest',   label: 'How much of the approach speed came back' },
    { key: 'angle',  label: 'The angle they part at' },
  ]);

  /* ------------------------------------------------------------- canvas */

  const tv = surface(MW, HT, { label: 'the table, seen from above' });
  const gv = surface(MW, HG, { label: 'momentum, energy and the contact force' });

  /* ------------------------------------------------------------- layout */

  root.append(
    heading('Collisions in One Dimension and Two',
            'no collision formula anywhere — the two bodies are springy, they push '
            + 'each other apart while they touch, and everything else is measured '
            + 'while it happens'),
    controls([el('div', { class: 'ibs-btns' }, bMode.map(b => b.node))],
             { label: 'the collision:' }),
    panelBox('The table, from above — the arrows are momentum, not velocity', tv.el),
    panelBox('What the instruments say', gv.el),
    controls([el('div', { class: 'ibs-btns' }, bRate.map(b => b.node))],
             { label: 'run it at:' }),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bAgain.node, bLoop.node, bSwap.node, bFire.node])]),
    controls([sM1.node, sM2.node, sU1.node, sU2.node, sB.node, sC.node, sZ.node]),
    out.node,
    note('<b>Momentum is conserved because forces come in pairs.</b> That is the whole '
      + 'reason, and it is the one thing this panel is built out of. While the two '
      + 'bodies are touching, each pushes the other — the same size, the opposite way, '
      + 'along the line joining their centres. Nothing else is put in. The momentum is '
      + 'then added up every step and drawn, and it does not move: not during the '
      + 'approach, not at the peak of the squash, not afterwards. <b>Impulse is the '
      + 'area under that force.</b> The bottom panel is the contact itself, a few tens '
      + 'of milliseconds wide, with the force on each body drawn above and below the '
      + 'line. The two areas are equal and opposite, and each one equals the change in '
      + 'that body’s momentum, which is what <i>F</i>Δ<i>t</i> = Δ<i>p</i> means. '
      + '<b>Energy is the one that is allowed to go.</b> Set the contact to springy and '
      + 'the kinetic energy is the same coming out as going in — try equal masses head '
      + 'on and watch them simply swap velocities, which nobody told them to do. Turn '
      + 'the contact up and it absorbs: the bodies come apart slowly, or barely at all, '
      + 'and the energy that has gone went into the squashing. Momentum does not '
      + 'notice. <b>Two dimensions.</b> Slide the second ball off centre and the push is '
      + 'still along the line of centres, so that is the direction the momentum is '
      + 'traded in. With equal masses and a springy contact the two come away at a '
      + 'right angle, every time, whatever the offset — a result worth checking against '
      + 'the angle the panel measures. <b>And an explosion</b> is a collision run '
      + 'backwards: two bodies at rest with a squashed spring between them. They start '
      + 'with no momentum and they must end with none, so they go opposite ways with '
      + 'the lighter one faster, in exactly the ratio of the masses.'));

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  /* the table is as wide as the panel lets it be, and the panel is then as
   * tall as the table needs — a fixed height would leave a phone with a strip
   * of table above a field of nothing */
  function tableGeom(W) {
    const sm = W < NARROW, pad = sm ? 12 : 22;
    const s = (W - 2 * pad) / TABLE_W;
    const top = sm ? 24 : 30, bottom = sm ? 46 : 54;
    return { W, sm, s, cx: W / 2, cy: top + TABLE_H * s / 2,
             w: TABLE_W * s, h: TABLE_H * s,
             H: Math.round(top + TABLE_H * s + bottom) };
  }
  const GT = () => tableGeom(tv.w);
  const GG = () => {
    const W = gv.w, sm = W < NARROW, H = sm ? HG_SM : HG;
    return { W, H, sm, x0: sm ? 112 : 272, x1: W - (sm ? 14 : 30),
             y0: 22, y1: H - 26 };
  };

  const X = (g, x) => g.cx + x * g.s;
  const Y = (g, y) => g.cy - y * g.s;

  function metreRule(ctx, g, L, Bm) {
    const x0 = L + 10, y0 = Bm + (g.sm ? 16 : 20);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0 + 4);
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + g.s, y0);
    ctx.moveTo(x0 + g.s, y0 - 4); ctx.lineTo(x0 + g.s, y0 + 4);
    ctx.stroke();
    ctext(ctx, '1 metre', x0 + g.s + 8, y0 + 4,
          { font: `600 11.5px ${P.font}`, color: P.text });
  }

  function drawTable() {
    const g = GT(), ctx = tv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    const L = g.cx - g.w / 2, R = g.cx + g.w / 2;
    const T = g.cy - g.h / 2, Bm = g.cy + g.h / 2;

    /* the table */
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(L + 0.5, T + 0.5, g.w - 1, g.h - 1);
    if (st.mode === 'line') {
      ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = P.frame;
      ctx.beginPath(); ctx.moveTo(L, g.cy); ctx.lineTo(R, g.cy); ctx.stroke();
      ctx.restore();
    }

    /* where they have been */
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.28; ctx.lineWidth = 1.6;
    for (const tr of st.trail) {
      if (tr.length < 2) continue;
      ctx.beginPath();
      tr.forEach((q, i) => i ? ctx.lineTo(X(g, q[0]), Y(g, q[1]))
                             : ctx.moveTo(X(g, q[0]), Y(g, q[1])));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* while the charge is armed the two halves are drawn as the one object
     * they are, sitting on the middle of the table with a fuse lit */
    if (st.armed) {
      const M = st.m1 + st.m2, R = radiusOf(M) * g.s;
      const cxp = X(g, 0), cyp = Y(g, 0);
      ctx.fillStyle = P.soft; ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(cxp, cyp, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctext(ctx, `${fmt(M, 2)} kg`, cxp, cyp - R - 8,
            { font: `700 ${g.sm ? 10 : 12}px ${P.font}`, color: P.text,
              align: 'center', halo: P.bg, haloWidth: 4 });
      /* the fuse: a short curl with a spark that keeps time with the count */
      const burn = (st.fuse % 0.28) / 0.28;
      ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cxp + R * 0.7, cyp - R * 0.7);
      ctx.quadraticCurveTo(cxp + R * 1.5, cyp - R * 1.7,
                           cxp + R * 1.1, cyp - R * 2.2);
      ctx.stroke();
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(cxp + R * 1.1, cyp - R * 2.2, 3 + 2.5 * (1 - burn), 0, TAU);
      ctx.fill();
      ctext(ctx, `${fmt(st.charge, 1)} J of spring, squashed and held`,
            cxp, cyp + R + 18,
            { font: `600 12px ${P.font}`, color: P.accent, align: 'center' });
      metreRule(ctx, g, L, Bm);
      return;
    }

    /* the flash, for the moment after it goes */
    if (st.burst > 0) {
      const cxp = X(g, 0), cyp = Y(g, 0);
      const R0 = radiusOf(st.m1 + st.m2) * g.s;
      const grow = 1 - st.burst;
      ctx.save();
      ctx.globalAlpha = st.burst * 0.85;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2 + 4 * st.burst;
      ctx.beginPath();
      ctx.arc(cxp, cyp, R0 * (1 + 3.4 * grow), 0, TAU); ctx.stroke();
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 10; i++) {
        const th = TAU * i / 10 + 0.3;
        const r1p = R0 * (0.9 + 2.0 * grow), r2p = r1p + R0 * (0.5 + grow);
        ctx.beginPath();
        ctx.moveTo(cxp + r1p * Math.cos(th), cyp + r1p * Math.sin(th));
        ctx.lineTo(cxp + r2p * Math.cos(th), cyp + r2p * Math.sin(th));
        ctx.stroke();
      }
      ctx.restore();
    }

    /* the bodies, flattened against each other where they touch */
    const [a, b] = S.bodies;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const touching = d < a.r + b.r;
    /* the contact plane sits where the two surfaces meet */
    const cut = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
    S.bodies.forEach((q, i) => {
      const cxp = X(g, q.x), cyp = Y(g, q.y);
      ctx.save();
      if (touching) {
        /* A squashed ball is flat where it meets the other one, not buried
         * in it. Each is drawn clipped to its own side of the plane where
         * the two surfaces meet, so what you see is a contact patch. */
        const px = X(g, a.x + nx * cut), py = Y(g, a.y + ny * cut);
        const ux = nx * (i === 0 ? -1 : 1), uy = -ny * (i === 0 ? -1 : 1);
        const wx = -uy, wy = ux, big = g.s * 6;
        ctx.beginPath();
        ctx.moveTo(px + wx * big, py + wy * big);
        ctx.lineTo(px - wx * big, py - wy * big);
        ctx.lineTo(px - wx * big + ux * big, py - wy * big + uy * big);
        ctx.lineTo(px + wx * big + ux * big, py + wy * big + uy * big);
        ctx.closePath(); ctx.clip();
      }
      ctx.fillStyle = i === 0 ? P.soft : P.bg;
      ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(cxp, cyp, q.r * g.s, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      ctext(ctx, `${fmt(q.m, 2)} kg`, cxp, cyp - q.r * g.s - 8,
            { font: `700 ${g.sm ? 10 : 12}px ${P.font}`, color: P.text,
              align: 'center', halo: P.bg, haloWidth: 4 });
    });

    /* momentum, drawn to one scale for both so they can be compared */
    const pMax = Math.max(1e-9, ...S.bodies.map(q => q.m * Math.hypot(q.vx, q.vy)),
                          Math.abs(st.before ? st.before.p.mag : 0));
    for (const q of S.bodies) {
      const px = q.m * q.vx, py = q.m * q.vy, mag = Math.hypot(px, py);
      if (mag < 1e-6) continue;
      const len = (mag / pMax) * (g.sm ? 62 : 96);
      carrow(ctx, X(g, q.x), Y(g, q.y),
             X(g, q.x) + len * px / mag, Y(g, q.y) - len * py / mag,
             { color: P.accent, width: 3, head: 11 });
    }

    /* the contact force, while there is one */
    if (S.F > 0) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctext(ctx, `they are pushing each other apart with ${fmt(S.F, 0)} N`,
            X(g, mid.x), Y(g, mid.y) - Math.max(a.r, b.r) * g.s - 14,
            { font: `700 12px ${P.font}`, color: P.accent, align: 'center',
              halo: P.bg, haloWidth: 5 });
    }

    metreRule(ctx, g, L, Bm);
    ctext(ctx, g.sm ? 'softer than real balls, so the contact can be seen'
                    : 'the balls are far softer than real ones, so that the squash and '
                      + 'the contact can be seen — everything else is to scale',
          g.W - 8, g.H - 8,
          { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });
    if (st.done && !st.loop) {
      ctext(ctx, 'press “run it again”', g.cx, T + 20,
            { font: `700 13px ${P.font}`, color: P.accent, align: 'center' });
    }
  }

  /* ------------------------------------------------- what the instruments say
   *
   * Three rows, all of them on at all times. The top two are the running
   * totals, drawn from the moment the run began: momentum, which never moves,
   * and kinetic energy, which is allowed to. The third is the contact itself,
   * blown up to its own millisecond scale, because the whole event lasts less
   * than a twentieth of a second and nothing can be seen of it otherwise.
   */
  /* Every word in the left-hand column goes through here. It measures the
   * string, shrinks the type a little if that is enough, wraps it if it is
   * not, and gives up with an ellipsis rather than running across the
   * drawing beside it. Each line it draws is recorded, and the verifier
   * checks that none of them touches any of the boxes. */
  let TEXTS = [], BOXES = [];

  function colText(ctx, str, x, y, maxW, size, weight, color, maxLines = 2) {
    /* a touch smaller is fine; much smaller is unreadable, so past that
     * point the line is wrapped instead */
    let px = size;
    ctx.font = `${weight} ${px}px ${P.font}`;
    while (px > size - 1.5 && ctx.measureText(str).width > maxW) {
      px -= 0.5;
      ctx.font = `${weight} ${px}px ${P.font}`;
    }
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      if (ctx.measureText(trial).width <= maxW || !cur) cur = trial;
      else { lines.push(cur); cur = w; }
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines) lines.push(cur);
    while (lines.length > maxLines) lines.pop();
    /* if even the last line is too wide, cut it rather than let it run out */
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
      TEXTS.push({ str: ln, x, y: yy - px * 0.8, w: ctx.measureText(ln).width,
                   h: px * 1.05 });
    });
    return lines.length * (px + 3);
  }

  function drawGraph() {
    const g = GG(), ctx = gv.ctx;
    ctx.clearRect(0, 0, g.W, g.H);
    TEXTS = []; BOXES = [];
    const rows = 3;
    const H = (g.y1 - g.y0) / rows;
    const twoD = st.mode !== 'line';

    /* ---- row 1: momentum */
    {
      const y0 = g.y0, y1 = y0 + H - 12;
      const pxs = st.hist.map(q => q.px), pys = st.hist.map(q => q.py);
      const now = momentum(S);
      let top = Math.max(0.4, ...pxs.map(Math.abs), ...pys.map(Math.abs),
                         Math.abs(now.px), Math.abs(now.py)) * 1.3;
      top = roundUp(top);
      strip(ctx, g, y0, y1, 'Total momentum',
            g.sm ? kgms(now.px)
                 : kgms(now.px)
                   + (twoD ? neg(`  across: ${fmt(now.py, 3)}`) : ''),
            twoD ? (g.sm ? neg(`across the table: ${fmt(now.py, 3)}`)
                         : 'the two components, added over both bodies')
                 : 'added over both bodies, every step',
            [{ vals: pxs, now: now.px, dash: null },
             ...(twoD ? [{ vals: pys, now: now.py, dash: [6, 5] }] : [])],
            -top, top, v => neg(fmt(v, 2)));
    }

    /* ---- row 2: kinetic energy */
    {
      const y0 = g.y0 + H, y1 = y0 + H - 12;
      const es = st.hist.map(q => q.E);
      const now = energy(S);
      const top = roundUp(Math.max(0.5, ...es, now) * 1.25);
      strip(ctx, g, y0, y1, 'Total kinetic energy', `${fmt(now, 3)} J`,
            st.zeta === 0
              ? 'the dip is the moment of contact, with the energy in the squashing'
              : 'the dip is the contact; what does not come back out is gone for good',
            [{ vals: es, now, dash: null }], 0, top, v => fmt(v, 2));
    }

    /* ---- row 3: the contact, millisecond by millisecond */
    {
      const y0 = g.y0 + 2 * H, y1 = g.y1;
      drawContact(ctx, g, y0, y1);
    }
  }

  function roundUp(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  /** one labelled strip with one or more traces, drawn against a fixed scale */
  function strip(ctx, g, y0, y1, title, value, why, traces, lo, hi, show) {
    const x0 = g.x0, x1 = g.x1;
    const span = Math.max(1.2, st.hist.length ? st.hist[st.hist.length - 1].t : 0) * 1.04;
    const Yv = v => y1 - (v - lo) / (hi - lo) * (y1 - y0);
    /* the axis is the run: it starts when the run does and stretches as the
     * run goes on, so the whole event is always on the strip */
    const Xk = k => x0 + (st.hist.length ? (st.hist[k].t / span) : 0) * (x1 - x0);
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
    BOXES.push({ x0, y0, x1, y1 });
    ctx.save();
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.clip();
    if (lo < 0) {
      ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Yv(0)); ctx.lineTo(x1, Yv(0)); ctx.stroke();
    }
    for (const tr of traces) {
      if (tr.vals.length > 1) {
        ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        if (tr.dash) ctx.setLineDash(tr.dash);
        ctx.beginPath();
        tr.vals.forEach((v, k) => k ? ctx.lineTo(Xk(k), Yv(v))
                                    : ctx.moveTo(Xk(k), Yv(v)));
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = P.accent;
      const xNow = tr.vals.length ? Xk(tr.vals.length - 1) : x0;
      ctx.beginPath(); ctx.arc(xNow, Yv(tr.now), 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctext(ctx, show(hi), x1 - 4, y0 + 12,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, show(lo), x1 - 4, y1 - 4,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, `${fmt(span, 1)} s of the run`, x0 + 6, y1 - 4,
          { font: `500 10px ${P.font}`, color: P.muted });
    const maxW = x0 - 12 - 16;
    colText(ctx, title, 12, y0 + (g.sm ? 14 : 16), maxW, g.sm ? 11.5 : 13,
            600, P.accent, 1);
    colText(ctx, value, 12, y0 + (g.sm ? 33 : 39), maxW, g.sm ? 14 : 18,
            700, P.text, 1);
    if (!g.sm) colText(ctx, why, 12, y0 + 60, maxW, 10.5, 500, P.muted, 3);
  }

  /** the force each body felt, over the milliseconds it lasted */
  function drawContact(ctx, g, y0, y1) {
    const rec = st.live && st.live.s.length > 2 ? st.live : st.contact;
    const x0 = g.x0, x1 = g.x1, maxW = x0 - 12 - 16;
    colText(ctx, 'The contact', 12, y0 + (g.sm ? 14 : 16), maxW,
            g.sm ? 11.5 : 13, 600, P.accent, 1);
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
    BOXES.push({ x0, y0, x1, y1 });
    const mid = (y0 + y1) / 2;
    ctx.strokeStyle = P.frame;
    ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();

    if (!rec) {
      colText(ctx, st.mode === 'explosion' ? 'not set off yet'
                                           : 'they have not met yet',
              12, y0 + (g.sm ? 33 : 39), maxW, g.sm ? 14 : 18, 700, P.text, 1);
      ctext(ctx, 'the force on each body, and the area under it',
            (x0 + x1) / 2, mid + 4,
            { font: `500 12px ${P.font}`, color: P.muted, align: 'center' });
      return;
    }
    const dur = Math.max(rec.s[rec.s.length - 1][0], 1e-4);
    const span = st.live ? Math.max(dur, 0.02) : dur * 1.06;
    const Fmax = Math.max(1, ...rec.s.map(q => q[1])) * 1.18;
    const Xt = t => x0 + (t / span) * (x1 - x0);
    const Yf = f => mid - (f / Fmax) * (mid - y0 - 8);

    ctx.save();
    croundRect(ctx, x0, y0, x1 - x0, y1 - y0, 6); ctx.clip();
    for (const sgn of [1, -1]) {
      ctx.fillStyle = P.soft; ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(Xt(0), mid);
      for (const q of rec.s) ctx.lineTo(Xt(q[0]), mid + sgn * (Yf(q[1]) - mid));
      ctx.lineTo(Xt(rec.s[rec.s.length - 1][0]), mid);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      ctx.beginPath();
      rec.s.forEach((q, i) => {
        const yy = mid + sgn * (Yf(q[1]) - mid);
        i ? ctx.lineTo(Xt(q[0]), yy) : ctx.moveTo(Xt(q[0]), yy);
      });
      ctx.stroke();
    }
    ctx.restore();

    const J = rec.J;
    colText(ctx, g.sm
              ? `${fmt(dur * 1000, 1)} ms, ${fmt(Math.max(...rec.s.map(q => q[1])), 0)} N`
              : `${fmt(dur * 1000, 1)} ms long, peaking at `
                + `${fmt(Math.max(...rec.s.map(q => q[1])), 0)} N`,
            12, y0 + (g.sm ? 33 : 39), maxW, g.sm ? 13 : 16, 700, P.text, 1);
    if (!g.sm) {
      const used = colText(ctx, 'the force on each body — same size, opposite ways',
                           12, y0 + 60, maxW, 10.5, 500, P.muted, 2);
      colText(ctx, `each shaded area is ${fmt(J, 3)} N s`,
              12, y0 + 60 + used + 2, maxW, 10.5, 600, P.accent, 1);
    }
    ctext(ctx, `${fmt(span * 1000, 0)} ms`, x1 - 4, y1 - 5,
          { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, 'on body 1', x0 + 8, y0 + 14,
          { font: `600 10.5px ${P.font}`, color: P.muted });
    ctext(ctx, 'on body 2', x0 + 8, y1 - 8,
          { font: `600 10.5px ${P.font}`, color: P.muted });
  }

  /* --------------------------------------------------------- readouts */

  const neg = s => String(s).replace('-', '−');
  const kgms = v => neg(`${fmt(v, 3)} kg m s⁻¹`);
  const sgn = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 2);

  function fillReadouts() {
    const B = st.before, A = st.after;
    const now = { p: momentum(S), E: energy(S) };
    const v = {};
    v.before = `${fmt(st.m1, 2)} kg at ${sgn(B.v[0].vx)} m s⁻¹ and ${fmt(st.m2, 2)} kg at `
      + `${sgn(B.v[1].vx)} m s⁻¹. Together: ${kgms(B.p.px)} of momentum and `
      + `${fmt(B.E, 3)} J of kinetic energy`;
    v.after = A
      ? `${sgn(A.v[0].vx)} m s⁻¹ and ${sgn(A.v[1].vx)} m s⁻¹`
        + (st.mode !== 'line'
            ? `, with ${sgn(A.v[0].vy)} and ${sgn(A.v[1].vy)} across the table` : '')
        + (st.zeta === 0 && st.mode === 'line'
            ? `.  Nothing in this file worked those out — they are where the pushing `
              + `left them` : '')
      : 'they have not met yet';
    v.mom = `now ${kgms(now.p.px)} along the table`
      + (st.mode !== 'line' ? ` and ${kgms(now.p.py)} across it` : '')
      + `.  Over the whole run it has moved by ${sci(Math.abs(now.p.px - B.p.px), 2)} `
      + `and ${sci(Math.abs(now.p.py - B.p.py), 2)} kg m s⁻¹ — which is the arithmetic, `
      + `not the physics: the two forces are equal and opposite at every single step`;
    v.energy = A
      ? `${fmt(B.E, 4)} J going in, ${fmt(A.E, 4)} J coming out — `
        + (Math.abs(A.E - B.E) / B.E < 2e-4
            ? `the same to four figures, because a contact that only springs gives `
              + `back everything it took`
            : `${fmt(100 * (1 - A.E / B.E), 1)}% of it stayed behind in the squashing`)
      : `${fmt(now.E, 4)} J, and nothing has happened to it yet`;
    v.imp = st.contact
      ? `the area under the force curve is ${fmt(st.contact.J, 4)} N s. Body 1's `
        + `momentum changed by ${fmt(Math.abs(st.m1 * (A.v[0].vx - B.v[0].vx)), 4)} and `
        + `body 2's by ${fmt(Math.abs(st.m2 * (A.v[1].vx - B.v[1].vx)), 4)} kg m s⁻¹ `
        + `along the table` + (st.mode !== 'line' ? ' alone' : '')
        + `.  Same number three times over, and that is all FΔt = Δp says`
      : 'the area under the force curve appears once they have touched';
    v.cont = st.contact
      ? `it lasted ${fmt(st.contact.dur * 1000, 2)} ms, peaked at `
        + `${fmt(st.contact.peak, 0)} N, and at the worst of it the two were squashed `
        + `into each other by ${fmt(st.contact.squash * 100, 2)} cm — `
        + `${fmt(100 * st.contact.squash / (radiusOf(st.m1) + radiusOf(st.m2)), 0)}% of `
        + `the way. Real steel would be a thousand times stiffer and a hundred times quicker`
      : 'nothing yet';
    v.rest = st.contact
      ? `they met at ${fmt(st.contact.approach, 3)} m s⁻¹ and parted at `
        + `${fmt(st.contact.separate, 3)} m s⁻¹ — a ratio of `
        + `${fmt(st.contact.e, 4)}. That number is not set anywhere: the dial sets how `
        + `much the contact absorbs, and this is what came back`
      : 'nothing yet';
    v.angle = st.mode === 'line'
      ? 'switch to a glancing blow or an explosion to see this'
      : A
        ? (() => {
            const a1 = Math.atan2(A.v[0].vy, A.v[0].vx);
            const a2 = Math.atan2(A.v[1].vy, A.v[1].vx);
            let d = Math.abs(a1 - a2) * 180 / Math.PI;
            if (d > 180) d = 360 - d;
            const eq = Math.abs(st.m1 - st.m2) < 1e-9 && st.zeta === 0;
            return `${fmt(d, 3)}°`
              + (eq ? ` — and with equal masses and a contact that gives everything `
                      + `back it is 90°, at every offset you can set` : '')
              + (st.mode === 'explosion'
                  ? `.  They started with no momentum, so they must leave with none: `
                    + `speeds ${fmt(A.v[0].sp, 3)} and ${fmt(A.v[1].sp, 3)} m s⁻¹, in `
                    + `the ratio ${fmt(A.v[1].sp / Math.max(A.v[0].sp, 1e-9), 3)} against `
                    + `masses in the ratio ${fmt(st.m1 / st.m2, 3)}` : '');
          })()
        : 'they have not met yet';
    out.setAll(v);
  }

  const render = () => { drawTable(); drawGraph(); fillReadouts(); };

  /* ---------------------------------------------------------- the drag */

  let drag = null;
  const pscaleOf = () => {
    const pm = Math.max(0.15, ...S.bodies.map(q => q.m * Math.hypot(q.vx, q.vy)));
    return 0.34 / pm;                       // metres of arrow per kg m s⁻¹
  };
  function tipOf(g, q) {
    const px = q.m * q.vx, py = q.m * q.vy, mag = Math.hypot(px, py);
    if (mag < 1e-6) return null;
    return { x: X(g, q.x) + S.pscale * px * g.s,
             y: Y(g, q.y) - S.pscale * py * g.s };
  }
  function pick(pt, g) {
    for (let i = 0; i < 2; i++) {
      const tip = tipOf(g, S.bodies[i]);
      if (tip && Math.hypot(pt.x - tip.x, pt.y - tip.y) < 16) {
        return { what: 'speed', i };
      }
    }
    if (st.mode === 'glancing') {
      const q = S.bodies[1];
      if (Math.hypot(pt.x - X(g, q.x), pt.y - Y(g, q.y)) < q.r * g.s + 6) {
        return { what: 'aim' };
      }
    }
    return null;
  }
  function applyDrag(pt, g) {
    if (drag.what === 'aim') {
      const y = (g.cy - pt.y) / g.s;
      st.b = clamp(2 * y / (radiusOf(st.m1) + radiusOf(st.m2)), B_LO, B_HI);
      sB.set(st.b);
    } else {
      const q = S.bodies[drag.i];
      const p = ((pt.x - X(g, q.x)) / g.s) / S.pscale;
      const vNew = clamp(p / q.m, V_LO, V_HI);
      if (drag.i === 0) { st.u1 = vNew; sU1.set(vNew); }
      else { st.u2 = vNew; sU2.set(vNew); }
    }
    const keep = S.pscale;
    reset();
    S.pscale = keep;                        // so the arrow does not jump mid-drag
    render();
  }
  tv.el.style.touchAction = 'none';
  tv.el.addEventListener('pointerdown', e => {
    const g = GT(), pt = tv.at(e), hit = pick(pt, g);
    if (!hit) return;
    drag = hit;
    try { tv.el.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    applyDrag(pt, g);
  });
  tv.el.addEventListener('pointermove', e => {
    const g = GT(), pt = tv.at(e);
    if (drag) { applyDrag(pt, g); e.preventDefault(); return; }
    tv.el.style.cursor = pick(pt, g) ? 'grab' : 'default';
  });
  const letGo = () => { if (drag) { drag = null; S.pscale = pscaleOf(); render(); } };
  tv.el.addEventListener('pointerup', letGo);
  tv.el.addEventListener('pointercancel', letGo);

  /* -------------------------------------------------------- the animation */

  const SAMPLE_EVERY = 12;                  // steps between force samples
  let sinceSample = 0;

  function advance(steps) {
    const chunk = Math.max(1, Math.round(1 / 60 / DT));
    for (let done = 0; done < steps; done += chunk) {
      stepOn(Math.min(chunk, steps - done));
      const p = momentum(S);
      st.hist.push({ t: S.t, px: p.px, py: p.py, E: energy(S) });
      if (st.hist.length > HIST) {
        /* a long run is thinned rather than cropped, so the whole of it
         * stays on the strip */
        st.hist = st.hist.filter((_, k) => k % 2 === 0);
      }
      S.bodies.forEach((q, i) => {
        const tr = st.trail[i];
        if (!tr.length || Math.hypot(q.x - tr[tr.length - 1][0],
                                     q.y - tr[tr.length - 1][1]) > 0.02) {
          tr.push([q.x, q.y]);
          if (tr.length > 600) tr.shift();
        }
      });
    }
  }

  function stepOn(steps) {
    for (let i = 0; i < steps; i++) {
      const f = step(S, DT);
      if (f.F > 0) {
        if (!st.live) {
          const rel = Math.hypot(S.bodies[1].vx - S.bodies[0].vx,
                                 S.bodies[1].vy - S.bodies[0].vy);
          /* an explosion begins with the spring already squashed, so the
            * first sample is whatever force there is, not zero */
          st.live = { t0: S.t, s: [[0, f.F]], J: 0, peak: 0, squash: 0,
                      approach: rel };
          sinceSample = 0;
        }
        st.live.J += f.F * DT;
        st.live.peak = Math.max(st.live.peak, f.F);
        st.live.squash = Math.max(st.live.squash, f.delta);
        if (++sinceSample >= SAMPLE_EVERY) {
          sinceSample = 0;
          st.live.s.push([S.t - st.live.t0, f.F]);
        }
      } else if (st.live) {
        if (st.live.s.length > 2) {
          st.live.s.push([S.t - st.live.t0, 0]);
          st.live.dur = S.t - st.live.t0;
          st.live.separate = Math.hypot(S.bodies[1].vx - S.bodies[0].vx,
                                        S.bodies[1].vy - S.bodies[0].vy);
          st.live.e = st.live.separate / Math.max(st.live.approach, 1e-12);
          st.contact = st.live;
          st.after = snapshot();
        }
        st.live = null;
      }
    }
  }

  const anim = loop(dt => {
    if (!st.playing) return;
    if (st.armed) {
      st.fuse += dt;
      if (st.fuse > 1.1) fire();
      drawTable(); drawGraph();
      if ((frame++ % 6) === 0) fillReadouts();
      return;
    }
    if (st.burst > 0) st.burst = Math.max(0, st.burst - dt / 0.6);
    if (!st.done) {
      advance(Math.max(1, Math.round(st.rate * Math.min(dt, 0.05) / DT)));
      const gone = S.bodies.every(q => Math.abs(q.x) > TABLE_W / 2 + 0.3
                                    || Math.abs(q.y) > TABLE_H / 2 + 0.3);
      if (gone || S.t > 30) st.done = true;
    } else if (st.loop) {
      st.idle += dt;
      if (st.idle > 1.1) { reset(); }
    }
    drawTable(); drawGraph();
    if ((frame++ % 6) === 0) fillReadouts();
  }, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());
  let frame = 0;

  function fitAll() {
    P = palette(root);
    const cw = Math.round(tv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      tv.setLogical(w, tableGeom(w).H);
      gv.setLogical(w, w < NARROW ? HG_SM : HG);
    }
    tv.fit(); gv.fit();
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

  reset();
  S.pscale = pscaleOf();
  setMode('line');
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: q => {
      const m = q.mode;
      Object.assign(st, q);
      sM1.set(st.m1); sM2.set(st.m2); sU1.set(st.u1); sU2.set(st.u2);
      sZ.set(st.zeta); sB.set(st.b); sC.set(st.charge);
      if (m) setMode(m); else { reset(); render(); }
    },
    /** run until the collision is over and both have stopped touching */
    _run: (seconds) => {
      fire();
      advance(Math.min(4000000, Math.round(seconds / DT)));
      render();
      return S.t;
    },
    _runOut: () => {
      fire();
      for (let i = 0; i < 400; i++) {
        advance(2000);
        if (st.contact && !st.live && S.t > st.contact.t0 + 0.3) break;
      }
      render();
      return st.after ? { v: st.after.v, p: st.after.p, E: st.after.E } : null;
    },
    _state: () => ({
      mode: st.mode, m1: st.m1, m2: st.m2, u1: st.u1, u2: st.u2,
      zeta: st.zeta, b: st.b, charge: st.charge, t: S.t, done: st.done,
      armed: st.armed, fuse: st.fuse, burst: st.burst,
      bodies: S.bodies.map(q => ({ m: q.m, r: q.r, x: q.x, y: q.y,
                                   vx: q.vx, vy: q.vy })),
      p: momentum(S), E: energy(S), F: S.F, delta: S.delta,
      before: st.before, after: st.after,
      contact: st.contact && { J: st.contact.J, dur: st.contact.dur,
                               peak: st.contact.peak, squash: st.contact.squash,
                               e: st.contact.e, approach: st.contact.approach,
                               separate: st.contact.separate,
                               n: st.contact.s.length },
      hist: st.hist.length,
    }),
    _forceCurve: () => (st.contact ? st.contact.s.map(q => [...q]) : null),
    /** every line of text in the left-hand column, and every box beside it,
     *  so that a verifier can prove none of them ever meet */
    _texts: () => TEXTS.map(q => ({ ...q })),
    _boxes: () => BOXES.map(q => ({ ...q })),
    /** run the same collision again at a different step, off to one side, so
     *  the integrator's own error can be watched shrinking */
    _driftAt: dt => {
      const r1 = radiusOf(st.m1), r2 = radiusOf(st.m2);
      const off = st.mode === 'glancing' ? st.b * (r1 + r2) : 0;
      const T = { bodies: [{ m: st.m1, r: r1, x: -0.7, y: -off / 2,
                             vx: st.u1, vy: 0 },
                           { m: st.m2, r: r2, x: 0.7, y: off / 2,
                             vx: st.u2, vy: 0 }],
                  c: dampingFor(st.zeta, st.m1, st.m2), t: 0 };
      const E0 = energy(T), p0 = momentum(T);
      const n = Math.round(1.0 / dt);
      for (let i = 0; i < n; i++) step(T, dt);
      const p1 = momentum(T);
      return { dE: (energy(T) - E0) / E0,
               dpx: p1.px - p0.px, dpy: p1.py - p0.py,
               v: T.bodies.map(q => ({ vx: q.vx, vy: q.vy })) };
    },
    _contactAt: (dx, dy, rel) => {
      const a = { m: st.m1, r: radiusOf(st.m1), x: 0, y: 0, vx: 0, vy: 0 };
      const b = { m: st.m2, r: radiusOf(st.m2), x: dx, y: dy,
                  vx: rel ? rel[0] : 0, vy: rel ? rel[1] : 0 };
      return contact(a, b, dampingFor(st.zeta, st.m1, st.m2));
    },
    _trail: () => st.trail.map(tr => tr.map(q => [...q])),
    _fire: () => { fire(); render(); return st.armed; },
    _geomT: () => GT(),
    _geomG: () => GG(),
    _pick: (x, y) => pick({ x, y }, GT()),
    _consts: () => ({ MW, HT, HT_SM, HG, HG_SM, NARROW, TABLE_W, TABLE_H,
                      K_CONTACT, DT, HIST, M_LO, M_HI, V_LO, V_HI,
                      B_LO, B_HI, Z_LO, Z_HI, E_LO, E_HI }),
  };
}
