/* ============================================================================
 * C1-5  Damping, Driving and Resonance
 * IB Physics C.1 Simple Harmonic Motion
 *
 * Built to the house pattern: a canvas for the apparatus, a canvas for the
 * trace, a full-width resonance curve, controls beneath, and every number in
 * the readout grid.
 *
 * ---------------------------------------------------------------------------
 * THE APPARATUS, AND WHY IT IS DRIVEN THIS WAY
 *
 * A mass hangs on a spring whose top is held by a vibration generator. The
 * generator moves its rod up and down by a fixed 10 mm, and everything else
 * follows. That is the real laboratory arrangement, and it is better than an
 * abstract "driving force" because the input is something you can see.
 *
 * Let x be the displacement of the mass below its static equilibrium and s
 * the displacement of the support, both positive downwards. The spring's
 * extension changes by (x - s), so
 *
 *     m x'' = -k (x - s) - b x'
 *     x'' + gamma x' + omega_0^2 x = omega_0^2 s,    s = a_0 cos(omega t)
 *
 * with omega_0 = sqrt(k/m) and gamma = b/m. Integrated with classical
 * fourth-order Runge-Kutta at a fixed 600 Hz substep. The forcing depends on
 * time as well as on the state, so each RK4 stage is evaluated at its own
 * time, not all at the start of the step.
 *
 * STEADY STATE
 *
 * After the transient dies away the mass oscillates at the DRIVING frequency,
 * not its own, with
 *
 *     x = A cos(omega t - phi)
 *     A / a_0 = omega_0^2 / sqrt( (omega_0^2 - omega^2)^2 + gamma^2 omega^2 )
 *     phi     = atan2( gamma omega, omega_0^2 - omega^2 )
 *
 * Three limits are worth watching for, and all three are visible on the rig:
 *
 *   omega -> 0     A -> a_0 and phi -> 0: the mass simply follows the support.
 *   omega = omega_0  phi = 90 degrees exactly, whatever the damping. This is
 *                  the one clean experimental signature of resonance.
 *   omega -> inf   A -> 0 and phi -> 180: the support shakes, the mass stays.
 *
 * The amplitude peak is NOT at omega_0 but slightly below it, at
 * omega_r = omega_0 sqrt(1 - 1/(2 Q^2)), and it disappears entirely once
 * Q < 1/sqrt(2). Damping is set through Q = omega_0 / gamma rather than
 * through gamma directly, so the sharpness of the peak is the thing the
 * slider controls, and so the response can never grow larger than the rig.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
  Recorder, Plot, svg,
} from '../sim-kit.js';

/* ------------------------------------------------------- the apparatus */

const TAU = Math.PI * 2;
const PW = 560, PH = 640, CX = PW / 2;
const TW = 622, TH = 300;
const PPM     = 700;     // px per metre
const A_DRIVE = 0.010;   // m, the generator's fixed travel
const SUP_Y   = 130;     // px, the support at rest
const L_EQ    = 240;     // px, drawn spring length at equilibrium
const L_BOUND = 74;      // px, coil-bound: it cannot be drawn shorter
const X_LIMIT = 0.22;    // m, the largest displacement the rig allows
const BW = 116, BH = 70;
const H = 1 / 600;       // s, physics substep

const Q_MIN = 0.5, Q_MAX = 10;

