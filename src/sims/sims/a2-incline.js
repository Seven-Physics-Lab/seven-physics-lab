/* ============================================================================
 * A2-2  The Inclined Plane: static and kinetic friction
 * IB Physics A.2 Forces and momentum
 *
 * A block on a ramp whose angle you can tilt. The weight is resolved live into
 * the component that pushes the block down the slope and the component the
 * surface has to carry. A gauge shows the friction force actually acting,
 * against the most this grip can give — and the moment the demand catches the
 * ceiling, the gauge snaps down to what sliding takes and the block goes.
 *
 * ---------------------------------------------------------------------------
 * NOTHING QUOTED
 *
 * None of the following appears anywhere in this file. Each of them is a
 * result of the model, and the simulation reports it as a measurement:
 *
 *   * tan θ_c = μs, the critical angle at which the block breaks away
 *   * that the critical angle does not depend on the mass
 *   * N = mg cos θ and the down-slope pull mg sin θ
 *   * a = g(sin θ − μk cos θ) for the sliding block
 *   * that a second, lower angle exists at which a block already sliding comes
 *     to rest again, so tilting up and back down is not reversible
 *   * v² = 2as, or any other suvat relation
 *   * that the work gravity does is shared between kinetic energy and heat
 *
 * The critical angle is not computed from a formula. It is FOUND, by asking
 * the model at a succession of angles whether the surface can still hold the
 * block, and bisecting on the answer — which is exactly what a student does
 * with a protractor and a plank.
 *
 * WHAT GOES IN
 *
 *   Newton's second law.
 *   The empirical friction model, stated once and only once: a dry contact can
 *   hold with any force up to μs times the force pressing the surfaces
 *   together, and once it is sliding it pushes back with μk times that force,
 *   against the motion. Coulomb measured this; it is not derivable here.
 *   Vector resolution, which is geometry. The weight is a vector and the slope
 *   is a rotated pair of axes: the two components come from projecting one on
 *   the other, so no sine or cosine of θ is ever written as a force formula.
 *
 * ---------------------------------------------------------------------------
 * HOW THE NUMBERS ARE GOT
 *
 * Classical fourth-order Runge–Kutta at 2000 steps per second, with the
 * direction the surface pushes held fixed across a step: deciding it inside
 * the step lets the force flip sign between stages and rattles a block that is
 * really at rest, and a step that turns the velocity round IS the block
 * stopping. The grip is then asked whether it can hold it there. On a slope
 * held still the acceleration is constant, so that step is exact to rounding
 * and the verification checks it against the closed form rather than against a
 * finer step; the integrator earns its keep while the ramp is being tilted.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider, toggle,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, croundRect,
  chatch, callout,
} from '../sim-kit.js';

/* --------------------------------------------------------------- constants */

const G = 9.81, TAU = Math.PI * 2, DEG = Math.PI / 180;
const AW = 664, AH = 470;          // the ramp
const GW = 664, GH = 352;          // the gauge and the graph
const H = 1 / 2000;                // s, physics substep
const L_RAMP = 2.0;                // m, the length of the slope
const TH_MAX = 45;                 // degrees, as far as the ramp tilts

/* ========================================================================= *
 * THE MODEL
 *
 * Kept above the drawing so the physics can be read without reading any
 * canvas code, and so the verification can drive exactly these.
 * ========================================================================= */

/**
 * The slope as a rotated pair of axes. `down` points down the slope and `norm`
 * points out of the surface, both in a world frame with x to the right and y
 * upwards. Nothing about forces is in here: it is the geometry of a tilt.
 */
