/* ============================================================================
 * C1-1  Mass on a Spring
 * IB Physics C.1 Simple Harmonic Motion
 *
 * Built to the house pattern: one canvas for the apparatus, one for the
 * trace, controls beneath, and every number in the readout grid. Nothing
 * is written on top of the drawing except the displacement it is showing.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * A mass hangs on a vertical spring. Gravity stretches it by the static
 * extension e = mg/k and then plays no further part: measuring x from
 * that new equilibrium, the weight cancels exactly and what is left is
 *
 *     m x'' = -k x - b x'      or      x'' + gamma x' + omega_0^2 x = 0
 *
 * with omega_0 = sqrt(k/m) and gamma = b/m in s^-1, integrated with
 * classical fourth-order Runge-Kutta at a fixed 600 Hz substep, driven by
 * an accumulator so the motion is identical at any frame rate. With
 * gamma = 0 it reproduces x = A cos(omega_0 t) to better than a part in
 * 10^7 over a minute, which the verification script checks against the
 * closed form rather than assuming.
 *
 * Because the weight cancels, the period does not depend on g, and the
 * same spring and mass oscillate identically on the Moon. It does depend
 * on the mass, unlike a pendulum.
 *
 * ---------------------------------------------------------------------------
 * GEOMETRY, WHICH IS PART OF THE PHYSICS
 *
 * The drawn spring length is exactly the equilibrium length plus x, at a
 * fixed 600 px per metre, and x is clamped by one function that every
 * control and the drag handler both call. The spring therefore can never
 * be drawn shorter than its coil-bound length and the block can never
 * pass through the clamp. The verification script sweeps the whole
 * parameter space and asserts it frame by frame.
 *
 * The one thing not drawn to scale is the static extension mg/k, which
 * ranges over a factor of a hundred across the sliders and cannot share
 * a scale with anything. It is given in the readouts instead.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
  Recorder,
} from '../sim-kit.js';

/* ------------------------------------------------------- the apparatus */