/** steady-state amplitude ratio A / a0 */
export function ratio(w0, gam, w) {
  return w0 * w0 / Math.sqrt((w0 * w0 - w * w) ** 2 + gam * gam * w * w);
}
/** steady-state phase lag of the mass behind the support, radians in [0, pi] */
export function phase(w0, gam, w) {
  return Math.atan2(gam * w, w0 * w0 - w * w);
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c1-resonance',
    title: 'Damping, driving and resonance',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    m: 0.50, k: 20, Q: 6, f: 1.0, speed: 1,
    playing: true, ann: false, sweep: false,
    x: 0, v: 0, t: 0,
    peak: 0, measA: 0, lastUp: null, Tmeas: null,
  };

  const w0   = () => Math.sqrt(st.k / st.m);
  const gam  = () => w0() / st.Q;
  const wd   = () => TAU * st.f;
  /** support displacement, positive downwards */
  const sup  = t => A_DRIVE * Math.cos(wd() * t);
  const acc  = (x, v, t) => -w0() * w0() * (x - sup(t)) - gam() * v;

  const clampX = x => clamp(x, -X_LIMIT, X_LIMIT);

  /* ---------------------------------------------------------- surfaces */

  const pv = surface(PW, PH, { label: 'A driven mass on a spring' });
  const tv = surface(TW, TH, { label: 'Displacement against time' });

  const rec = new Recorder(tv, {
    window: 12, xLabel: 't (s)', yLabel: 'displacement (cm)',
    pad: { l: 56, r: 14, t: 18, b: 52 },
  });
  rec.add('mass', 'accent', { width: 1.9 });
  rec.add('support', 'text', { width: 1.3, dash: [5, 4] });

  const pR = new Plot({
    width: 1120, height: 230, pad: { l: 66, r: 18, t: 24, b: 40 },
    xDomain: [0, 3], yDomain: [0, 10], xTicks: 6, yTicks: 5,
    xLabel: 'f (Hz)', yLabel: 'A / a₀',
    ariaLabel: 'Amplitude ratio against driving frequency',
  });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'f0', label: 'Natural <i>f</i><sub>0</sub> = (1/2π)√(<i>k</i>/<i>m</i>)' },
    { key: 'fd', label: 'Driving <i>f</i>, and <i>f</i>/<i>f</i><sub>0</sub>' },
    { key: 'Q',  label: '<i>Q</i> = <i>ω</i><sub>0</sub>/<i>γ</i>, and <i>γ</i>' },
    { key: 'fr', label: 'Peak at <i>f</i><sub>r</sub> = <i>f</i><sub>0</sub>√(1 − 1/2<i>Q</i>²)' },
    { key: 'AR', label: 'Predicted <i>A</i>/<i>a</i><sub>0</sub> at this <i>f</i>' },
    { key: 'AM', label: 'Measured amplitude of the mass' },
    { key: 'ph', label: 'Phase lag <i>φ</i> behind the support' },
    { key: 'bw', label: 'Sharpness: half-power width <i>f</i><sub>0</sub>/<i>Q</i>' },
  ]);

  /* ---------------------------------------------------------- controls */

  function restart() {
    st.x = 0; st.v = 0; st.t = 0;
    st.peak = 0; st.measA = 0; st.lastUp = null; st.Tmeas = null;
    rec.clear();
  }

  const sM = slider({ label: '<i>m</i>', min: 0.2, max: 2, step: 0.05, value: st.m,
    format: v => `${v.toFixed(2)} kg`, onInput: v => { st.m = v; restart(); drawCurve(); } });
  const sK = slider({ label: '<i>k</i>', min: 5, max: 60, step: 1, value: st.k,
    format: v => `${v.toFixed(0)} N m⁻¹`, onInput: v => { st.k = v; restart(); drawCurve(); } });
  const sQ = slider({ label: '<i>Q</i>', min: Q_MIN, max: Q_MAX, step: 0.1, value: st.Q,
    format: v => v.toFixed(1), onInput: v => { st.Q = v; restart(); drawCurve(); } });
  const sF = slider({ label: '<i>f</i>', min: 0.05, max: 3, step: 0.01, value: st.f,
    format: v => `${v.toFixed(2)} Hz`, onInput: v => { st.f = v; restart(); drawCurve(); } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.25, max: 2, step: 0.25, value: 1,
    format: v => `×${v.toFixed(2)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bRel = button({ label: 'Start from rest', onClick: () => restart() });
  const bSweep = button({ label: 'Sweep the frequency', pressed: false, onClick: b => {
    st.sweep = !st.sweep;
    if (st.sweep) { st.f = 0.05; sF.set(st.f); restart(); drawCurve(); }
    b.setAttribute('aria-pressed', String(st.sweep));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });

  const setQ = q => { st.Q = q; sQ.set(q); restart(); drawCurve(); };
  const bL = button({ label: 'light  Q = 10',  onClick: () => setQ(10) });
  const bM = button({ label: 'medium  Q = 4',  onClick: () => setQ(4) });
  const bH = button({ label: 'heavy  Q = 1',   onClick: () => setQ(1) });
  const bT = button({ label: 'tune to resonance', onClick: () => {
    st.f = resonantF(); sF.set(st.f); restart(); drawCurve();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Damping, Driving and Resonance',
            'a mass on a spring shaken by a vibration generator — find the resonance'),
    el('div', { class: 'rs-row' }, [
      el('div', { class: 'rs-left' }, [
        panelBox('Rig — the generator moves the top of the spring by 10 mm', pv.el),
      ]),
      el('div', { class: 'rs-right' }, [
        panelBox('Support and mass against time', tv.el),
        controls([el('div', { class: 'ibs-btns' },
          [bPlay.node, bRel.node, bSweep.node, bAnn.node])]),
        controls([el('div', { class: 'ibs-btns' }, [bL.node, bM.node, bH.node, bT.node])],
                 { label: 'damping:' }),
        controls([sM.node, sK.node, sQ.node, sF.node, sS.node]),
      ]),
    ]),
    panelBox('Resonance curve — amplitude ratio against driving frequency', pR.svg),
    out.node,
    note('<b>Physics.</b> The generator shakes the top of the spring through a fixed ' +
         '10 mm at the frequency you set. Writing <i>x</i> for the displacement of the mass ' +
         'and <i>s</i> for the support, both downwards, the spring stretches by (<i>x</i> − ' +
         '<i>s</i>), so <i>x</i>″ + <i>γx</i>′ + <i>ω</i><sub>0</sub>²<i>x</i> = ' +
         '<i>ω</i><sub>0</sub>²<i>s</i>. Once the transient dies the mass oscillates at the ' +
         '<b>driving</b> frequency, not its own. Drive it slowly and it just follows the ' +
         'support. Drive it fast and it barely moves. In between, near ' +
         '<i>f</i><sub>0</sub>, the response is <i>Q</i> times the drive. The amplitude peak ' +
         'sits a little <em>below</em> <i>f</i><sub>0</sub> and vanishes altogether once ' +
         '<i>Q</i> &lt; 0.71, but the phase lag passes through exactly 90° at ' +
         '<i>f</i><sub>0</sub> whatever the damping, which is why phase is the reliable way ' +
         'to find a resonance in the laboratory.')
  );

  const cssId = 'ibs-c1-resonance-v1';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent = `
.ibs .rs-row{ display:flex; gap:14px; align-items:flex-start; }
.ibs .rs-left{ width:562px; flex:none; }
.ibs .rs-right{ flex:1; min-width:560px; }
.ibs .rs-row + .ibs-panel svg{ display:block; width:100%; height:auto; }
@container (max-width: 1150px){
  .ibs .rs-row{ flex-direction:column; }
  .ibs .rs-left{ width:100%; }
  .ibs .rs-right{ min-width:0; width:100%; }
}`;
    document.head.appendChild(s);
  }

  /* ================================================================== *
   * physics
   * ================================================================== */

  let accum = 0;

  /**
   * One RK4 substep. The forcing depends on time as well as on the state,
   * so every stage is evaluated at its own time rather than all of them at
   * the start of the step, which would quietly drop the method to first
   * order in the driving term.
   */
  function stepOnce() {
    const x = st.x, v = st.v, t = st.t;
    const k1x = v,               k1v = acc(x, v, t);
    const k2x = v + H / 2 * k1v, k2v = acc(x + H / 2 * k1x, v + H / 2 * k1v, t + H / 2);
    const k3x = v + H / 2 * k2v, k3v = acc(x + H / 2 * k2x, v + H / 2 * k2v, t + H / 2);
    const k4x = v + H * k3v,     k4v = acc(x + H * k3x,     v + H * k3v,     t + H);
    st.x += H / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    st.v += H / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    st.t += H;

    if (x < 0 && st.x >= 0) {
      const tc = st.t - H + (-x / (st.x - x)) * H;
      if (st.lastUp != null) st.Tmeas = tc - st.lastUp;
      st.lastUp = tc;
    }
    if (Math.abs(st.x) > st.peak) st.peak = Math.abs(st.x);
    if (v > 0 && st.v <= 0) { st.measA = st.peak; st.peak = 0; }
  }

  function integrate(dt) {
    accum += Math.min(dt, 0.12) * st.speed;
    let guard = 0;
    while (accum >= H && guard++ < 2000) { stepOnce(); accum -= H; }
  }

  /** the driving frequency at which the amplitude peaks, in Hz */
  function resonantF() {
    const W = w0(), g = gam();
    const wr2 = W * W - g * g / 2;
    return wr2 > 0 ? Math.sqrt(wr2) / TAU : 0.05;
  }

  /* ================================================================== *
   * the rig
   * ================================================================== */

  let P = palette(root);

  /** geometry, exposed so the tests can assert the picture is possible */
  function geom(t = st.t, x = st.x) {
    const s = sup(t);
    const supY = SUP_Y + s * PPM;
    const springLen = L_EQ + (x - s) * PPM;
    const blockTop = supY + springLen;
    return {
      s, supY, springLen, blockTop, blockBot: blockTop + BH,
      eqCentre: SUP_Y + L_EQ + BH / 2,
      PW, PH, L_EQ, L_BOUND, X_LIMIT, PPM, A_DRIVE, BW, BH, SUP_Y,
    };
  }

  function drawSpring(ctx, y1, y2, turns) {
    const len = y2 - y1, lead = Math.min(16, len * 0.12), body = len - 2 * lead;
    const amp = clamp(26 - (L_EQ - len) * 0.05, 12, 30);
    ctx.save();
    ctx.strokeStyle = P.text; ctx.lineWidth = 3;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CX, y1); ctx.lineTo(CX, y1 + lead);
    const n = turns * 2;
    for (let i = 0; i < n; i++) {
      ctx.lineTo(CX + (i % 2 ? amp : -amp), y1 + lead + body * (i + 0.5) / n);
    }
    ctx.lineTo(CX, y1 + lead + body); ctx.lineTo(CX, y2);
    ctx.stroke(); ctx.restore();
  }

  function drawRig() {
    const ctx = pv.ctx, g = geom();
    ctx.clearRect(0, 0, PW, PH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, PW, PH);

    /* the vibration generator */
    ctx.fillStyle = P.soft;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(CX - 96, 26, 192, 74, 6) : ctx.rect(CX - 96, 26, 192, 74);
    ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.stroke();
    ctext(ctx, 'vibration generator', CX, 55,
      { font: `600 12px ${P.font}`, color: P.text, align: 'center' });
    ctext(ctx, `${fmt(st.f, 2)} Hz`, CX, 79,
      { font: P.sym(16), color: P.accent, align: 'center' });
    // a phase pip on the box face, so the drive is legible even though its
    // travel is only 7 px
    const ph = (wd() * st.t) % TAU;
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(CX + 74, 87, 9, 0, TAU); ctx.stroke();
    ctx.fillStyle = P.accent;
    ctx.beginPath();
    ctx.arc(CX + 74 + 9 * Math.sin(ph), 87 + 9 * Math.cos(ph), 3, 0, TAU);
    ctx.fill(); ctx.restore();

    /* the driven rod, whose lower end is the top of the spring */
    ctx.strokeStyle = P.text; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(CX, 100); ctx.lineTo(CX, g.supY); ctx.stroke();
    // the rest position of the support, so the 10 mm travel is visible
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(CX - 40, SUP_Y); ctx.lineTo(CX + 62, SUP_Y); ctx.stroke();
    ctx.restore();
    ctext(ctx, `a₀ = 10 mm`, CX + 66, SUP_Y + 4,
      { font: `500 11px ${P.font}`, color: P.muted });

    /* equilibrium datum for the mass */
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(CX - 100, g.eqCentre); ctx.lineTo(CX + 160, g.eqCentre); ctx.stroke();
    ctx.restore();

    drawSpring(ctx, g.supY, g.blockTop, 10);

    /* the block */
    const bx = CX - BW / 2, by = g.blockTop;
    const gr = ctx.createLinearGradient(bx, by, bx + BW, by + BH);
    gr.addColorStop(0, '#5fa3ab');
    gr.addColorStop(0.35, '#005F6A');
    gr.addColorStop(1, '#00272d');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, BW, BH, 6) : ctx.rect(bx, by, BW, BH);
    ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.30; ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx + 7, by + 7, BW - 14, 10, 4) : ctx.rect(bx + 7, by + 7, BW - 14, 10);
    ctx.fill(); ctx.restore();
    ctext(ctx, `${fmt(st.m, 2)} kg`, CX, by + BH / 2 + 5,
      { font: `600 14px ${P.font}`, color: '#fff', align: 'center' });

    /* velocity, from the block's edge */
    if (Math.abs(st.v) > 0.02) {
      const sgn = Math.sign(st.v);
      const y0 = sgn > 0 ? g.blockBot : by;
      const dy = clamp(st.v * 42, -90, 90);
      if (carrow(ctx, CX + 76, y0, CX + 76, y0 + dy,
                 { color: P.accent, width: 2.4, head: 9, min: 7 })) {
        ctext(ctx, 'v', CX + 84, y0 + dy + 5,
          { font: P.sym(14), color: P.accent, halo: P.bg });
      }
    }

    /* the displacement ruler */
    const rx = CX - 124, cy0 = g.eqCentre;
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx, cy0 - X_LIMIT * PPM); ctx.lineTo(rx, cy0 + X_LIMIT * PPM); ctx.stroke();
    ctx.font = `500 10.5px ${P.font}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let c = -20; c <= 20; c += 5) {
      const gy = cy0 + (c / 100) * PPM;
      ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rx - 5, gy); ctx.lineTo(rx + 5, gy); ctx.stroke();
      ctx.fillStyle = P.muted;
      ctx.fillText(c === 0 ? '0' : String(c).replace('-', '−'), rx - 9, gy);
    }
    ctext(ctx, 'x (cm), positive downwards', rx + 2, cy0 - X_LIMIT * PPM - 14,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'center' });
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(rx, cy0); ctx.lineTo(rx, cy0 + st.x * PPM); ctx.stroke();

    /* status */
    const r = ratio(w0(), gam(), wd());
    ctext(ctx, st.sweep
      ? `sweeping — now at ${fmt(st.f, 2)} Hz, response ${fmt(r, 1)}× the drive`
      : `the mass oscillates at the driving frequency, ${fmt(r, 1)}× the drive`,
      PW / 2, PH - 12, { font: `500 11.5px ${P.font}`, color: P.muted, align: 'center' });

    if (st.ann) {
      callout(ctx, ['The generator moves 10 mm.',
                    'Near the natural frequency the mass',
                    'moves Q times further, because each',
                    'push arrives in step with the motion',
                    'and the energy accumulates.'],
        14, 200, CX - BW / 2, g.blockTop + BH / 2, { palette: P });
    }
  }

  /* ================================================================== *
   * the resonance curve
   * ================================================================== */

  /** round an axis top up to 1, 2, 2.5 or 5 times a power of ten */
  function niceTop(v) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-6))));
    for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
    return 10 * p;
  }

  function drawCurve() {
    const W = w0(), fMax = Math.max(3, (W / TAU) * 2.2);
    const g = gam();
    const curve = q => {
      const gq = W / q, pts = [];
      for (let i = 0; i <= 260; i++) {
        const f = fMax * i / 260;
        pts.push([f, Math.min(ratio(W, gq, TAU * f), 14)]);
      }
      return pts;
    };
    const mine = curve(st.Q);
    const peak = Math.max(...mine.map(p => p[1]));
    const yMax = niceTop(peak * 1.12);

    pR.setDomain([0, fMax], [0, yMax]);
    pR.clear(); pR.clearOverlay();

    // a faint family at other Q values, so the sharpening is visible at once
    for (const q of [1, 2, 4, 7, 10]) {
      if (Math.abs(q - st.Q) < 0.3) continue;
      pR.line(curve(q), { color: 'var(--ibs-accent)', width: 1.2, opacity: 0.22 });
    }
    pR.area(mine, { color: 'var(--ibs-accent)', opacity: 0.13 });
    pR.line(mine, { color: 'var(--ibs-accent)', width: 2.6 });

    // the natural frequency, and the peak, which is not at the same place
    const f0 = W / TAU, fr = resonantF();
    pR.vline(f0, { color: 'var(--ibs-text)', dash: '4 4', label: 'f₀' });
    if (Math.abs(fr - f0) / f0 > 0.01) {
      pR.gOver.appendChild(svg('circle', {
        cx: pR.X(fr), cy: pR.Y(ratio(W, g, TAU * fr)), r: 4,
        fill: 'none', stroke: 'var(--ibs-text)', 'stroke-width': 1.6,
      }));
    }
    pR.dot(st.f, Math.min(ratio(W, g, wd()), yMax), { color: 'var(--ibs-accent)', r: 5.5 });

    pR.gOver.appendChild(svg('text', {
      x: pR.w - pR.pad.r, y: pR.pad.t - 10, 'text-anchor': 'end',
      'font-size': 11.5, 'font-weight': 600, fill: 'var(--ibs-accent)',
      text: st.Q < Math.SQRT1_2
        ? 'Q < 0.71: so heavily damped that there is no peak at all'
        : `peak ${fmt(ratio(W, g, TAU * fr), 1)}× the drive, at ${fmt(fr, 2)} Hz`,
    }));
    pR.gOver.appendChild(svg('text', {
      x: pR.pad.l + 6, y: pR.pad.t - 10, 'text-anchor': 'start',
      'font-size': 11, 'font-weight': 500, fill: 'var(--ibs-muted)',
      text: 'faint curves: Q = 1, 2, 4, 7, 10',
    }));
  }

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) {
      if (st.sweep) {
        const nf = st.f + dt * st.speed * 0.05;
        if (nf > 3) { st.sweep = false; bSweep.setPressed(false); }
        else { st.f = nf; sF.set(nf); drawCurve(); }
      }
      integrate(dt);
      rec.push(st.t, [st.x * 100, sup(st.t) * 100]);
    }
    render();
  }

  function render() {
    drawRig();
    rec.draw(st.t, P);

    const W = w0(), g = gam(), f0 = W / TAU, fr = resonantF();
    const r = ratio(W, g, wd()), ph = phase(W, g, wd()) * 180 / Math.PI;
    out.setAll({
      f0: `${fmt(f0, 3)} Hz   (ω₀ ${fmt(W, 2)} rad s⁻¹)`,
      fd: `${fmt(st.f, 2)} Hz   (f/f₀ = ${fmt(st.f / f0, 2)})`,
      Q:  `${fmt(st.Q, 1)}   (γ = ${fmt(g, 2)} s⁻¹)`,
      fr: st.Q < Math.SQRT1_2 ? 'no peak: Q < 0.71' : `${fmt(fr, 3)} Hz`,
      AR: `${fmt(r, 2)} ×   (${fmt(r * A_DRIVE * 100, 1)} cm)`,
      AM: st.measA ? `${fmt(st.measA * 100, 2)} cm` : 'settling…',
      ph: `${fmt(ph, 1)}°`,
      bw: `${fmt(f0 / st.Q, 3)} Hz`,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(pR.svg.clientWidth || root.clientWidth || 1120);
    if (cw > 0) pR.setSize(clamp(cw, 340, 1120), cw < 700 ? 200 : 230);
    pv.fit(); tv.fit();
    drawCurve();
    render();
  }
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

  restart();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => { Object.assign(st, p); restart(); drawCurve(); render(); },
    _state: () => ({
      x: st.x, v: st.v, t: st.t, s: sup(st.t),
      w0: w0(), gam: gam(), wd: wd(), Q: st.Q, f: st.f,
      measA: st.measA, Tmeas: st.Tmeas,
      ratio: ratio(w0(), gam(), wd()),
      phase: phase(w0(), gam(), wd()),
      fr: resonantF(),
    }),
    _geom: (t, x) => geom(t, x),
    _clampX: x => clampX(x),
    _ratio: (a, b, c) => ratio(a, b, c),
    _phase: (a, b, c) => phase(a, b, c),
    _advance: seconds => {
      const n = Math.round(seconds / H);
      for (let i = 0; i < n; i++) stepOnce();
      return { x: st.x, v: st.v, t: st.t };
    },
    /** run to steady state and report the amplitude the motion settles at */
    _settle: seconds => {
      const n = Math.round(seconds / H);
      for (let i = 0; i < n; i++) stepOnce();
      let hi = 0;
      const m = Math.round((2 / Math.max(st.f, 0.05)) / H);
      for (let i = 0; i < m; i++) { stepOnce(); hi = Math.max(hi, Math.abs(st.x)); }
      return hi;
    },
  };
}