function slopeAxes(thDeg) {
  const t = thDeg * DEG;
  return { down: [Math.cos(t), -Math.sin(t)], norm: [Math.sin(t), Math.cos(t)] };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * What the weight does to a block on that slope: how hard it drags it down the
 * slope, and how hard it presses it into the surface. Both are projections of
 * the one weight vector onto the two axes.
 */
function weightOn(thDeg, m) {
  const { down, norm } = slopeAxes(thDeg);
  const W = [0, -m * G];
  return { drive: dot(W, down), press: -dot(W, norm) };
}

/** can the surface still hold it? */
function holds(thDeg, m, us) {
  const { drive, press } = weightOn(thDeg, m);
  return Math.abs(drive) <= us * press;
}

/**
 * The angle at which it lets go — found, not calculated. The model is asked at
 * a succession of angles whether the grip still holds, and the answer is
 * bisected on. `mu` is μs for the angle it breaks away at and μk for the lower
 * angle at which a block already sliding comes to rest again.
 */
function tiltUntilItSlips(m, mu, lo = 0, hi = 89.5, iters = 60) {
  if (!holds(lo, m, mu)) return lo;
  if (holds(hi, m, mu)) return hi;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (holds(mid, m, mu)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * One step of the block on the slope. `s` is the distance travelled down the
 * slope from where it was let go, `v` its speed down the slope.
 *
 * state: { s, v, t, stuck, heat, grips }   p: { th, m, us, uk, L }
 */
function step(st, p, h) {
  /* once it is against the stop at the foot it stays there: the stop, not the
   * friction, is what holds it, and nothing more is rubbed away */
  if (st.atFoot) { st.t += h; return; }

  const { drive, press } = weightOn(p.th, p.m);
  const grip = p.us * press;

  if (st.stuck) {
    if (Math.abs(drive) > grip) st.stuck = false;
    else { st.t += h; return; }
  }

  /* The direction the surface pushes is fixed for the whole of this step, at
   * the direction the block is travelling as the step begins. Re-deciding it
   * inside the step would let the force flip sign between stages and rattle a
   * block that is really at rest; frozen, a step that turns the velocity round
   * IS the block stopping. On a slope that is not being tilted the
   * acceleration is constant, so this step is exact to rounding; the RK4 form
   * is kept so that a ramp being tilted while the block moves is handled too. */
  const v0 = st.v;
  const dir = v0 !== 0 ? Math.sign(v0) : Math.sign(drive) || 1;
  const acc = () => (drive - p.uk * press * dir) / p.m;
  const k1v = acc(), k1s = st.v;
  const k2v = acc(), k2s = st.v + h / 2 * k1v;
  const k3v = acc(), k3s = st.v + h / 2 * k2v;
  const k4v = acc(), k4s = st.v + h * k3v;
  const ds = h / 6 * (k1s + 2 * k2s + 2 * k3s + k4s);
  const dv = h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);

  /* The stop at the foot is an event inside the step, not at the end of it.
   * Running the whole step and then clamping would rub the surface over a
   * stretch of slope that is not there and arrive with the wrong speed, and
   * the energy would not add up. The step is cut at the wall instead. */
  if (st.s + ds >= p.L) {
    const rem = p.L - st.s;
    const vWall = Math.sqrt(Math.max(0, v0 * v0 + 2 * k1v * rem));
    st.heat += p.uk * press * Math.abs(rem);
    st.t += k1v !== 0 ? (vWall - v0) / k1v : (v0 !== 0 ? rem / v0 : h);
    st.bang = 0.5 * p.m * vWall * vWall;     // what the stop had to absorb
    st.s = p.L; st.v = 0; st.stuck = true; st.atFoot = true;
    return;
  }

  st.s += ds; st.v += dv; st.t += h;
  st.heat += p.uk * press * Math.abs(ds);

  if (dir > 0 && st.v <= 0 || dir < 0 && st.v >= 0) {
    st.v = 0;
    if (Math.abs(drive) <= grip) { st.stuck = true; st.grips++; }
  }
  if (st.s < 0) { st.s = 0; st.v = 0; }
}

/** the friction force the surface is supplying right now, up the slope */
function frictionNow(st, p) {
  const { drive, press } = weightOn(p.th, p.m);
  if (st.stuck) return Math.min(Math.abs(drive), p.us * press) * Math.sign(drive || 1);
  return p.uk * press * Math.sign(st.v || drive || 1);
}

/* ========================================================================= *
 * THE SIMULATION
 * ========================================================================= */

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'a2-incline',
    title: 'The inclined plane: static and kinetic friction',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    th: 18, m: 2.0, us: 0.62, uk: 0.40,
    playing: true, ann: false, speed: 1, tilting: false,
    b: { s: 0, v: 0, t: 0, stuck: true, heat: 0, grips: 0, atFoot: false, bang: 0 },
    broke: null,                       // the angle it actually let go at
  };

  const params = () => ({ th: st.th, m: st.m, us: st.us, uk: st.uk, L: L_RAMP });

  function resetBlock() {
    st.b = { s: 0, v: 0, t: 0, stuck: true, heat: 0, grips: 0, atFoot: false, bang: 0 };
    st.broke = null;
  }

  /* ---------------------------------------------------------- surfaces */

  const av = surface(AW, AH, { label: 'A block on a ramp whose angle can be tilted' });
  const gv = surface(GW, GH, { label: 'The friction gauge and friction against ramp angle' });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'th', label: 'Ramp angle <i>θ</i>' },
    { key: 'N', label: 'Force from the surface <i>N</i>' },
    { key: 'drv', label: 'Weight component down the slope' },
    { key: 'cap', label: 'Most this grip can give, <i>μ</i><sub>s</sub><i>N</i>' },
    { key: 'f', label: 'Friction acting now' },
    { key: 'sta', label: 'The block is' },
    { key: 'crit', label: 'Angle it lets go at, found by tilting' },
    { key: 'tan', label: 'tan of that angle, against <i>μ</i><sub>s</sub>' },
    { key: 'kin', label: 'Angle it stops again at (tilting back down)' },
    { key: 'mot', label: 'Acceleration / speed' },
    { key: 'slid', label: 'Distance slid' },
    { key: 'q', label: 'Energy: height lost = kinetic + heat + stop' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sTh = slider({ label: '<i>θ</i>', min: 0, max: TH_MAX, step: 0.5, value: st.th,
    format: v => `${v.toFixed(1)}°`,
    onInput: v => { st.th = v; st.tilting = false; tTilt.set(false); resetBlock(); } });
  const sM = slider({ label: '<i>m</i>', min: 0.2, max: 5, step: 0.1, value: st.m,
    format: v => `${v.toFixed(1)} kg`, onInput: v => { st.m = v; resetBlock(); } });
  const sUs = slider({ label: '<i>μ</i><sub>s</sub>', min: 0.05, max: 1, step: 0.01, value: st.us,
    format: v => v.toFixed(2),
    onInput: v => { st.us = v; if (st.uk > v) { st.uk = v; sUk.set(v); } resetBlock(); } });
  const sUk = slider({ label: '<i>μ</i><sub>k</sub>', min: 0.05, max: 1, step: 0.01, value: st.uk,
    format: v => v.toFixed(2),
    onInput: v => { st.uk = v; if (v > st.us) { st.us = v; sUs.set(v); } resetBlock(); } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.1, max: 2, step: 0.1, value: 1,
    format: v => `× ${v.toFixed(1)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bReset = button({ label: 'Put it back at the top', onClick: () => { resetBlock(); render(); } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });
  const tTilt = toggle({ label: 'tilt it slowly until it goes', checked: false,
    onChange: v => { st.tilting = v; if (v) { st.th = 0; sTh.set(0); resetBlock(); } } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('The Inclined Plane',
            'static and kinetic friction — tilt it until it goes, and watch the gauge snap'),
    panelBox('The ramp — drag the slope, or tilt it slowly and wait', av.el),
    panelBox('What the grip can give, what the slope demands, and where they cross', gv.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bReset.node, bAnn.node]),
              tTilt.node]),
    controls([sTh.node, sM.node, sUs.node, sUk.node, sS.node]),
    out.node,
    note('<b>Physics.</b> One empirical rule goes in, and it is the only place a coefficient ' +
         'is written down: a dry contact holds with any force up to <i>μ</i><sub>s</sub> times ' +
         'the force pressing the surfaces together, and once sliding it pushes back with ' +
         '<i>μ</i><sub>k</sub> times that, against the motion. Everything else is ' +
         '<i>F</i> = <i>ma</i> and the fact that the weight is a vector: the slope is just a ' +
         'rotated pair of axes, so the two components are projections, not formulas. Watch the ' +
         'gauge. Static friction is <em>not</em> <i>μ</i><sub>s</sub><i>N</i> — it is whatever ' +
         'balances the pull, and <i>μ</i><sub>s</sub><i>N</i> is only the ceiling it may not ' +
         'pass. Tilt, and two things move towards each other at once: the demand rises as more ' +
         'of the weight points down the slope, and the ceiling falls as less of it presses into ' +
         'the surface. Where they cross, the block goes. That angle is reported here as a ' +
         'measurement, found by tilting the model until it slips, and its tangent turns out to ' +
         'be <i>μ</i><sub>s</sub> exactly — try it at any mass you like. Then tilt back down: ' +
         'it keeps sliding well past the angle it started at, and only stops at the lower angle ' +
         'set by <i>μ</i><sub>k</sub>.')
  );

  /* ================================================================== *
   * advancing
   * ================================================================== */

  let acc = 0;
  function advance(dt) {
    const d = Math.min(dt, 0.1) * st.speed;
    if (st.tilting && st.b.stuck && !st.b.atFoot) {
      st.th = Math.min(TH_MAX, st.th + 2.2 * d);      // degrees per second
      sTh.set(st.th);
    }
    const p = params();
    acc += d;
    let guard = 0;
    const wasStuck = st.b.stuck;
    while (acc >= H && guard++ < 4000) { step(st.b, p, H); acc -= H; }
    if (wasStuck && !st.b.stuck && st.broke == null) {
      st.broke = st.th;
      if (st.tilting) { st.tilting = false; tTilt.set(false); }
    }
  }

  /* ================================================================== *
   * the ramp
   * ================================================================== */

  let P = palette(root);

  const GND = 390;                          // the bench the ramp stands on
  const PIV = [560, GND];                   // the foot of the slope, down on the bench
  const PPM = 200;                          // px per metre along the slope
  const BW = 54, BH = 34;                   // the block, px

  /** everything the drawing needs, exposed so the tests can check the picture */
  function geom() {
    const t = st.th * DEG;
    const up = [-Math.cos(t), -Math.sin(t)];         // screen coords, y down
    const dn = [Math.cos(t), Math.sin(t)];
    const nm = [Math.sin(t), -Math.cos(t)];          // out of the surface
    /* the slope is a little longer than the block's run, so the block comes to
     * rest against its stop with the foot of the ramp still clear beneath it */
    const Lpx = L_RAMP * PPM + BW + 34;
    const stopAt = L_RAMP * PPM + BW + 8;
    const top = [PIV[0] + up[0] * Lpx, PIV[1] + up[1] * Lpx];
    const foot = PIV;
    const sPx = st.b.s * PPM + BW / 2;    // the block's centre, not its top edge
    const onSurf = [top[0] + dn[0] * sPx, top[1] + dn[1] * sPx];
    const c = [onSurf[0] + nm[0] * BH / 2, onSurf[1] + nm[1] * BH / 2];
    const stop = [top[0] + dn[0] * stopAt, top[1] + dn[1] * stopAt];
    return { up, dn, nm, top, foot, Lpx, c, onSurf, stop };
  }

  function drawRamp() {
    const ctx = av.ctx, g = geom();
    const { drive, press } = weightOn(st.th, st.m);
    const f = frictionNow(st.b, params());
    /* The weight is drawn at one fixed length whatever the mass, so every other
     * force is to the same scale as it. The picture is then identical at any
     * mass, which is the point: the angle it goes at does not depend on m. */
    const FS = 64 / (st.m * G);                                // px per newton

    ctx.clearRect(0, 0, AW, AH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, AW, AH);

    /* the bench the whole thing stands on */
    ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(22, GND); ctx.lineTo(AW - 22, GND); ctx.stroke();
    chatch(ctx, 22, GND, AW - 44, 0, { color: P.muted, gap: 14, len: 12 });

    /* The ramp is a plain right triangle standing on that bench: the slope runs
     * from the top corner down to the ground, and that is the whole apparatus. */
    ctx.beginPath();
    ctx.moveTo(g.top[0], g.top[1]);
    ctx.lineTo(g.foot[0], g.foot[1]);
    ctx.lineTo(g.top[0], GND);
    ctx.closePath();
    const wedge = ctx.createLinearGradient(g.top[0], g.top[1], g.top[0], GND);
    wedge.addColorStop(0, P.bg);
    wedge.addColorStop(1, P.soft);
    ctx.fillStyle = wedge; ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();

    /* a bevel just inside the sloping face, so it reads as a solid board rather
     * than an outline */
    ctx.save();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = P.bg; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(g.top[0] - g.nm[0] * 5 + g.dn[0] * 6, g.top[1] - g.nm[1] * 5 + g.dn[1] * 6);
    ctx.lineTo(g.foot[0] - g.nm[0] * 5 - g.dn[0] * 6, g.foot[1] - g.nm[1] * 5 - g.dn[1] * 6);
    ctx.stroke(); ctx.restore();

    /* the stop at the foot of the slope, so the block has somewhere to arrive */
    ctx.beginPath();
    ctx.moveTo(g.stop[0], g.stop[1]);
    ctx.lineTo(g.stop[0] + g.nm[0] * 24, g.stop[1] + g.nm[1] * 24);
    ctx.strokeStyle = P.text; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.stroke();

    /* the angle, marked where it is read, against a horizontal to read it from */
    const r = 100;
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.75; ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(g.foot[0], g.foot[1]); ctx.lineTo(g.foot[0] - r - 34, g.foot[1]);
    ctx.stroke(); ctx.restore();
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(g.foot[0], g.foot[1], r, Math.PI, Math.PI + st.th * DEG, false);
    ctx.stroke(); ctx.restore();
    ctext(ctx, 'θ', g.foot[0] - r - 20, g.foot[1] - r * 0.26,
      { font: P.sym(16), color: P.accent, halo: P.bg });

    /* the block, lying along the slope */
    ctx.save();
    ctx.translate(g.c[0], g.c[1]);
    ctx.rotate(st.th * DEG);
    const gr = ctx.createLinearGradient(-BW / 2, -BH / 2, BW / 2, BH / 2);
    gr.addColorStop(0, '#5fa3ab'); gr.addColorStop(0.35, '#005F6A'); gr.addColorStop(1, '#00272d');
    croundRect(ctx, -BW / 2, -BH / 2, BW, BH, 5);
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#fff';
    croundRect(ctx, -BW / 2 + 4, -BH / 2 + 4, BW - 8, 7, 3); ctx.fill(); ctx.restore();
    ctx.restore();

    /* Every arrow starts where its force acts. The weight acts at the centre of
     * mass, so it starts there. The surface can only push on what it touches, so
     * N and the friction start on the slope. The part of the weight that drags
     * the block downhill is drawn off the block's lower face, where it leaves. */
    const at = (p, u, len) => [p[0] + u[0] * len, p[1] + u[1] * len];
    const faceDn = at(g.c, g.dn, BW / 2);
    const nAt = g.onSurf;
    const fAt = at(g.onSurf, g.dn, -14);

    const wEnd = [g.c[0], g.c[1] + st.m * G * FS];
    carrow(ctx, g.c[0], g.c[1], wEnd[0], wEnd[1], { color: P.text, width: 2.6, head: 10 });
    ctext(ctx, 'W', wEnd[0] + 10, wEnd[1] + 4, { font: P.sym(15), color: P.text, halo: P.bg });

    const dEnd = at(faceDn, g.dn, drive * FS);
    if (carrow(ctx, faceDn[0], faceDn[1], dEnd[0], dEnd[1],
               { color: P.text, width: 2, head: 9, dash: [5, 4], min: 9 })) {
      const lx = clamp(dEnd[0] + g.nm[0] * 16, 64, AW - 64);
      ctext(ctx, 'down the slope', lx, dEnd[1] + g.nm[1] * 16 - 4,
        { font: `500 10.5px ${P.font}`, color: P.muted, align: 'center', halo: P.bg });
    }

    /* the surface pushing back: N out of the face, friction along it */
    const nEnd = at(nAt, g.nm, press * FS);
    carrow(ctx, nAt[0], nAt[1], nEnd[0], nEnd[1],
      { color: P.text, width: 2.6, head: 10 });
    ctext(ctx, 'N', nEnd[0] + 9, nEnd[1] - 2, { font: P.sym(15), color: P.text, halo: P.bg });

    const fEnd = at(fAt, g.dn, -f * FS);
    if (carrow(ctx, fAt[0], fAt[1], fEnd[0], fEnd[1],
               { color: P.accent, width: 2.8, head: 10, min: 7 })) {
      ctext(ctx, 'f', fEnd[0] - g.dn[0] * 14, fEnd[1] - g.dn[1] * 14 + 5,
        { font: P.sym(15), color: P.accent, align: 'center', halo: P.bg });
    }

    /* what it is doing, in words; the numbers live in the readouts */
    ctext(ctx, st.b.atFoot
      ? 'it has reached the stop at the foot of the ramp'
      : st.b.stuck
        ? 'gripped — the surface is holding it with exactly as much as it needs'
        : 'sliding — the surface gives only what sliding takes, and that is less',
      AW / 2, AH - 14, { font: `600 12px ${P.font}`,
                    color: st.b.stuck ? P.text : P.accent, align: 'center' });

    if (st.ann) {
      callout(ctx, st.b.stuck
        ? ['Tilt further and two things close in at once:',
           'more of the weight points down the slope,',
           'and less of it presses into the surface, so',
           'the ceiling μs N falls as the demand rises.']
        : ['It let go the moment the demand caught the',
           'ceiling. Sliding needs only μk N, which is',
           'less, so there is force to spare and the',
           'block accelerates.'],
        24, 24, g.c[0], g.c[1], { palette: P });
    }
  }

  /* ================================================================== *
   * the gauge and the graph
   * ================================================================== */

  function gaugeGeom() {
    const full = st.us * st.m * G;             // the grip with the ramp flat
    const X0 = 96, X1 = GW - 40, Y = 44;
    return { full, X0, X1, Y, TX: F => X0 + clamp(F / full, 0, 1) * (X1 - X0) };
  }

  function drawGauge(ctx) {
    const q = gaugeGeom();
    const { drive, press } = weightOn(st.th, st.m);
    const f = Math.abs(frictionNow(st.b, params()));
    const cap = st.us * press, kin = st.uk * press;

    ctext(ctx, 'friction', 18, q.Y + 5, { font: `600 12px ${P.font}`, color: P.text });
    ctext(ctx, 'gauge', 18, q.Y + 20, { font: `600 12px ${P.font}`, color: P.text });

    /* the track: the whole grip this contact has when the ramp is flat */
    croundRect(ctx, q.X0, q.Y - 13, q.X1 - q.X0, 26, 5);
    ctx.fillStyle = P.bg; ctx.fill();
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1; ctx.stroke();

    /* what the surface is actually supplying */
    ctx.save();
    croundRect(ctx, q.X0, q.Y - 13, q.X1 - q.X0, 26, 5); ctx.clip();
    ctx.fillStyle = P.accent;
    ctx.fillRect(q.X0, q.Y - 13, q.TX(f) - q.X0, 26);
    ctx.restore();

    /* the ceiling, which falls as the ramp tilts */
    const cx = q.TX(cap);
    ctx.strokeStyle = P.text; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx, q.Y - 20); ctx.lineTo(cx, q.Y + 20); ctx.stroke();
    ctext(ctx, 'ceiling  μs N', cx, q.Y - 24,
      { font: `600 10.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg });

    /* what sliding takes */
    const kx = q.TX(kin);
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(kx, q.Y - 18); ctx.lineTo(kx, q.Y + 18); ctx.stroke();
    ctx.restore();
    ctext(ctx, 'sliding takes  μk N', kx, q.Y + 32,
      { font: `600 10.5px ${P.font}`, color: P.muted, align: 'center', halo: P.bg });

    ctext(ctx, st.b.stuck && Math.abs(drive) < cap * 0.999
      ? 'the bar is only as long as it needs to be — static friction is not μs N, that is just the ceiling'
      : st.b.stuck ? 'the bar has reached the ceiling: one more degree and it goes'
                   : 'the bar has snapped down to what sliding takes, which is less',
      q.X0, q.Y + 58, { font: `600 11px ${P.font}`, color: P.accent });
  }

  /** friction against ramp angle: the demand, the ceiling, and what happens */
  function graphGeom() {
    const X0 = 68, X1 = GW - 24, Y0 = 128, Y1 = GH - 44;
    const fmax = st.us * st.m * G * 1.08;
    return {
      X0, X1, Y0, Y1, fmax,
      TX: th => X0 + th / TH_MAX * (X1 - X0),
      TY: F => Y1 - clamp(F / fmax, 0, 1.02) * (Y1 - Y0),
    };
  }

  /** the curve the simulation draws, sampled — the tests read this */
  function curve(n = 240) {
    const crit = tiltUntilItSlips(st.m, st.us);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = TH_MAX * i / n;
      const { drive, press } = weightOn(th, st.m);
      pts.push([th, th < crit ? Math.min(drive, st.us * press) : st.uk * press]);
    }
    return { pts, crit };
  }

  function drawGraph(ctx) {
    const q = graphGeom(), cv = curve();

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(q.X0, q.Y0, q.X1 - q.X0, q.Y1 - q.Y0);
    ctx.font = `500 9.5px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let th = 10; th <= TH_MAX; th += 10) {
      const gx = q.TX(th);
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(gx, q.Y0); ctx.lineTo(gx, q.Y1); ctx.stroke();
      ctx.fillText(`${th}°`, gx, q.Y1 + 5);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('0', q.X0 - 5, q.Y1);
    ctx.fillText(q.fmax.toPrecision(2), q.X0 - 5, q.Y0 + 5);
    ctx.fillStyle = P.text; ctx.font = P.sym(12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('ramp angle θ', (q.X0 + q.X1) / 2, q.Y1 + 32);
    ctx.save(); ctx.translate(16, (q.Y0 + q.Y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('force (N)', 0, 0); ctx.restore();

    const line = (fn, color, width, dash) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const th = TH_MAX * i / 200, y = q.TY(fn(th));
        i ? ctx.lineTo(q.TX(th), y) : ctx.moveTo(q.TX(th), y);
      }
      ctx.stroke(); ctx.restore();
    };
    line(th => weightOn(th, st.m).drive, P.text, 1.6);
    line(th => st.us * weightOn(th, st.m).press, P.text, 1.6, [6, 5]);
    line(th => st.uk * weightOn(th, st.m).press, P.muted, 1.5, [3, 4]);

    /* what the surface actually supplies, with the drop at the crossing */
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.8; ctx.lineJoin = 'round';
    ctx.beginPath();
    cv.pts.forEach((pt, i) => {
      const x = q.TX(pt[0]), y = q.TY(pt[1]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke(); ctx.restore();

    /* the crossing, and the lower angle it stops again at */
    const cx = q.TX(cv.crit);
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, q.Y0); ctx.lineTo(cx, q.Y1); ctx.stroke(); ctx.restore();
    ctext(ctx, 'it goes here', cx - 7, q.Y1 - 10,
      { font: `600 10.5px ${P.font}`, color: P.accent, align: 'right', halo: P.bg });

    /* the curves are named where they are clear of one another, not at the edge */
    const at = (th, fn, dy, txt, col) => ctext(ctx, txt, q.TX(th), q.TY(fn(th)) + dy,
      { font: `600 10.5px ${P.font}`, color: col, align: 'center', halo: P.bg });
    at(TH_MAX * 0.82, th => weightOn(th, st.m).drive, -10, 'what the slope demands', P.text);
    at(TH_MAX * 0.17, th => st.us * weightOn(th, st.m).press, -10, 'ceiling  μs N', P.text);
    at(TH_MAX * 0.86, th => st.uk * weightOn(th, st.m).press, 18, 'sliding  μk N', P.muted);
    at(TH_MAX * 0.30, th => weightOn(th, st.m).drive, 23,
       'what the surface actually gives', P.accent);

    /* where the ramp is sitting now */
    const f = Math.abs(frictionNow(st.b, params()));
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(q.TX(st.th), q.TY(f), 4.6, 0, TAU); ctx.fill();
  }

  function drawPanel2() {
    const ctx = gv.ctx;
    ctx.clearRect(0, 0, GW, GH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW, GH);
    drawGauge(ctx);
    drawGraph(ctx);
  }

  /* ================================================================== *
   * drag the slope
   * ================================================================== */

  let dragging = false;
  const angleAt = pt => {
    const dx = PIV[0] - pt.x, dy = PIV[1] - pt.y;
    return clamp(Math.atan2(dy, dx) / DEG, 0, TH_MAX);
  };
  const nearSlope = pt => {
    const g = geom();
    const vx = g.top[0] - g.foot[0], vy = g.top[1] - g.foot[1];
    const len = Math.hypot(vx, vy);
    const t = clamp(((pt.x - g.foot[0]) * vx + (pt.y - g.foot[1]) * vy) / (len * len), 0, 1);
    const cx = g.foot[0] + vx * t, cy = g.foot[1] + vy * t;
    return Math.hypot(pt.x - cx, pt.y - cy) < 26;
  };
  const onDown = e => {
    if (!nearSlope(av.at(e))) return;
    dragging = true;
    st.tilting = false; tTilt.set(false);
    av.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = e => {
    const pt = av.at(e);
    if (dragging) {
      st.th = angleAt(pt); sTh.set(st.th); resetBlock();
      av.el.style.cursor = 'grabbing';
      e.preventDefault();
    } else {
      av.el.style.cursor = nearSlope(pt) ? 'grab' : 'default';
    }
  };
  const onUp = e => {
    if (!dragging) return;
    dragging = false;
    try { av.el.releasePointerCapture(e.pointerId); } catch (_) {}
    av.el.style.cursor = 'default';
  };
  av.el.addEventListener('pointerdown', onDown);
  av.el.addEventListener('pointermove', onMove);
  av.el.addEventListener('pointerup', onUp);
  av.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    av.el.removeEventListener('pointerdown', onDown);
    av.el.removeEventListener('pointermove', onMove);
    av.el.removeEventListener('pointerup', onUp);
    av.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * readouts and frame
   * ================================================================== */

  function renderReads() {
    const { drive, press } = weightOn(st.th, st.m);
    const f = frictionNow(st.b, params());
    const crit = tiltUntilItSlips(st.m, st.us);
    const stop = tiltUntilItSlips(st.m, st.uk);
    const a = st.b.stuck ? 0 : (drive - st.uk * press * Math.sign(st.b.v || 1)) / st.m;
    const drop = st.b.s * Math.sin(st.th * DEG);
    out.setAll({
      th: `${fmt(st.th, 1)}°`,
      N: `${fmt(press, 2)} N`,
      drv: `${fmt(drive, 2)} N`,
      cap: `${fmt(st.us * press, 2)} N`,
      f: `${fmt(Math.abs(f), 2)} N, up the slope`,
      sta: st.b.atFoot ? 'at the foot of the ramp'
        : st.b.stuck ? 'gripped' : 'sliding',
      crit: `${fmt(crit, 2)}°` + (st.broke != null ? `  (it went at ${fmt(st.broke, 1)}°)` : ''),
      tan: `${fmt(Math.tan(crit * DEG), 4)}  against μs = ${fmt(st.us, 2)}`,
      kin: `${fmt(stop, 2)}°`,
      mot: `${fmt(a, 2)} m s⁻² / ${fmt(st.b.v, 2)} m s⁻¹`,
      slid: `${fmt(st.b.s * 100, 1)} cm of ${fmt(L_RAMP * 100, 0)} cm`,
      q: `${fmt(st.m * G * drop, 2)} J = ${fmt(0.5 * st.m * st.b.v * st.b.v, 2)} + ` +
         `${fmt(st.b.heat, 2)} + ${fmt(st.b.bang, 2)} J`,
    });
  }

  function render() { drawRamp(); drawPanel2(); renderReads(); }

  function frame(dt) {
    if (st.playing && !dragging) advance(dt);
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

  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: q => {
      Object.assign(st, q);
      if (q.th != null) sTh.set(st.th);
      if (q.m != null) sM.set(st.m);
      if (q.us != null) sUs.set(st.us);
      if (q.uk != null) sUk.set(st.uk);
      resetBlock();
      render();
    },
    _state: () => ({
      th: st.th, m: st.m, us: st.us, uk: st.uk,
      ...weightOn(st.th, st.m),
      f: frictionNow(st.b, params()),
      block: { ...st.b }, broke: st.broke,
    }),
    _geom: () => {
      const g = geom();
      return { ...g, GND, PIV, PPM, BW, BH, L: L_RAMP };
    },
    /** the angle the model lets go at, found by tilting, never calculated */
    _critical: (m, mu) => tiltUntilItSlips(m ?? st.m, mu ?? st.us),
    _weightOn: (th, m) => weightOn(th, m),
    /** run with the very stepper the animation uses */
    _run: (p, seconds, h, v0 = 0) => {
      const s = { s: 0, v: v0, t: 0, stuck: v0 === 0, heat: 0, grips: 0, atFoot: false, bang: 0 };
      const n = Math.round(seconds / h);
      let vmax = 0;
      for (let i = 0; i < n; i++) { step(s, p, h); vmax = Math.max(vmax, s.v); }
      return { ...s, vmax };
    },
    /** tilt the ramp up at a steady rate and report where it let go */
    _tiltUp: (p, rate, h) => {
      const s = { s: 0, v: 0, t: 0, stuck: true, heat: 0, grips: 0, atFoot: false, bang: 0 };
      const q = { ...p, th: 0 };
      let guard = 0;
      while (s.stuck && q.th < 89 && guard++ < 4e6) { q.th += rate * h; step(s, q, h); }
      return { angle: q.th, t: s.t };
    },
    /** the friction curve as it is drawn on the graph */
    _curve: n => curve(n),
    _gauge: () => {
      const q = gaugeGeom(), w = weightOn(st.th, st.m);
      return { ...q, f: Math.abs(frictionNow(st.b, params())),
               cap: st.us * w.press, kin: st.uk * w.press };
    },
  };
}