const G = 9.81, TAU = Math.PI * 2;
const PW = 560, PH = 600, CX = PW / 2, CEIL = 110;
const TW = 622, TH = 300;
const PPM      = 600;    // px per metre, for displacement
const L_EQ     = 200;    // px, the drawn length of the spring at equilibrium
const L_BOUND  = 78;     // px, coil-bound: it cannot be drawn shorter
const X_LIMIT  = 0.18;   // m, the largest displacement the rig allows
const BW = 116, BH = 74; // px, the block
const H = 1 / 600;       // s, physics substep

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c1-mass-spring',
    title: 'Mass on a spring: simple harmonic motion',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    m: 0.50, k: 20, A: 0.12, gam: 0, speed: 1,
    playing: true, ann: false, drag: false,
    x: 0.12, v: 0, t: 0,
    lastUp: null, Tmeas: null, peak: 0, measA: 0.12,
  };

  const om0 = () => Math.sqrt(st.k / st.m);
  const acc = (x, v) => -(st.k / st.m) * x - st.gam * v;
  const energy = () => 0.5 * st.m * st.v * st.v + 0.5 * st.k * st.x * st.x;

  /** the one place displacement is bounded, so the picture can never break */
  const clampX = x => clamp(x, (L_BOUND - L_EQ) / PPM, X_LIMIT);

  /* ---------------------------------------------------------- surfaces */

  const pv = surface(PW, PH, { label: 'A mass oscillating on a vertical spring' });
  const tv = surface(TW, TH, { label: 'Displacement against time' });

  const rec = new Recorder(tv, {
    window: 14, xLabel: 't (s)', yLabel: 'x (cm)',
    pad: { l: 54, r: 14, t: 18, b: 52 },
  });
  rec.add('x', 'accent', { width: 1.9 });
  const sEnvU = rec.add('env+', 'muted', { width: 1.2, dash: [5, 4] });
  const sEnvL = rec.add('env-', 'muted', { width: 1.2, dash: [5, 4] });

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'om', label: '<i>ω</i><sub>0</sub> = √(<i>k</i>/<i>m</i>)' },
    { key: 'T0', label: '<i>T</i> = 2π√(<i>m</i>/<i>k</i>)' },
    { key: 'Tm', label: 'Measured <i>T</i> from the motion' },
    { key: 'ax', label: '<i>a</i>/<i>x</i>  (SHM needs this constant)' },
    { key: 'rg', label: 'Regime (<i>γ</i><sub>c</sub> = 2<i>ω</i><sub>0</sub>)' },
    { key: 'ex', label: 'Static extension <i>e</i> = <i>mg</i>/<i>k</i>' },
    { key: 'mA', label: 'Measured amplitude' },
    { key: 'E',  label: '<i>E</i> = ½<i>mv</i>² + ½<i>kx</i>²' },
    { key: 'x',  label: 'Displacement <i>x</i> (down positive)' },
    { key: 'v',  label: 'Velocity <i>v</i>' },
  ]);

  /* ---------------------------------------------------------- controls */

  function release() {
    st.x = clampX(st.A); st.v = 0; st.t = 0;
    st.lastUp = null; st.Tmeas = null; st.peak = 0; st.measA = Math.abs(st.x);
    rec.clear();
  }
  const retime = () => { st.lastUp = null; st.Tmeas = null; };

  const sM = slider({ label: '<i>m</i>', min: 0.1, max: 2, step: 0.05, value: st.m,
    format: v => `${v.toFixed(2)} kg`, onInput: v => { st.m = v; retime(); } });
  const sK = slider({ label: '<i>k</i>', min: 5, max: 80, step: 1, value: st.k,
    format: v => `${v.toFixed(0)} N m⁻¹`, onInput: v => { st.k = v; retime(); } });
  const sA = slider({ label: '<i>A</i>', min: 0.02, max: X_LIMIT, step: 0.01, value: st.A,
    format: v => `${(v * 100).toFixed(0)} cm`, onInput: v => { st.A = v; release(); } });
  const sG = slider({ label: '<i>γ</i>', min: 0, max: 16, step: 0.05, value: 0,
    format: v => `${v.toFixed(2)} s⁻¹`, onInput: v => { st.gam = v; retime(); } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.25, max: 2, step: 0.25, value: 1,
    format: v => `×${v.toFixed(2)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bRel = button({ label: 'Release again', onClick: () => release() });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });

  const preset = g => { st.gam = Math.min(16, g); sG.set(st.gam); retime(); };
  const bL = button({ label: 'light',    onClick: () => preset(0.15 * om0()) });
  const bC = button({ label: 'critical', onClick: () => preset(2 * om0()) });
  const bH = button({ label: 'heavy',    onClick: () => preset(4 * om0()) });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Mass on a Spring',
            'simple harmonic motion — drag the block and let go'),
    el('div', { class: 'ms-row' }, [
      el('div', { class: 'ms-left' }, [
        panelBox('Spring — drag the block to any displacement and release', pv.el),
      ]),
      el('div', { class: 'ms-right' }, [
        panelBox('Displacement–time trace x(t)', tv.el),
        controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bRel.node, bAnn.node])]),
        controls([el('div', { class: 'ibs-btns' }, [bL.node, bC.node, bH.node])],
                 { label: 'damping presets:' }),
        controls([sM.node, sK.node, sA.node, sG.node, sS.node]),
        out.node,
      ]),
    ]),
    note('<b>Physics.</b> Hanging the mass stretches the spring by ' +
         '<i>e</i> = <i>mg</i>/<i>k</i> and then gravity plays no further part: measured from ' +
         'that new equilibrium the weight cancels exactly, leaving ' +
         '<i>x</i>″ + <i>γx</i>′ + <i>ω</i><sub>0</sub>²<i>x</i> = 0 with ' +
         '<i>ω</i><sub>0</sub>² = <i>k</i>/<i>m</i>. It is integrated with 4th-order ' +
         'Runge–Kutta at 600 steps per second, so nothing here is a pre-computed animation. ' +
         'Undamped, the acceleration is exactly −(<i>k</i>/<i>m</i>)<i>x</i> at every instant — ' +
         'that constant ratio in the readouts <em>is</em> the definition of simple harmonic ' +
         'motion. Add damping and it stops being constant, because the acceleration now ' +
         'depends on the velocity too. Note that the period depends on the mass, unlike a ' +
         'pendulum, and not on <i>g</i>, so this rig keeps time unchanged on the Moon.')
  );

  const cssId = 'ibs-c1-massspring-v3';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent = `
.ibs .ms-row{ display:flex; gap:14px; align-items:flex-start; }
.ibs .ms-left{ width:562px; flex:none; }
.ibs .ms-right{ flex:1; min-width:560px; }
@container (max-width: 1150px){
  .ibs .ms-row{ flex-direction:column; }
  .ibs .ms-left{ width:100%; }
  .ibs .ms-right{ min-width:0; width:100%; }
}`;
    document.head.appendChild(s);
  }

  /* ================================================================== *
   * physics
   * ================================================================== */

  let accum = 0;

  /** the ONLY place the state advances, so the animation loop and the
   *  test harness cannot diverge */
  function stepOnce() {
    const x = st.x, v = st.v;
    const k1x = v,               k1v = acc(x, v);
    const k2x = v + H / 2 * k1v, k2v = acc(x + H / 2 * k1x, v + H / 2 * k1v);
    const k3x = v + H / 2 * k2v, k3v = acc(x + H / 2 * k2x, v + H / 2 * k2v);
    const k4x = v + H * k3v,     k4v = acc(x + H * k3x,     v + H * k3v);
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

  /* ================================================================== *
   * the apparatus
   * ================================================================== */

  let P = palette(root);

  /** geometry, exposed so the tests can assert the picture is possible */
  function geom() {
    const springLen = L_EQ + st.x * PPM;          // px, always > L_BOUND
    const blockTop = CEIL + springLen;
    return {
      springLen, blockTop, blockBot: blockTop + BH,
      eqTop: CEIL + L_EQ, bound: L_BOUND,
      cx: CX, ceil: CEIL, bw: BW, bh: BH, PW, PH, PPM, X_LIMIT,
    };
  }

  /** a coil spring drawn vertically with a constant number of turns */
  function drawSpring(ctx, y1, y2, turns) {
    const len = y2 - y1, lead = Math.min(16, len * 0.12), body = len - 2 * lead;
    const amp = clamp(26 - (L_EQ - len) * 0.05, 13, 30);
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

    /* ceiling clamp */
    ctx.fillStyle = P.soft;
    ctx.fillRect(CX - 84, CEIL - 24, 168, 24);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(CX - 84, CEIL); ctx.lineTo(CX + 84, CEIL); ctx.stroke();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    for (let x = CX - 80; x <= CX + 80; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, CEIL); ctx.lineTo(x - 9, CEIL - 16); ctx.stroke();
    }

    /* equilibrium line, the datum x = 0 */
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(CX - 150, g.eqTop + BH / 2); ctx.lineTo(CX + 150, g.eqTop + BH / 2);
    ctx.stroke(); ctx.restore();

    /* the spring and the block */
    drawSpring(ctx, CEIL, g.blockTop, 9);

    const bx = CX - BW / 2, by = g.blockTop;
    const gr = ctx.createLinearGradient(bx, by, bx + BW, by + BH);
    gr.addColorStop(0, '#5fa3ab');
    gr.addColorStop(0.35, '#005F6A');
    gr.addColorStop(1, '#00272d');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, BW, BH, 6)
                                   : ctx.rect(bx, by, BW, BH);
    ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.30; ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx + 7, by + 7, BW - 14, 11, 4)
                  : ctx.rect(bx + 7, by + 7, BW - 14, 11);
    ctx.fill(); ctx.restore();
    ctext(ctx, `${fmt(st.m, 2)} kg`, CX, by + BH / 2 + 5,
      { font: `600 14px ${P.font}`, color: '#fff', align: 'center' });
    if (st.drag) {
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx - 8, by - 8, BW + 16, BH + 16, 9)
                    : ctx.rect(bx - 8, by - 8, BW + 16, BH + 16);
      ctx.stroke(); ctx.restore();
    }

    /* velocity, from the block's edge so the block never hides it */
    if (!st.drag) {
      const sgn = Math.sign(st.v) || 1;
      const y0 = sgn > 0 ? g.blockBot : by;
      const dy = st.v * 60;
      if (carrow(ctx, CX + 74, y0, CX + 74, y0 + dy,
                 { color: P.accent, width: 2.4, head: 9, min: 7 })) {
        ctext(ctx, 'v', CX + 82, y0 + dy + 5,
          { font: P.sym(14), color: P.accent, halo: P.bg });
      }
    }

    /* the displacement ruler, to scale, on the left */
    const rx = CX - 122, cy0 = g.eqTop + BH / 2;
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx, cy0 - X_LIMIT * PPM); ctx.lineTo(rx, cy0 + X_LIMIT * PPM); ctx.stroke();
    ctx.font = `500 10px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let c = -15; c <= 15; c += 5) {
      const gy = cy0 + (c / 100) * PPM;
      ctx.beginPath(); ctx.moveTo(rx - 5, gy); ctx.lineTo(rx + 5, gy); ctx.stroke();
      ctx.fillText(c === 0 ? '0' : String(c).replace('-', '\u2212'), rx - 9, gy);
    }
    ctext(ctx, 'x (cm), positive downwards', rx + 2, cy0 - X_LIMIT * PPM - 14,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'center' });
    // the live displacement
    ctx.strokeStyle = P.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(rx, cy0); ctx.lineTo(rx, cy0 + st.x * PPM); ctx.stroke();

    /* status */
    ctext(ctx, st.drag
      ? `release to let go — x = ${fmt(st.x * 100, 1).replace('-', '−')} cm`
      : `natural frequency f₀ = ${fmt(om0() / TAU, 3)} Hz — drag the block to set a new amplitude`,
      PW / 2, PH - 10, { font: `500 11.5px ${P.font}`, color: P.muted, align: 'center' });

    if (st.ann) {
      callout(ctx, ['The spring pulls the block back towards',
                    'x = 0, and the further it is displaced the',
                    'harder it pulls. A restoring force exactly',
                    'proportional to displacement is what makes',
                    'the motion harmonic.'],
        14, 34, CX - BW / 2, by + BH / 2, { palette: P });
    }
  }

  /* ================================================================== *
   * drag the block
   * ================================================================== */

  const hit = pt => {
    const g = geom();
    return Math.abs(pt.x - CX) < BW / 2 + 16 &&
           pt.y > g.blockTop - 16 && pt.y < g.blockBot + 16;
  };
  const onDown = e => {
    if (!hit(pv.at(e))) return;
    st.drag = true; st.v = 0;
    pv.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = e => {
    const pt = pv.at(e);
    if (st.drag) {
      st.x = clampX((pt.y - BH / 2 - CEIL - L_EQ) / PPM);
      st.v = 0;
      pv.el.style.cursor = 'grabbing';
      e.preventDefault();
    } else {
      pv.el.style.cursor = hit(pt) ? 'grab' : 'default';
    }
  };
  const onUp = e => {
    if (!st.drag) return;
    st.drag = false;
    try { pv.el.releasePointerCapture(e.pointerId); } catch (_) {}
    st.v = 0; st.t = 0;
    st.A = Math.abs(st.x); sA.set(st.A);
    st.lastUp = null; st.Tmeas = null; st.peak = 0; st.measA = Math.abs(st.x);
    rec.clear();
    pv.el.style.cursor = 'default';
  };
  pv.el.addEventListener('pointerdown', onDown);
  pv.el.addEventListener('pointermove', onMove);
  pv.el.addEventListener('pointerup', onUp);
  pv.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    pv.el.removeEventListener('pointerdown', onDown);
    pv.el.removeEventListener('pointermove', onMove);
    pv.el.removeEventListener('pointerup', onUp);
    pv.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing && !st.drag) {
      integrate(dt);
      /* The envelope of a swing released FROM REST is not A e^(-gt/2):
       * x = A e^(-gt/2) (cos wd t + g/(2 wd) sin wd t), whose amplitude is
       * larger by sqrt(1 + g^2/4wd^2). Drawing the naive envelope would put
       * the curve outside its own envelope, which students notice. */
      const wd2 = om0() * om0() - st.gam * st.gam / 4;
      const under = st.gam > 0 && wd2 > 0;
      const env = under
        ? st.A * 100 * Math.sqrt(1 + st.gam * st.gam / (4 * wd2)) * Math.exp(-st.gam * st.t / 2)
        : null;
      rec.push(st.t, [st.x * 100, env, env == null ? null : -env]);
    }
    render();
  }

  function render() {
    drawRig();
    rec.draw(st.t, P);

    const W = om0(), T0 = TAU / W, gc = 2 * W, r = st.gam / gc;
    const a = acc(st.x, st.v);
    out.setAll({
      om: `${fmt(W, 2)} rad s⁻¹`,
      T0: `${fmt(T0, 3)} s   (f₀ ${fmt(1 / T0, 3)} Hz)`,
      Tm: st.Tmeas ? `${fmt(st.Tmeas, 3)} s` : 'measuring…',
      ax: Math.abs(st.x) < 1e-4 ? '— (x is zero just now)'
        : `${fmt(a / st.x, 1).replace('-', '−')} s⁻²` +
          (st.gam === 0 ? `  = −k/m` : '  (not constant)'),
      rg: st.gam === 0 ? 'undamped (γ = 0)'
        : Math.abs(r - 1) < 0.02 ? 'critical'
        : r < 1 ? `underdamped  (Q = ${fmt(W / st.gam, 1)})` : 'overdamped',
      ex: `${fmt(st.m * G / st.k * 100, 1)} cm  (not drawn to scale)`,
      mA: `${fmt(st.measA * 100, 1)} cm`,
      E:  `${fmt(energy() * 1000, 2)} mJ`,
      x:  `${fmt(st.x * 100, 2).replace('-', '−')} cm`,
      v:  `${fmt(st.v, 3).replace('-', '−')} m s⁻¹`,
    });
  }

  function fitAll() { P = palette(root); pv.fit(); tv.fit(); render(); }
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

  release();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      const re = p.A != null;
      Object.assign(st, p);
      if (re) release();
      render();
    },
    _state: () => ({
      x: st.x, v: st.v, t: st.t, a: acc(st.x, st.v),
      om0: om0(), T0: TAU / om0(), gam: st.gam, k: st.k, m: st.m,
      Tmeas: st.Tmeas, measA: st.measA, E: energy(),
    }),
    _geom: () => ({ ...geom(), L_EQ, L_BOUND, BW, BH, CEIL }),
    _clampX: x => clampX(x),
    /** advance using the very same stepper the animation loop uses */
    _advance: seconds => {
      const n = Math.round(seconds / H);
      for (let i = 0; i < n; i++) stepOnce();
      return { x: st.x, v: st.v, t: st.t };
    },
    _reset: (x0, v0) => {
      st.x = clampX(x0); st.v = v0 || 0; st.t = 0;
      st.measA = Math.abs(st.x); st.peak = 0; st.lastUp = null; st.Tmeas = null;
    },
  };
}
