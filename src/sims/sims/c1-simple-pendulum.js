/* ============================================================================
 * C1-6  Simple Pendulum
 * IB Physics C.1 Simple Harmonic Motion
 *
 * Built to the house pattern: one canvas for the apparatus, one for the
 * trace, controls beneath, and every number in the readout grid. Nothing
 * is written on top of the drawing except the angle it is showing, because
 * a diagram stays readable only while it is a diagram.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * Taking moments about the pivot for a point bob on a light rod,
 *
 *     theta'' + gamma theta' + omega_0^2 sin(theta) = 0,   omega_0^2 = g/L
 *
 * integrated with classical fourth-order Runge-Kutta at a fixed 600 Hz
 * substep, driven by an accumulator so the motion is identical at any
 * frame rate. gamma = b / mL^2 is the damping constant in s^-1, and the
 * motion is underdamped, critical or overdamped according to whether
 * gamma is below, equal to or above gamma_c = 2 omega_0.
 *
 * THE SMALL-ANGLE APPROXIMATION
 *
 * Replacing sin(theta) by theta makes the equation exactly SHM, with
 * period T_0 = 2 pi sqrt(L/g). That solution is drawn as a faint ghost
 * beside the real bob. Below about 10 degrees the two are the same line.
 * At 60 degrees the ghost runs visibly ahead, because the true period is
 * longer. For the undamped pendulum the true period is
 *
 *     T = T_0 / AGM(1, cos(theta_0 / 2))
 *
 * where AGM is the arithmetic-geometric mean: not a truncated series, but
 * exact to machine precision in four iterations. The verification script
 * checks it against a Simpson quadrature of the elliptic integral and
 * against the period the integrator actually produces.
 *
 * ---------------------------------------------------------------------------
 * ONE VISUAL CONVENTION
 *
 * The drawn length is compressed, 170 px to 290 px across the whole range
 * of L, so the apparatus fills the frame whatever length is set. The true
 * length is on the slider and every period in the readouts is computed
 * from it, never from the drawing.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
  Recorder,
} from '../sim-kit.js';

/* ------------------------------------------------------- the apparatus */

const G = 9.81, MASS = 0.10, DEG = 180 / Math.PI, TAU = Math.PI * 2;
const PW = 560, PH = 640, PIVX = PW / 2, PIVY = 290, RB = 32;
/** the furthest the bob may be dragged: beyond this it would leave the frame */
const TH_DRAG = 135 / (180 / Math.PI);
const TW = 622, TH = 300;
const L_MIN = 0.30, L_MAX = 1.50;
const H = 1 / 600;                       // s, physics substep

/** Drawn length: 150…242 px, so the rig fills the frame at every L AND the
 *  bob still fits inside it at full swing. PW/2 - RB - 4 = 244 px is the
 *  furthest the centre of the bob may ever be from the pivot. */
const Lpix = L => 150 + (L - L_MIN) * (92 / (L_MAX - L_MIN));

/** exact period factor T/T0 for an undamped pendulum of amplitude th0,
 *  from the arithmetic-geometric mean. Converges quadratically. */
