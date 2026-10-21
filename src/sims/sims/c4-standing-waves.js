/* ============================================================================
 * C4-1  Standing Waves from Superposition
 * IB Physics C.4 Standing Waves and Resonance
 *
 * Built to the house pattern: canvases for the two waves and for their sum,
 * a live comparison table, controls beneath, and every number in the readout
 * grid.
 *
 * ---------------------------------------------------------------------------
 * THE THING THAT USUALLY GETS SKIPPED
 *
 * A standing wave is not a kind of wave. It is what you get when two ordinary
 * travelling waves cross. The top panel shows the two waves separately, the
 * bottom panel shows nothing but their sum, and the reflection slider fades
 * the second one away. Turn it to zero and the pattern travels; turn it back
 * up and it stops. That is the whole argument, and it is made by the picture
 * rather than asserted in a caption.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 *     y1 = A1 sin(k1 x - w1 t)        travelling to the right
 *     y2 = A2 sin(k2 x + w2 t)        travelling to the left
 *
 * evaluated in closed form, never integrated. With A1 = A2 and the two
 * identical, the sum collapses to
 *
 *     y = 2A sin(k x) cos(w t)
 *
 * which is a standing wave: every point oscillates in step, the amplitude
 * varies from 0 to 2A along the medium, and the pattern goes nowhere. Nodes
 * sit at x = n lambda/2, so ADJACENT NODES ARE HALF A WAVELENGTH APART, which
 * is the fact every harmonics question depends on.
 *
 * PARTIAL REFLECTION
 *
 * With A2 < A1 the minima no longer reach zero. The ratio of the largest to
 * the smallest amplitude,
 *
 *     SWR = (A1 + A2) / (A1 - A2)
 *
 * is infinite for a perfect standing wave and 1 for a purely travelling one,
 * and it is what tells you how good the reflection was.
 *
 * DETUNING
 *
 * If the returning wave comes back at a slightly different frequency, both
 * waves keep the same speed, so k2 = k1 (1 + delta) as well. Adding the two,
 *
 *     y1 + y2 = 2A sin( (k1+k2)x/2 + (w2-w1)t/2 ) cos( (k1-k2)x/2 - (w1+w2)t/2 )
 *
 * so the envelope itself travels, at
 *
 *     u = -(w2 - w1) / (k1 + k2)  ~  -v delta / 2
 *
 * The nodes crawl along the medium instead of staying put. That is why a
 * standing wave needs the reflection to return at exactly the same frequency,
 * and it is the motivation for everything about resonant lengths. The
 * verification script measures that drift speed from the drawn pattern and
 * checks it against this expression.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120;                    // full width of every canvas
const HA = 214, HB = 246;           // the two panels
const L_MEDIUM = 6.0;               // m
const PAD_L = 62, PAD_R = 58;

const F_MIN = 0.10, F_MAX = 1.50;   // Hz
const L_MIN = 0.80, L_MAX = 3.00;   // m
const A1 = 1.00;                    // cm, the incident wave, fixed
const PX_CM = 30;                   // px per cm of displacement

function metrics(w) {
  const X0 = PAD_L, X1 = w - PAD_R;
  return { X0, X1, PPM: (X1 - X0) / L_MEDIUM };
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c4-standing-waves',
    title: 'Standing waves from superposition',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    f: 0.40, lam: 2.00, refl: 1.00, detune: 0,
    t: 0, speed: 1, playing: true, ann: false, ghosts: true, dragging: false,
    xp: 1.00,                        // m, the probe
  };

  const vOf = () => st.f * st.lam;
  const w1  = () => TAU * st.f;
  const k1  = () => TAU / st.lam;
  /** the returning wave keeps the same speed, so its k scales with its f */
  const w2  = () => w1() * (1 + st.detune);
  const k2  = () => k1() * (1 + st.detune);
  const A2  = () => A1 * st.refl;

  const y1 = (x, t) => A1    * Math.sin(k1() * x - w1() * t);
  const y2 = (x, t) => A2()  * Math.sin(k2() * x + w2() * t);
  const ys = (x, t) => y1(x, t) + y2(x, t);

  /**
   * The envelope at a point: the largest |sum| that point ever reaches.
   *
   * Sampling a cycle and taking the maximum is the obvious way and it is
   * wrong: 24 samples miss the true peak by up to cos(pi/24), which is 0.86%,
   * and that systematic shortfall lands straight in the node positions and
   * the standing wave ratio. Two sinusoids of the same frequency add to a
   * third whose amplitude is exact in closed form, so that is what is used.
   *
   *   y = A1 sin(p1 - w tau) + A2 sin(p2 + w tau)
   *     = cos(w tau) [A1 sin p1 + A2 sin p2] + sin(w tau) [A2 cos p2 - A1 cos p1]
   *
   * and the amplitude is the hypotenuse of those two brackets. With the two
   * frequencies detuned it is the local envelope, taken at this instant,
   * which is what the picture wants anyway.
   */
  function envelope(x, t) {
    const p1 = k1() * x - w1() * t;
    const p2 = k2() * x + w2() * t;
    const a2 = A2();
    return Math.hypot(A1 * Math.sin(p1) + a2 * Math.sin(p2),
                      a2 * Math.cos(p2) - A1 * Math.cos(p1));
  }

  /* The envelope is shared by the drawing, the table and the readouts, so it
   * is computed once per frame rather than three times over. */
  let FD = null;
  function frameData() {
    if (FD && FD.t === st.t && FD.key === paramKey()) return FD;
    const N = 600, step = L_MEDIUM / N, env = [];
    for (let i = 0; i <= N; i++) env.push(envelope(i * step, st.t));

    /* Nodes are bracketed on that grid and then found properly by ternary
     * search. A coarse grid alone quantises every node to one step, which is
     * 10 mm here, and that is the same size as the drift a 1% detune produces
     * in several seconds: the measurement would be swamped by its own grid.
     *
     * With the reflection switched off the envelope is dead flat, and then
     * every sample is a "local minimum" to within rounding. A pattern has to
     * actually vary before any of its dips mean anything, so nothing is
     * reported unless the envelope varies by more than a fiftieth of itself. */
    const eMax = Math.max(...env), eMin = Math.min(...env);
    const varies = eMax - eMin > 0.02 * eMax;
    const refine = (i, wantMin) => {
      let lo = (i - 1) * step, hi = (i + 1) * step;
      for (let q = 0; q < 48; q++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        const better = wantMin ? envelope(m1, st.t) < envelope(m2, st.t)
                               : envelope(m1, st.t) > envelope(m2, st.t);
        if (better) hi = m2; else lo = m1;
      }
      const x = (lo + hi) / 2;
      return { x, e: envelope(x, st.t) };
    };
    const nd = [], an = [];
    if (varies) {
      const loCut = eMin + 0.25 * (eMax - eMin);
      const hiCut = eMax - 0.25 * (eMax - eMin);
      for (let i = 1; i < N; i++) {
        if (env[i] < env[i - 1] && env[i] <= env[i + 1] && env[i] < loCut) {
          nd.push(refine(i, true));
        } else if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > hiCut) {
          an.push(refine(i, false));
        }
      }
    }
    FD = { t: st.t, key: paramKey(), env, step, N, nd, an, eMax, eMin };
    return FD;
  }
  const paramKey = () =>
    `${st.f}|${st.lam}|${st.refl}|${st.detune}|${av.w}`;

  /* ---------------------------------------------------------- surfaces */

  const av = surface(MW, HA, { label: 'The two travelling waves, drawn separately' });
  const bv = surface(MW, HB, { label: 'The sum of the two waves' });

  const M  = () => metrics(av.w);
  const xPix = (x, m) => m.X0 + x * m.PPM;
  const xMet = (px, m) => clamp((px - m.X0) / m.PPM, 0, L_MEDIUM);

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'f',  label: 'Frequency <i>f</i>, wavelength <i>λ</i>' },
    { key: 'v',  label: 'Speed of each wave, <i>v</i> = <i>fλ</i>' },
    { key: 'ns', label: 'Node spacing, measured from the pattern' },
    { key: 'nl', label: 'Half a wavelength, for comparison' },
    { key: 'sw', label: 'Reflected amplitude, and SWR = (<i>A</i>₁+<i>A</i>₂)/(<i>A</i>₁−<i>A</i>₂)' },
    { key: 'dr', label: 'Speed the pattern itself moves at' },
    { key: 'pb', label: 'Probe: position, and the amplitude there' },
    { key: 'pc', label: 'What the probe is sitting on' },
  ]);

  /* ------------------------------------------------------- the table */

  const tbody = el('tbody');
  const table = el('table', { class: 'sw-table' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: '' }),
      el('th', { html: 'one travelling wave <span>(slide reflection to 0)</span>' }),
      el('th', { html: 'the sum <span>(slide it back to 1)</span>' }),
    ])]),
    tbody,
  ]);

  /* ---------------------------------------------------------- controls */

  const sF = slider({ label: '<i>f</i>', min: F_MIN, max: F_MAX, step: 0.01, value: st.f,
    format: v => `${v.toFixed(2)} Hz`, onInput: v => { st.f = v; } });
  const sL = slider({ label: '<i>λ</i>', min: L_MIN, max: L_MAX, step: 0.01, value: st.lam,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.lam = v; } });
  const sR = slider({ label: 'reflection', word: true, min: 0, max: 1, step: 0.01, value: 1,
    format: v => v === 0 ? 'none' : v === 1 ? 'perfect' : `${(v * 100).toFixed(0)}%`,
    onInput: v => { st.refl = v; } });
  const sD = slider({ label: 'detune', word: true, min: -4, max: 4, step: 0.1, value: 0,
    format: v => v === 0 ? 'exact' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`,
    onInput: v => { st.detune = v / 100; } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.1, max: 1.5, step: 0.1, value: 1,
    format: v => `×${v.toFixed(1)}`, onInput: v => { st.speed = v; } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bRel = button({ label: 'Restart', onClick: () => { st.t = 0; } });
  const bGh = button({ label: 'Ghosts of earlier instants', pressed: true, onClick: b => {
    st.ghosts = !st.ghosts; b.setAttribute('aria-pressed', String(st.ghosts));
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });
  const bPerfect = button({ label: 'perfect reflection', onClick: () => {
    st.refl = 1; st.detune = 0; sR.set(1); sD.set(0);
  } });
  const bTrav = button({ label: 'no reflection', onClick: () => { st.refl = 0; sR.set(0); } });
  const bDetune = button({ label: 'slightly off', onClick: () => {
    st.refl = 1; st.detune = 0.015; sR.set(1); sD.set(1.5);
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Standing Waves from Superposition',
            'two travelling waves crossing — and what their sum does'),
    panelBox('The two waves, drawn separately', av.el),
    panelBox('Nothing but their sum — drag to move the probe', bv.el),
    panelBox('Travelling or standing? Filled in from what is on screen now', table),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bRel.node, bGh.node, bAnn.node])]),
    controls([el('div', { class: 'ibs-btns' }, [bPerfect.node, bTrav.node, bDetune.node])],
             { label: 'try:' }),
    controls([sF.node, sL.node, sR.node, sD.node, sS.node]),
    out.node,
    note('<b>Superposition.</b> A standing wave is not a new kind of wave. It is what two ' +
         'ordinary travelling waves do when they cross. Slide <b>reflection</b> to zero and ' +
         'only the incident wave is left: the pattern travels. Slide it back to 1 and the ' +
         'returning wave is equally strong, ' +
         '<i>A</i>&thinsp;sin(<i>kx</i>−<i>ωt</i>) + <i>A</i>&thinsp;sin(<i>kx</i>+<i>ωt</i>) = ' +
         '2<i>A</i>&thinsp;sin(<i>kx</i>)&thinsp;cos(<i>ωt</i>), and the pattern stops dead. ' +
         'The nodes are then fixed at <i>x</i> = <i>nλ</i>/2, so <b>adjacent nodes are half a ' +
         'wavelength apart</b> — the fact every harmonics question rests on. Now nudge ' +
         '<b>detune</b>: if the wave comes back at even a slightly different frequency the ' +
         'nodes crawl along the medium and the standing wave is gone. That is why resonant ' +
         'lengths matter.')
  );

  const cssId = 'ibs-c4-standing-v1';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent = `
.ibs .sw-table{ width:100%; border-collapse:collapse; font-size:12.5px; }
.ibs .sw-table th{ text-align:left; padding:9px 14px; font-weight:600; font-size:11.5px;
  letter-spacing:.3px; color:var(--ibs-accent); border-bottom:1px solid var(--ibs-accent-line); }
.ibs .sw-table th span{ font-weight:500; color:var(--ibs-muted); letter-spacing:0; }
.ibs .sw-table td{ padding:9px 14px; vertical-align:top; line-height:1.5;
  border-bottom:1px solid var(--ibs-accent-line); }
.ibs .sw-table tr:last-child td{ border-bottom:0; }
.ibs .sw-table td:first-child{ font-weight:600; color:var(--ibs-accent); width:22%; }
.ibs .sw-table td b{ font-weight:600; }
.ibs .sw-table .now{ background:var(--ibs-accent-soft); }
@container (max-width: 620px){
  .ibs .sw-table, .ibs .sw-table tbody, .ibs .sw-table tr, .ibs .sw-table td{ display:block; width:auto; }
  .ibs .sw-table thead{ display:none; }
  /* the column header is gone, so each value carries its own label */
  .ibs .sw-table td:first-child{ width:auto; padding-bottom:2px; border-bottom:0;
    font-size:13px; }
  .ibs .sw-table td[data-col]{ padding-top:3px; padding-left:26px; }
  .ibs .sw-table td[data-col]::before{ content:attr(data-col) " — ";
    color:var(--ibs-muted); font-weight:600; }
  .ibs .sw-table tr{ border-bottom:1px solid var(--ibs-accent-line); padding-bottom:6px; }
  .ibs .sw-table tr:last-child{ border-bottom:0; }
  .ibs .sw-table td{ border-bottom:0; }
}
`;
    document.head.appendChild(s);
  }

  /* ================================================================== *
   * nodes, antinodes and the drift
   * ================================================================== */

  const nodes = () => frameData().nd;

  /** the predicted speed of the pattern itself, m/s */
  const drift = () => -(w2() - w1()) / (k1() + k2());

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  function scaleRow(ctx, m, yBase, label) {
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.X0, yBase); ctx.lineTo(m.X1, yBase); ctx.stroke();
  }

  /** draw one wave on its own baseline */
  function wave(ctx, m, yBase, fn, color, width, alpha = 1, dash = null) {
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let px = m.X0; px <= m.X1; px += 2) {
      const yy = yBase - fn(xMet(px, m)) * PX_CM;
      px === m.X0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
    }
    ctx.stroke(); ctx.restore();
  }

  function drawTwo() {
    const ctx = av.ctx, m = M(), W = av.w;
    ctx.clearRect(0, 0, W, HA);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HA);

    const yA = 62, yB = 160;

    /* wave 1, going right */
    ctx.save();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.X0, yA); ctx.lineTo(m.X1, yA); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.X0, yB); ctx.lineTo(m.X1, yB); ctx.stroke();
    ctx.restore();

    wave(ctx, m, yA, x => y1(x, st.t), P.accent, 2.4);
    ctext(ctx, 'wave 1, incident', m.X0, yA - 42,
      { font: `600 12px ${P.font}`, color: P.accent });
    carrow(ctx, m.X0 + 132, yA - 46, m.X0 + 196, yA - 46,
      { color: P.accent, width: 2.2, head: 8 });

    /* wave 2, going left, faded by the reflection slider */
    if (st.refl > 0.005) {
      wave(ctx, m, yB, x => y2(x, st.t), P.text, 2.2, 0.72);
      carrow(ctx, m.X0 + 196, yB - 46, m.X0 + 132, yB - 46,
        { color: P.text, width: 2.2, head: 8 });
    }
    ctext(ctx, st.refl > 0.005 ? 'wave 2, reflected' : 'wave 2, switched off',
      m.X0, yB - 42,
      { font: `600 12px ${P.font}`, color: st.refl > 0.005 ? P.text : P.muted });

    /* amplitudes, so the fade is a number and not just an impression */
    ctext(ctx, `A₁ = ${fmt(A1, 2)} cm`, m.X1, yA - 42,
      { font: `500 11.5px ${P.font}`, color: P.muted, align: 'right' });
    ctext(ctx, `A₂ = ${fmt(A2(), 2)} cm`, m.X1, yB - 42,
      { font: `500 11.5px ${P.font}`, color: P.muted, align: 'right' });
    if (st.detune !== 0) {
      ctext(ctx, `f₂ is ${st.detune > 0 ? 'higher' : 'lower'} by ` +
                 `${fmt(Math.abs(st.detune) * 100, 1)}%`, m.X1, yB - 24,
        { font: `600 11.5px ${P.font}`, color: P.accent, align: 'right' });
    }

    if (st.ann) {
      callout(ctx, ['Two perfectly ordinary travelling waves.',
                    'Neither of them is standing still.',
                    'Look at what their sum does.'],
        m.X0 + 250, 14, m.X0 + 400, yA, { palette: P });
    }
  }

  function drawSum() {
    const ctx = bv.ctx, m = M(), W = bv.w;
    const mid = 104;
    ctx.clearRect(0, 0, W, HB);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HB);

    ctx.save();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.X0, mid); ctx.lineTo(m.X1, mid); ctx.stroke();
    ctx.restore();

    /* the envelope, which is the shape students are asked to sketch */
    const FDx = frameData();
    const env = [];
    for (let i = 0; i <= FDx.N; i += 2) {
      env.push([xPix(i * FDx.step, m), FDx.env[i]]);
    }
    ctx.save();
    ctx.globalAlpha = 0.13; ctx.fillStyle = P.accent;
    ctx.beginPath();
    for (const [px, e] of env) ctx.lineTo(px, mid - e * PX_CM);
    for (let i = env.length - 1; i >= 0; i--) ctx.lineTo(env[i][0], mid + env[i][1] * PX_CM);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
    for (const s of [1, -1]) {
      ctx.beginPath();
      env.forEach(([px, e], i) => i ? ctx.lineTo(px, mid - s * e * PX_CM)
                                    : ctx.moveTo(px, mid - s * e * PX_CM));
      ctx.stroke();
    }
    ctx.restore();

    /* earlier instants, so "it does not travel" is something you can see */
    if (st.ghosts) {
      const T = 1 / st.f;
      for (let i = 1; i <= 6; i++) {
        wave(ctx, m, mid, x => ys(x, st.t - T * i / 12), P.accent, 1.2, 0.20 * (1 - i / 8));
      }
    }

    wave(ctx, m, mid, x => ys(x, st.t), P.accent, 2.8);

    /* nodes and antinodes */
    const nd = FDx.nd;
    for (const a of FDx.an) {
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(xPix(a.x, m), mid, 3.4, 0, TAU); ctx.fill();
      ctext(ctx, 'A', xPix(a.x, m), mid + 20,
        { font: `600 10px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });
    }
    for (const n of nd) {
      ctx.beginPath(); ctx.arc(xPix(n.x, m), mid, 4.8, 0, TAU);
      ctx.fillStyle = P.bg; ctx.fill();
      ctx.strokeStyle = P.text; ctx.lineWidth = 2; ctx.stroke();
      ctext(ctx, 'N', xPix(n.x, m), mid + 20,
        { font: `600 10px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
    }
    if (nd.length >= 2) {
      // the one measurement every harmonics question needs
      const a = xPix(nd[0].x, m), b = xPix(nd[1].x, m);
      const yy = mid + 74;
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a, yy - 6); ctx.lineTo(a, yy + 6);
      ctx.moveTo(b, yy - 6); ctx.lineTo(b, yy + 6); ctx.stroke();
      carrow(ctx, a, yy, b, yy, { color: P.text, width: 1.2, head: 6, min: 4 });
      carrow(ctx, b, yy, a, yy, { color: P.text, width: 1.2, head: 6, min: 4 });
      ctext(ctx, `${fmt(nd[1].x - nd[0].x, 2)} m`, (a + b) / 2, yy - 9,
        { font: P.sym(12.5), color: P.text, align: 'center', halo: P.bg });
    }

    /* the probe */
    const pxp = xPix(st.xp, m), ep = envelope(st.xp, st.t);
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pxp, mid - 66); ctx.lineTo(pxp, mid + 66); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(pxp, mid - ys(st.xp, st.t) * PX_CM, 5.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
    ctext(ctx, 'probe', pxp, mid - 70,
      { font: `600 11px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });

    /* the position scale */
    const sy = HB - 32;
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.X0, sy); ctx.lineTo(m.X1, sy); ctx.stroke();
    ctx.font = `500 10.5px ${P.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = 0; x <= L_MEDIUM + 1e-9; x += 1) {
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(xPix(x, m), sy); ctx.lineTo(xPix(x, m), sy + 7); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(String(x), xPix(x, m), sy + 11);
    }
    ctext(ctx, 'x (m)', m.X1 + 6, sy + 4, { font: P.sym(13), color: P.text });

    /* what is happening, in three words, top right */
    const d = drift();
    ctext(ctx, st.refl < 0.02 ? 'travelling: the whole pattern moves right'
          : Math.abs(d) < 1e-6 ? 'standing: the nodes do not move at all'
          : `the pattern is crawling at ${fmt(Math.abs(d), 3)} m s⁻¹`,
      m.X1, 26, { font: `600 12px ${P.font}`,
                  color: Math.abs(d) < 1e-6 && st.refl > 0.02 ? P.accent : P.text,
                  align: 'right' });

    if (st.ann && st.refl > 0.5 && Math.abs(d) < 1e-6 && nd.length >= 2) {
      callout(ctx, ['Every ghost crosses the axis in the same places.',
                    'The nodes are fixed. Between them the medium',
                    'just oscillates up and down, all in step.'],
        m.X0 + 40, 14, xPix(nd[0].x, m), mid, { palette: P });
    }
  }

  /* ================================================================== *
   * the comparison table
   * ================================================================== */

  let lastRows = '';
  function drawTable() {
    const nd = nodes();
    const d = drift();
    const swr = st.refl >= 1 ? '∞' : fmt((A1 + A2()) / (A1 - A2()), 1);
    const standing = st.refl > 0.02;
    const rows = [
      ['Does the pattern move?',
       `yes, at <b>v = ${fmt(vOf(), 2)} m s⁻¹</b>`,
       Math.abs(d) < 1e-6
         ? 'no: the nodes stay <b>exactly</b> where they are'
         : `it crawls at <b>${fmt(Math.abs(d), 3)} m s⁻¹</b> — the wave came back detuned`],
      ['Amplitude along the medium',
       `the same everywhere: <b>${fmt(A1, 2)} cm</b>`,
       st.refl >= 1
         ? `from <b>0</b> at a node to <b>${fmt(2 * A1, 2)} cm</b> at an antinode`
         : `from <b>${fmt(Math.abs(A1 - A2()), 2)}</b> to ` +
           `<b>${fmt(A1 + A2(), 2)} cm</b> — SWR ${swr}`],
      ['Distance between nodes',
       'no nodes: nothing stands still',
       nd.length >= 2
         ? `<b>${fmt(nd[1].x - nd[0].x, 3)} m</b>, against λ/2 = ` +
           `<b>${fmt(st.lam / 2, 3)} m</b>`
         : 'the medium is too short to show two'],
      ['Energy',
       'carried along the medium, past every point',
       'stored in the medium: none is carried past a node'],
    ];
    const html = rows.map(r =>
      `<tr><td>${r[0]}</td>` +
      `<td data-col="one travelling wave" class="${standing ? '' : 'now'}">${r[1]}</td>` +
      `<td data-col="the sum" class="${standing ? 'now' : ''}">${r[2]}</td></tr>`).join('');
    if (html !== lastRows) { tbody.innerHTML = html; lastRows = html; }
  }

  /* ================================================================== *
   * drag the probe
   * ================================================================== */

  const onDown = e => {
    st.dragging = true;
    st.xp = clamp(xMet(bv.at(e).x, M()), 0.02, L_MEDIUM - 0.02);
    bv.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = e => {
    if (!st.dragging) { bv.el.style.cursor = 'pointer'; return; }
    st.xp = clamp(xMet(bv.at(e).x, M()), 0.02, L_MEDIUM - 0.02);
    e.preventDefault();
  };
  const onUp = e => {
    if (!st.dragging) return;
    st.dragging = false;
    try { bv.el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  bv.el.addEventListener('pointerdown', onDown);
  bv.el.addEventListener('pointermove', onMove);
  bv.el.addEventListener('pointerup', onUp);
  bv.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    bv.el.removeEventListener('pointerdown', onDown);
    bv.el.removeEventListener('pointermove', onMove);
    bv.el.removeEventListener('pointerup', onUp);
    bv.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) st.t += Math.min(dt, 0.1) * st.speed;
    render();
  }

  let tableTick = 0;
  function render() {
    drawTwo(); drawSum();
    if ((tableTick++ % 6) === 0) drawTable();

    const nd = nodes();
    const ep = envelope(st.xp, st.t);
    const eMax = A1 + A2(), eMin = Math.abs(A1 - A2());
    const d = drift();
    const kind = st.refl < 0.02 ? 'a travelling wave: every point has the same amplitude'
      : ep < eMin + 0.12 * (eMax - eMin) ? 'a node — the medium barely moves here'
      : ep > eMax - 0.12 * (eMax - eMin) ? 'an antinode — the largest swing on the medium'
      : 'between a node and an antinode';
    out.setAll({
      f:  `${fmt(st.f, 2)} Hz,  ${fmt(st.lam, 2)} m`,
      v:  `${fmt(vOf(), 3)} m s⁻¹`,
      ns: nd.length >= 2 ? `${fmt(nd[1].x - nd[0].x, 3)} m` : '—',
      nl: `${fmt(st.lam / 2, 3)} m`,
      sw: `${fmt(A2(), 2)} cm,  SWR ${st.refl >= 1 ? '∞' : fmt((A1 + A2()) / (A1 - A2()), 1)}`,
      dr: Math.abs(d) < 1e-9 ? '0 — it is standing still' : `${fmt(d, 4)} m s⁻¹`,
      pb: `x = ${fmt(st.xp, 2)} m,  amplitude ${fmt(ep, 2)} cm`,
      pc: kind,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(av.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) { av.setLogical(clamp(cw, 360, MW), HA); bv.setLogical(clamp(cw, 360, MW), HB); }
    av.fit(); bv.fit();
    lastRows = '';
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

  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => { Object.assign(st, p); lastRows = ''; render(); },
    _state: () => ({
      f: st.f, lam: st.lam, v: vOf(), refl: st.refl, detune: st.detune,
      t: st.t, xp: st.xp, A1, A2: A2(),
      w1: w1(), w2: w2(), k1: k1(), k2: k2(), drift: drift(),
    }),
    _y1: (x, t) => y1(x, t),
    _y2: (x, t) => y2(x, t),
    _sum: (x, t) => ys(x, t),
    _env: (x, t) => envelope(x, t),
    _nodes: () => nodes(),
    _advance: s => { st.t += s; return st.t; },
    _consts: () => ({ L_MEDIUM, A1, PX_CM, F_MIN, F_MAX, L_MIN, L_MAX, ...M() }),
  };
}