export function periodFactor(th0) {
  const a0 = Math.abs(th0);
  if (a0 < 1e-9) return 1;
  let a = 1, b = Math.cos(Math.min(a0, Math.PI - 1e-9) / 2);
  for (let i = 0; i < 8; i++) {
    const na = (a + b) / 2, nb = Math.sqrt(a * b);
    if (Math.abs(na - nb) < 1e-16) { a = na; b = nb; break; }
    a = na; b = nb;
  }
  return 1 / a;
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c1-simple-pendulum',
    title: 'Simple pendulum: simple harmonic motion and the small-angle approximation',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    L: 0.75, th0: 20, gam: 0, speed: 1,
    playing: true, ann: false, ghost: true, drag: false,
    th: 20 / DEG, w: 0, t: 0,
    lastUp: null, Tmeas: null, peak: 0, measA: 20 / DEG,
  };

  const om0 = () => Math.sqrt(G / st.L);
  const acc = (th, w) => -(G / st.L) * Math.sin(th) - st.gam * w;
  const energy = () => 0.5 * MASS * st.L * st.L * st.w * st.w
                     + MASS * G * st.L * (1 - Math.cos(st.th));

  /* ---------------------------------------------------------- surfaces */

  const pv = surface(PW, PH, { label: 'A pendulum swinging on a rod' });
  const tv = surface(TW, TH, { label: 'Angle against time' });

  const rec = new Recorder(tv, {
    window: 14, xLabel: 't (s)', yLabel: 'θ (°)',
    pad: { l: 52, r: 14, t: 18, b: 52 },
  });
  rec.add('theta', 'accent', { width: 1.9 });
  const sGhost = rec.add('ghost', 'muted', { width: 1.3, dash: [5, 4] });

  const trail = [];

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'om', label: '<i>ω</i><sub>0</sub> = √(<i>g</i>/<i>L</i>)' },
    { key: 'T0', label: 'Small angle <i>T</i><sub>0</sub> = 2π√(<i>L</i>/<i>g</i>)' },
    { key: 'Te', label: 'Exact <i>T</i> = <i>T</i><sub>0</sub> / AGM(1, cos <i>θ</i><sub>0</sub>/2)' },
    { key: 'Tm', label: 'Measured <i>T</i> from the motion' },
    { key: 'er', label: 'Error in the small-angle period' },
    { key: 'rg', label: 'Regime (<i>γ</i><sub>c</sub> = 2<i>ω</i><sub>0</sub>)' },
    { key: 'mA', label: 'Measured amplitude' },
    { key: 'E',  label: '<i>E</i> = KE + PE' },
  ]);

  /* ---------------------------------------------------------- controls */

  function release() {
    st.th = st.th0 / DEG; st.w = 0; st.t = 0;
    st.lastUp = null; st.Tmeas = null; st.peak = 0; st.measA = Math.abs(st.th);
    rec.clear(); trail.length = 0;
  }
  const retime = () => { st.lastUp = null; st.Tmeas = null; };

  const sL = slider({ label: '<i>L</i>', min: L_MIN, max: L_MAX, step: 0.05, value: st.L,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.L = v; retime(); release(); } });
  const sA = slider({ label: 'θ<sub>0</sub>', min: 5, max: 90, step: 5, value: st.th0,
    format: v => `${v.toFixed(0)}°`, onInput: v => { st.th0 = v; release(); } });
  const sG = slider({ label: '<i>γ</i>', min: 0, max: 12, step: 0.05, value: 0,
    format: v => `${v.toFixed(2)} s⁻¹`, onInput: v => { st.gam = v; retime(); } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.25, max: 2, step: 0.25, value: 1,
    format: v => `×${v.toFixed(2)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bRel = button({ label: 'Release again', onClick: () => release() });
  const bGho = button({ label: 'Small-angle ghost', pressed: true, onClick: b => {
    st.ghost = !st.ghost;
    sGhost.hidden = !st.ghost;
    b.setAttribute('aria-pressed', String(st.ghost));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });

  const preset = g => { st.gam = Math.min(12, g); sG.set(st.gam); retime(); };
  const bL = button({ label: 'light',    onClick: () => preset(0.15 * om0()) });
  const bC = button({ label: 'critical', onClick: () => preset(2 * om0()) });
  const bH = button({ label: 'heavy',    onClick: () => preset(4 * om0()) });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Simple Pendulum',
            'simple harmonic motion and the small-angle approximation — drag the bob and let go'),
    el('div', { class: 'sp-row' }, [
      el('div', { class: 'sp-left' }, [
        panelBox('Pendulum — drag the bob to any angle and release', pv.el),
      ]),
      el('div', { class: 'sp-right' }, [
        panelBox('Angle–time trace θ(t)', tv.el),
        controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bRel.node, bGho.node, bAnn.node])]),
        controls([el('div', { class: 'ibs-btns' }, [bL.node, bC.node, bH.node])],
                 { label: 'damping presets:' }),
        controls([sL.node, sA.node, sG.node, sS.node]),
        out.node,
      ]),
    ]),
    note('<b>Physics.</b> The simulation integrates the full nonlinear equation ' +
         '<i>θ</i>″ + <i>γθ</i>′ + <i>ω</i><sub>0</sub>²&thinsp;sin&thinsp;<i>θ</i> = 0 ' +
         'with 4th-order Runge–Kutta at 600 steps per second, where ' +
         '<i>ω</i><sub>0</sub>² = <i>g</i>/<i>L</i> and <i>γ</i> = <i>b</i>/<i>mL</i>² ' +
         '(<i>m</i> = 0.10 kg, <i>g</i> = 9.81 m&thinsp;s⁻²). Replacing sin&thinsp;<i>θ</i> by ' +
         '<i>θ</i> gives simple harmonic motion of period ' +
         '<i>T</i><sub>0</sub> = 2π√(<i>L</i>/<i>g</i>), drawn as the faint ghost beside the ' +
         'bob. Below about 10° the two coincide. Raise <i>θ</i><sub>0</sub> and the ghost runs ' +
         'ahead, because sin&thinsp;<i>θ</i> &lt; <i>θ</i> makes the real restoring torque ' +
         'weaker and the real period longer — at 90° it is 18% longer. Drag the bob to any ' +
         'angle and release it.')
  );

  const cssId = 'ibs-c1-pendulum-v3';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent = `
.ibs .sp-row{ display:flex; gap:14px; align-items:flex-start; }
.ibs .sp-left{ width:562px; flex:none; }
.ibs .sp-right{ flex:1; min-width:560px; }
@container (max-width: 1150px){
  .ibs .sp-row{ flex-direction:column; }
  .ibs .sp-left{ width:100%; }
  .ibs .sp-right{ min-width:0; width:100%; }
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
    const th = st.th, w = st.w;
    const k1t = w,               k1w = acc(th, w);
    const k2t = w + H / 2 * k1w, k2w = acc(th + H / 2 * k1t, w + H / 2 * k1w);
    const k3t = w + H / 2 * k2w, k3w = acc(th + H / 2 * k2t, w + H / 2 * k2w);
    const k4t = w + H * k3w,     k4w = acc(th + H * k3t,     w + H * k3w);
    st.th += H / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
    st.w  += H / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
    st.t  += H;

    // period measured from the motion, by interpolating upward zero crossings
    if (th < 0 && st.th >= 0) {
      const tc = st.t - H + (-th / (st.th - th)) * H;
      if (st.lastUp != null) st.Tmeas = tc - st.lastUp;
      st.lastUp = tc;
    }
    // amplitude measured from successive turning points
    if (Math.abs(st.th) > st.peak) st.peak = Math.abs(st.th);
    if (w > 0 && st.w <= 0) { st.measA = st.peak; st.peak = 0; }
  }

  function integrate(dt) {
    accum += Math.min(dt, 0.12) * st.speed;
    let guard = 0;
    while (accum >= H && guard++ < 2000) { stepOnce(); accum -= H; }
  }

  /** the linearised solution: SHM with the same gamma, released from rest */
  function ghostAngle(t) {
    const W = om0(), g = st.gam, th0 = st.th0 / DEG;
    const disc = W * W - g * g / 4;
    if (disc > 1e-12) {
      const wd = Math.sqrt(disc);
      return th0 * Math.exp(-g * t / 2) * (Math.cos(wd * t) + (g / (2 * wd)) * Math.sin(wd * t));
    }
    if (disc > -1e-12) return th0 * (1 + W * t) * Math.exp(-W * t);
    const r = Math.sqrt(-disc), a = -g / 2 + r, b = -g / 2 - r;
    return th0 * (b * Math.exp(a * t) - a * Math.exp(b * t)) / (b - a);
  }

  /* ================================================================== *
   * the apparatus
   * ================================================================== */

  let P = palette(root);

  const bobPos = (th = st.th) => {
    const L = Lpix(st.L);
    return [PIVX + L * Math.sin(th), PIVY + L * Math.cos(th), L];
  };

  function drawPend() {
    const ctx = pv.ctx;
    const [bx, by, L] = bobPos();
    ctx.clearRect(0, 0, PW, PH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, PW, PH);

    /* wall mount */
    ctx.fillStyle = P.soft;
    ctx.fillRect(PIVX - 58, PIVY - 32, 116, 22);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(PIVX - 58, PIVY - 10); ctx.lineTo(PIVX + 58, PIVY - 10); ctx.stroke();
    ctx.strokeStyle = P.muted; ctx.lineWidth = 1;
    for (let x = PIVX - 54; x <= PIVX + 54; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, PIVY - 10); ctx.lineTo(x - 9, PIVY - 26); ctx.stroke();
    }

    /* vertical reference */
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PIVX, PIVY); ctx.lineTo(PIVX, PIVY + L + 50); ctx.stroke();
    ctx.restore();

    /* the path the bob has just swept */
    for (let q = 0; q < trail.length; q++) {
      ctx.save();
      ctx.globalAlpha = 0.25 * q / trail.length; ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.arc(PIVX + L * Math.sin(trail[q]), PIVY + L * Math.cos(trail[q]), 3, 0, TAU);
      ctx.fill(); ctx.restore();
    }

    /* the small-angle ghost: same rig, linearised equation */
    if (st.ghost && !st.drag) {
      const tg = ghostAngle(st.t);
      const gx = PIVX + L * Math.sin(tg), gy = PIVY + L * Math.cos(tg);
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(PIVX, PIVY); ctx.lineTo(gx, gy); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(gx, gy, RB - 6, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    /* angle arc and its label, the one thing written on the drawing */
    const aR = Math.min(84, L * 0.44);
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(PIVX, PIVY, aR, Math.PI / 2, Math.PI / 2 - st.th, st.th > 0);
    ctx.stroke();
    /* The wedge between the rod and the vertical is thin at small angles and
     * the ghost rod lies inside it, so the label goes on the far side of the
     * vertical, where only the dashed reference line ever runs. */
    if (Math.abs(st.th) > 0.02) {
      const la = Math.PI / 2 + Math.sign(st.th) * 0.5;
      ctext(ctx, `θ = ${fmt(st.th * DEG, 1).replace('-', '\u2212')}°`,
        PIVX + (aR + 22) * Math.cos(la), PIVY + (aR + 22) * Math.sin(la) + 5,
        { font: P.sym(16), color: P.text, align: st.th > 0 ? 'right' : 'left',
          halo: P.bg, haloWidth: 5 });
    }

    /* rod */
    ctx.strokeStyle = P.text; ctx.lineWidth = 4; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(PIVX, PIVY); ctx.lineTo(bx, by); ctx.stroke();

    /* the bob: collar, gradient sphere, equator and shine */
    const ux = (bx - PIVX) / Math.max(L, 1), uy = (by - PIVY) / Math.max(L, 1);
    ctx.save();
    ctx.translate(bx - ux * RB, by - uy * RB);
    ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
    ctx.fillStyle = '#00323a';
    ctx.fillRect(-7, -10, 14, 12);
    ctx.beginPath(); ctx.arc(0, -10, 4.6, 0, TAU); ctx.fill();
    ctx.restore();

    const gr = ctx.createRadialGradient(bx - 10, by - 11, 4, bx, by, RB);
    gr.addColorStop(0, '#dceef0');
    gr.addColorStop(0.28, '#5fa3ab');
    gr.addColorStop(0.70, '#005F6A');
    gr.addColorStop(1, '#00272d');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(bx, by, RB, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.30)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(bx, by, RB - 5, (RB - 5) * 0.42, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx - 6, by - 7, RB - 13, -2.5, -1.35); ctx.stroke();
    if (st.drag) {
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(bx, by, RB + 8, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    /* velocity, tangential, starting at the rim so the bob never hides it */
    const vt = st.w * st.L;
    if (!st.drag) {
      const tx = Math.cos(st.th), ty = -Math.sin(st.th);
      const sgn = Math.sign(vt) || 1;
      const x0 = bx + tx * sgn * RB, y0 = by + ty * sgn * RB;
      const dx = tx * vt * 34, dy = ty * vt * 34;
      if (carrow(ctx, x0, y0, x0 + dx, y0 + dy,
                 { color: P.accent, width: 2.4, head: 9, min: 7 })) {
        ctext(ctx, 'v', x0 + dx + sgn * 8, y0 + dy + 5,
          { font: P.sym(14), color: P.accent, align: sgn > 0 ? 'left' : 'right', halo: P.bg });
      }
    }

    /* pivot */
    ctx.fillStyle = P.bg; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(PIVX, PIVY, 7, 0, TAU); ctx.fill(); ctx.stroke();

    /* status */
    ctext(ctx, st.drag
      ? `release to let go — θ = ${fmt(st.th * DEG, 0).replace('-', '\u2212')}°`
      : `natural frequency f₀ = ${fmt(om0() / TAU, 3)} Hz — drag the bob to set a new starting angle`,
      PW / 2, PH - 10, { font: `500 11.5px ${P.font}`, color: P.muted, align: 'center' });

    if (st.ann) {
      callout(ctx, ['Restoring torque −mgL sinθ pulls the',
                    'bob back to vertical. It is smaller than',
                    'the −mgLθ that SHM assumes, so the real',
                    'swing takes longer than T₀.'],
        18, 34, PIVX - 40, PIVY + 56, { palette: P });
    }
  }

  /* ================================================================== *
   * drag the bob
   * ================================================================== */

  const onDown = e => {
    const pt = pv.at(e), [bx, by] = bobPos();
    if (Math.hypot(pt.x - bx, pt.y - by) > RB + 16) return;
    st.drag = true; st.w = 0; trail.length = 0;
    pv.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = e => {
    const pt = pv.at(e);
    if (st.drag) {
      st.th = clamp(Math.atan2(pt.x - PIVX, pt.y - PIVY), -TH_DRAG, TH_DRAG);
      st.w = 0;
      pv.el.style.cursor = 'grabbing';
      e.preventDefault();
    } else {
      const [bx, by] = bobPos();
      pv.el.style.cursor = Math.hypot(pt.x - bx, pt.y - by) < RB + 16 ? 'grab' : 'default';
    }
  };
  const onUp = e => {
    if (!st.drag) return;
    st.drag = false;
    try { pv.el.releasePointerCapture(e.pointerId); } catch (_) {}
    st.w = 0; st.t = 0;
    st.th0 = Math.abs(st.th * DEG);
    sA.set(Math.round(clamp(st.th0, 5, 90)));
    st.lastUp = null; st.Tmeas = null; st.peak = 0; st.measA = Math.abs(st.th);
    rec.clear(); trail.length = 0;
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
      rec.push(st.t, [st.th * DEG, st.ghost ? ghostAngle(st.t) * DEG : null]);
      trail.push(st.th);
      if (trail.length > 60) trail.shift();
    }
    render();
  }

  function render() {
    drawPend();
    rec.draw(st.t, P);

    const W = om0(), T0 = TAU / W, Tex = T0 * periodFactor(st.measA);
    const gc = 2 * W, r = st.gam / gc;
    out.setAll({
      om: `${fmt(W, 2)} rad s⁻¹`,
      T0: `${fmt(T0, 3)} s   (f₀ ${fmt(1 / T0, 3)} Hz)`,
      Te: st.gam === 0 ? `${fmt(Tex, 3)} s` : '— (only for γ = 0)',
      Tm: st.Tmeas ? `${fmt(st.Tmeas, 3)} s` : 'measuring…',
      er: st.gam === 0 ? `T₀ is ${fmt(100 * (Tex - T0) / Tex, 2)}% short` : '—',
      rg: st.gam === 0 ? 'undamped (γ = 0)'
        : Math.abs(r - 1) < 0.02 ? 'critical'
        : r < 1 ? `underdamped  (Q = ${fmt(W / st.gam, 1)})` : 'overdamped',
      mA: `${fmt(st.measA * DEG, 1)}°`,
      E:  `${fmt(energy() * 1000, 2)} mJ`,
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
      const re = p.th0 != null || p.L != null;
      Object.assign(st, p);
      if (re) release();
      render();
    },
    _state: () => ({
      th: st.th, w: st.w, t: st.t, alpha: acc(st.th, st.w),
      L: st.L, gam: st.gam, om0: om0(), T0: TAU / om0(),
      Tmeas: st.Tmeas, measA: st.measA,
      Texact: (TAU / om0()) * periodFactor(st.measA),
      E: energy(),
      tension: MASS * (G * Math.cos(st.th) + st.L * st.w * st.w),
    }),
    _geom: () => {
      const [bx, by, L] = bobPos();
      return { bx, by, Lpx: L, RB, PIVX, PIVY, PW, PH, TH_DRAG };
    },
    _ghost: t => ghostAngle(t),
    _clampDrag: t => clamp(t, -TH_DRAG, TH_DRAG),
    _factor: a => periodFactor(a),
    /** advance using the very same stepper the animation loop uses */
    _advance: seconds => {
      const n = Math.round(seconds / H);
      for (let i = 0; i < n; i++) stepOnce();
      return { th: st.th, w: st.w, t: st.t };
    },
    _reset: (th0, w0) => {
      st.th = th0; st.w = w0 || 0; st.t = 0;
      st.measA = Math.abs(th0); st.peak = 0; st.lastUp = null; st.Tmeas = null;
    },
  };
}
