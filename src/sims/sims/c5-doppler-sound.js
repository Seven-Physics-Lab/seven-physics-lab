/* ============================================================================
 * C5-1  The Doppler Effect
 * IB Physics C.5
 *
 * The one topic where the picture IS the derivation. A source that moves while
 * it is emitting leaves its wavefronts bunched up in front of it and spread out
 * behind, because each circle is centred where the source was when it made
 * that circle, and the source has moved on since. Everything else — the two
 * formulas, which one has the minus sign, the sonic boom — is reading that
 * picture carefully.
 *
 * So this simulation does not contain the formulas. It emits a circle every
 * period from wherever the source happens to be, expands each at the speed of
 * sound, and works out when they reach the observer. The frequency plotted is
 * the rate at which they arrive.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED
 *
 * The source is at X(t) and the observer at P(t), both moving at constant
 * velocity. Sound emitted at time tₑ arrives at time t, and the two are tied
 * together by the fact that it travelled at v:
 *
 *     | P(t) − X(tₑ) |  =  v (t − tₑ)
 *
 * With constant velocities that is a quadratic in tₑ, so it is solved exactly
 * rather than stepped towards. Then the received frequency is
 *
 *     f′ = f · (v − u_o·n̂) / (v − u_s·n̂)
 *
 * where n̂ is the unit vector along which the sound actually travelled, from
 * where the source WAS to where the observer IS. That single expression is the
 * whole of C.5. Put the observer straight ahead of the source and n̂ is the
 * direction of motion, u_s·n̂ = u_s, and it collapses to f v/(v − u_s). Put the
 * observer behind and n̂ reverses, giving f v/(v + u_s). Move the observer
 * instead and the numerator does the work. The sim never selects between
 * those cases; it evaluates the one expression and they appear.
 *
 * THREE THINGS THE PICTURE GIVES YOU FOR FREE
 *
 *   · The change of pitch as something passes is not a step. It is a smooth
 *     S, because n̂ swings round as the source goes by, and the two textbook
 *     values are only its two ends.
 *   · The moment you hear the true frequency is NOT the moment of closest
 *     approach. It is later, by the time the sound took to arrive, because
 *     what reaches you now left when the source was still coming at you.
 *     The graph shows that delay and the readouts measure it.
 *   · Past u_s = v the quadratic has two roots instead of one: two different
 *     emissions arrive at the same instant. That is the sonic boom, and the
 *     circles' own envelope is the Mach cone, sin μ = v/u_s. Neither is drawn
 *     as a special case; both are what the circles do.
 *
 * THE SPEED OF SOUND
 *
 * Not a constant put in by hand: v = 331.3 √(1 + θ/273.15), the same relation
 * the resonance tube uses, so the temperature dial changes the answer here for
 * the same reason it does there.
 *
 * THE ONE LIBERTY, DECLARED
 *
 * Time. Sound crosses a two-hundred-metre scene in six tenths of a second, so
 * the clock runs slow by a fixed factor. Because it is fixed, every speed on
 * the screen is in the same proportion to every other, and the wavelengths,
 * which are what the picture is about, are drawn to scale in metres.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout, Plot,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HB = 300;                       // the frequency graph

/* the patch of world the top panel shows, in metres, always to scale */
const SCENE_X = 200, SCENE_Y = 112.5;
const ASPECT = SCENE_Y / SCENE_X;
const RULER = 26;
const panelH = w => Math.round(w * ASPECT) + RULER;

const F_MIN = 20, F_MAX = 120;        // Hz, the source's own frequency
const US_MAX = 460;                   // m/s — past the speed of sound on purpose
const UO_MAX = 120;                   // m/s
const TH_MIN = -20, TH_MAX = 40;      // °C
const SLOW = 12;                      // the declared slow-motion factor
const NARROW = 720;

/** the speed of sound in air, from the temperature and nothing else */
export function soundSpeed(thetaC) {
  return 331.3 * Math.sqrt(1 + thetaC / 273.15);
}

/**
 * When did the sound that arrives at time t leave?
 *
 * |P0 + u_o t − X0 − u_s tₑ| = v (t − tₑ), a quadratic in tₑ. Returns every
 * root that is in the past and gives a positive travel time, largest first —
 * there are two of them once the source outruns its own sound, which is the
 * whole of what a sonic boom is.
 */
export function retarded(t, { X0, us, P0, uo, v }) {
  const bx = P0[0] + uo[0] * t - X0[0];
  const by = P0[1] + uo[1] * t - X0[1];
  const a = us[0] * us[0] + us[1] * us[1] - v * v;
  const b = -2 * (bx * us[0] + by * us[1]) + 2 * v * v * t;
  const c = bx * bx + by * by - v * v * t * t;
  const out = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-18) out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const s = Math.sqrt(disc);
    out.push((-b + s) / (2 * a), (-b - s) / (2 * a));
  }
  return out.filter(te => te <= t + 1e-12 && t - te > 1e-12)
            .sort((p, q) => q - p);
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c5-doppler-sound',
    title: 'The Doppler effect',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    fHz: 40, us: 80, uo: 0, thetaC: 20,
    obs: [55, 28],            // the observer, in metres from the scene centre
    t: 0,                     // scene time, seconds; the source is at x = 0 at t = 0
    playing: true, cone: true, ann: false, dragging: false,
  };

  const vOf = () => soundSpeed(st.thetaC);
  const lamOf = () => vOf() / st.fHz;
  /* the source runs along y = 0; the observer's own motion is towards the
   * source's line, which is the case the formula is usually quoted for */
  const geomOf = () => ({
    X0: [0, 0], us: [st.us, 0],
    P0: [st.obs[0], st.obs[1]], uo: [0, -st.uo], v: vOf(),
  });
  const sourceAt = t => [st.us * t, 0];
  const obsAt = t => [st.obs[0], st.obs[1] - st.uo * t];
  /** how long the source takes to cross the scene, and the window drawn */
  const tHalf = () => Math.min(6, (SCENE_X * 0.62) / Math.max(st.us, 12));

  /** the received frequency at time t, from the one expression */
  function received(t) {
    const g = geomOf();
    const roots = retarded(t, g);
    if (!roots.length) return null;
    const out = [];
    for (const te of roots) {
      const S = sourceAt(te), P = obsAt(t);
      const dx = P[0] - S[0], dy = P[1] - S[1];
      const r = Math.hypot(dx, dy);
      if (r < 1e-9) continue;
      const nx = dx / r, ny = dy / r;
      const den = g.v - (g.us[0] * nx + g.us[1] * ny);
      const num = g.v - (g.uo[0] * nx + g.uo[1] * ny);
      out.push({ te, r, f: den === 0 ? Infinity : st.fHz * num / den, n: [nx, ny] });
    }
    return out.length ? out : null;
  }

  const mach = () => (st.us > vOf() ? Math.asin(vOf() / st.us) : null);

  /**
   * The moment of closest approach, and how close. With both velocities
   * constant the separation squared is a quadratic in t, so its minimum is
   * exact rather than searched for.
   */
  function closest() {
    const g = geomOf();
    const dx = g.P0[0] - g.X0[0], dy = g.P0[1] - g.X0[1];
    const ux = g.uo[0] - g.us[0], uy = g.uo[1] - g.us[1];
    const u2 = ux * ux + uy * uy;
    const t = u2 < 1e-12 ? 0 : -(dx * ux + dy * uy) / u2;
    const rx = dx + ux * t, ry = dy + uy * t;
    return { t, r: Math.hypot(rx, ry) };
  }

  /** a frequency axis that lands on round numbers */
  function niceRange(lo, hi) {
    const span = Math.max(hi - lo, 1);
    const step = span > 60 ? 20 : span > 24 ? 10 : span > 10 ? 5 : span > 4 ? 2 : 1;
    return [Math.max(0, Math.floor((lo - span * 0.12) / step) * step),
            Math.ceil((hi + span * 0.12) / step) * step];
  }

  /* ---------------------------------------------------------- surfaces */

  const sv = surface(MW, panelH(MW), {
    label: 'A moving source of sound, its wavefronts, and a listener',
  });
  const plot = new Plot({
    width: MW, height: HB,
    xDomain: [-1, 1], yDomain: [0, 2],
    xLabel: 'time / s (the source passes x = 0 at t = 0)',
    yLabel: 'frequency heard / Hz',
    pad: { l: 64, r: 20, t: 30, b: 42 },
    xTicks: 8, yTicks: 5,
    ariaLabel: 'the frequency heard by the listener against time',
  });

  const GS = () => {
    const W = sv.w, Ht = Math.round(W * ASPECT), mm = W / SCENE_X;
    return { W, Ht, H: Ht + RULER, mm, sm: W < NARROW,
             cx: W / 2, cy: Math.round(Ht * 0.40),
             xOf: m => W / 2 + m * mm,
             yOf: m => Math.round(Ht * 0.40) + m * mm,
             mOfX: px => (px - W / 2) / mm,
             mOfY: py => (py - Math.round(Ht * 0.40)) / mm };
  };

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'sp', label: 'Air temperature, and the speed of sound it gives' },
    { key: 'so', label: 'The source: its own frequency and wavelength' },
    { key: 'us', label: 'Source speed, as a fraction of the speed of sound' },
    { key: 'ah', label: 'Wavelength ahead of it, and behind it' },
    { key: 'ex', label: 'The two textbook answers, for a listener in line with it' },
    { key: 'no', label: 'What this listener hears right now' },
    { key: 'wh', label: 'Where and when that sound was made' },
    { key: 'cr', label: 'When the true frequency is heard' },
    { key: 'mc', label: 'Supersonic: the Mach cone and the boom' },
    { key: 'sc', label: 'The scale of this drawing, and the one liberty' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sF = slider({ label: '<i>f</i>', min: F_MIN, max: F_MAX, step: 1, value: st.fHz,
    format: v => `${v.toFixed(0)} Hz`, onInput: v => { st.fHz = v; render(); } });
  const sUs = slider({ label: '<i>u</i><sub>s</sub>', min: 0, max: US_MAX, step: 5, value: st.us,
    format: v => `${v.toFixed(0)} m s⁻¹`, onInput: v => { st.us = v; render(); } });
  const sUo = slider({ label: '<i>u</i><sub>o</sub>', min: -UO_MAX, max: UO_MAX, step: 5, value: st.uo,
    format: v => v === 0 ? 'listener still'
              : `${Math.abs(v).toFixed(0)} m s⁻¹ ${v > 0 ? 'towards' : 'away from'} the line`,
    onInput: v => { st.uo = v; render(); } });
  const sTh = slider({ label: '<i>θ</i>', min: TH_MIN, max: TH_MAX, step: 1, value: st.thetaC,
    format: v => `${v.toFixed(0)} °C`, onInput: v => { st.thetaC = v; render(); } });

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bSub = button({ label: 'A car going past', onClick: () => {
    st.fHz = 40; st.us = 30; st.uo = 0; st.obs = [55, 12]; st.t = 0;
    sF.set(40); sUs.set(30); sUo.set(0); render();
  } });
  const bSonic = button({ label: 'Past the speed of sound', onClick: () => {
    st.us = 430; st.fHz = 40; st.uo = 0; st.obs = [55, 28]; st.t = 0;
    sUs.set(430); sF.set(40); sUo.set(0); render();
  } });
  const bStill = button({ label: 'Source still, listener moving', onClick: () => {
    st.us = 0; st.uo = 90; st.obs = [20, 45]; st.t = -0.4 * tHalf();
    sUs.set(0); sUo.set(90); render();
  } });
  const bCone = button({ label: 'Mach cone', pressed: true, onClick: b => {
    st.cone = !st.cone; b.setAttribute('aria-pressed', String(st.cone)); render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('The Doppler Effect',
            'every circle is centred where the source was when it made it — that is the whole of it'),
    controls([el('div', { class: 'ibs-btns' }, [bSub.node, bStill.node, bSonic.node])],
             { label: 'try:' }),
    panelBox('200 m × 112 m of the world, to scale — drag the listener', sv.el),
    panelBox('What the listener hears, for the whole pass', plot.svg),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bCone.node, bAnn.node])]),
    controls([sF.node, sUs.node, sUo.node, sTh.node]),
    out.node,
    note('<b>Why the pitch changes.</b> The source makes a wavefront every period and then ' +
         'moves on, so the next one is centred a little further along. In front of it the ' +
         'circles crowd together and the wavelength is short; behind it they spread out and the ' +
         'wavelength is long. The speed of sound has not changed — the air does not care what ' +
         'made the sound — so a shorter wavelength arriving at the same speed means more waves ' +
         'per second, and a higher pitch. Reading the picture gives ' +
         '<i>λ</i>′ = (<i>v</i> ∓ <i>u</i><sub>s</sub>)/<i>f</i> straight away, and dividing ' +
         '<i>v</i> by it gives <b><i>f</i>′ = <i>f v</i>/(<i>v</i> ∓ <i>u</i><sub>s</sub>)</b>. ' +
         'A <b>moving listener</b> is a different thing and gets a different formula: the ' +
         'wavelength in the air is unchanged and the listener simply meets the wavefronts ' +
         'faster, so <i>f</i>′ = <i>f</i>(<i>v</i> ± <i>u</i><sub>o</sub>)/<i>v</i>. Both are ' +
         'the same one expression in the panel. <b>Two things worth catching.</b> The pitch ' +
         'does not switch as the source passes; it slides, and the moment you hear the true ' +
         'frequency comes <i>after</i> the source is level with you, because the sound you are ' +
         'hearing then left while it was still approaching. And past the speed of sound the ' +
         'circles pile up along a line instead of a point: the Mach cone, sin<i>μ</i> = ' +
         '<i>v</i>/<i>u</i><sub>s</sub>, with everything ahead of it in silence. Nothing about ' +
         'the boom is drawn in by hand — it is where two of those circles reach you at once.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  let P = palette(root);

  function drawScene() {
    const ctx = sv.ctx, g = GS(), W = g.W, Ht = g.Ht;
    ctx.clearRect(0, 0, W, g.H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, g.H);

    const v = vOf(), t = st.t;
    const Rmax = Math.hypot(SCENE_X, SCENE_Y);

    /* the wavefronts: one per period, each centred where the source was */
    const kNow = Math.floor(t * st.fHz);
    const kOld = Math.ceil((t - Rmax / v) * st.fHz);
    ctx.save();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4;
    for (let k = kOld; k <= kNow; k++) {
      const te = k / st.fHz;
      const r = v * (t - te);
      if (r <= 0) continue;
      const S = sourceAt(te);
      ctx.globalAlpha = clamp(0.85 - 0.5 * r / Rmax, 0.12, 0.85);
      ctx.beginPath();
      ctx.arc(g.xOf(S[0]), g.yOf(S[1]), r * g.mm, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    /* the Mach cone, if there is one — drawn as the tangent to those circles,
     * so it can be seen to BE their envelope rather than an extra line */
    const mu = mach();
    if (mu !== null && st.cone) {
      const S = sourceAt(t);
      ctx.save();
      ctx.setLineDash([7, 5]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.8;
      for (const sgn of [-1, 1]) {
        const dx = -Math.cos(mu), dy = sgn * Math.sin(mu);
        ctx.beginPath();
        ctx.moveTo(g.xOf(S[0]), g.yOf(S[1]));
        ctx.lineTo(g.xOf(S[0] + dx * Rmax), g.yOf(S[1] + dy * Rmax));
        ctx.stroke();
      }
      ctx.restore();
      ctext(ctx, `Mach cone, sin μ = v/u = ${fmt(Math.sin(mu), 3)},  μ = ${fmt(mu * DEG, 1)}°` +
                 ' — and it is tangent to every circle, which is what makes it a cone',
        16, 22, { font: `600 11.5px ${P.font}`, color: P.text,
                  halo: P.bg, haloWidth: 4 });
    }

    /* the source's track and the source itself */
    ctx.save();
    ctx.setLineDash([4, 6]); ctx.strokeStyle = P.text; ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, g.yOf(0)); ctx.lineTo(W, g.yOf(0)); ctx.stroke();
    ctx.restore();
    const S = sourceAt(t);
    const sx = g.xOf(S[0]), sy = g.yOf(S[1]);
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 2; ctx.stroke();
    if (st.us > 0) {
      carrow(ctx, sx, sy - 16, sx + clamp(st.us * 0.12, 14, 60), sy - 16,
        { color: P.text, width: 2, head: 8 });
    }
    ctext(ctx, `source · ${fmt(st.us, 0)} m s⁻¹`, sx, sy - 24,
      { font: `600 11.5px ${P.font}`, color: P.text, align: 'center',
        halo: P.bg, haloWidth: 4 });

    /* the listener, and the sound actually reaching them */
    const Pp = obsAt(t);
    const px = g.xOf(Pp[0]), py = g.yOf(Pp[1]);
    const hits = received(t);
    if (hits) {
      ctx.save();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      for (const h of hits) {
        const E = sourceAt(h.te);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(g.xOf(E[0]), g.yOf(E[1])); ctx.lineTo(px, py);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(g.xOf(E[0]), g.yOf(E[1]), 3.5, 0, TAU);
        ctx.fillStyle = P.accent; ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = P.accent;
    ctx.beginPath(); ctx.arc(px, py, 6.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 2; ctx.stroke();
    if (st.uo !== 0) {
      carrow(ctx, px, py, px, py - Math.sign(st.uo) * clamp(Math.abs(st.uo) * 0.3, 14, 46),
        { color: P.accent, width: 2, head: 8 });
    }
    /* the listener can be dragged to the right-hand edge, where a label
     * hanging off them would run out of panel */
    const right = px > W * 0.6;
    ctext(ctx, hits ? `hearing ${fmt(hits[0].f, 1)} Hz`
                    : (g.sm ? 'nothing yet' : 'nothing has reached here yet'),
      px + (right ? -12 : 12), py + 5,
      { font: `600 12px ${P.font}`, color: P.accent, align: right ? 'right' : 'left',
        halo: P.bg, haloWidth: 4 });

    drawRuler(ctx, g);

    if (st.ann) {
      callout(ctx, ['Each circle is centred where the source was',
                    'when it made that circle. The source has moved',
                    'on since. That is the entire explanation.'],
        16, 14, sx, sy, { palette: P });
    }
  }

  function drawRuler(ctx, g) {
    const ry = g.Ht + 9;
    ctx.fillStyle = P.bg; ctx.fillRect(0, g.Ht, g.W, RULER);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(g.W, ry); ctx.stroke();
    const lab = g.sm ? 50 : 25;
    for (let m = -SCENE_X / 2; m <= SCENE_X / 2 + 1e-9; m += 5) {
      const px = g.xOf(m);
      const big = Math.abs(m % 25) < 1e-9;
      ctx.beginPath(); ctx.moveTo(px, ry); ctx.lineTo(px, ry - (big ? 7 : 3.5)); ctx.stroke();
      if (Math.abs(m % lab) < 1e-9 && Math.abs(m) < SCENE_X / 2 - 5) {
        ctext(ctx, String(m), px + 3, ry - 8, { font: `500 10px ${P.font}`, color: P.muted });
      }
    }
    ctext(ctx, 'metres', g.W - 6, ry - 8,
      { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
  }

  /* --------------------------------------------- what the listener hears */

  function drawGraph() {
    plot.clear(); plot.clearOverlay();
    const col = 'var(--ibs-accent)', ink = 'var(--ibs-text)';
    const T = tHalf();

    const pts = [];
    let lo = st.fHz, hi = st.fHz;
    for (let i = 0; i <= 600; i++) {
      const t = -T + 2 * T * i / 600;
      const h = received(t);
      if (!h) continue;
      const f = h[0].f;
      if (!isFinite(f)) continue;
      pts.push([t, f]);
      lo = Math.min(lo, f); hi = Math.max(hi, f);
    }
    const [yLo, yHi] = niceRange(lo, hi);
    plot.setDomain([-T, T], [yLo, yHi]);

    /* the source's own frequency, for comparison */
    plot.line([[-T, st.fHz], [T, st.fHz]],
      { color: ink, width: 1.2, dash: '5 4', opacity: 0.6 });
    plot.text(-T * 0.98, st.fHz, ` the source's own ${st.fHz} Hz`,
      { color: 'var(--ibs-muted)', size: 11, dy: -5 });


    if (pts.length) plot.line(pts, { color: col, width: 2.4 });

    /* the two instants that get confused with each other */
    /* these two instants are usually only a few hundredths of a second apart,
     * so their labels go on separate rows rather than on top of each other */
    const span = yHi - yLo;
    const cl = closest();
    if (cl.t > -T && cl.t < T) {
      plot.vline(cl.t, { color: ink, dash: '3 4' });
      plot.text(cl.t, yHi - span * 0.05, ' closest approach',
        { color: ink, size: 11, weight: 600, anchor: 'end', dx: -4 });
    }
    const cross = crossingTime();
    if (cross !== null) {
      plot.vline(cross, { color: col, dash: '2 4' });
      plot.text(cross, yHi - span * 0.14,
        sv.w < NARROW ? ' true f here' : ' and the true frequency arrives here',
        { color: col, size: 11, weight: 600 });
    }

    const hNow = received(st.t);
    if (hNow && isFinite(hNow[0].f)) plot.dot(st.t, hNow[0].f, { color: ink, r: 5 });
  }

  /**
   * The instant the listener hears the source's own frequency. It is where the
   * sound that is arriving left along the perpendicular, which happens after
   * the source passes, never at the same moment — the difference is the travel
   * time. Found by bisection on the curve itself rather than by a formula.
   */
  function crossingTime() {
    const T = tHalf();
    const g = t => {
      const h = received(t);
      return h && isFinite(h[0].f) ? h[0].f - st.fHz : null;
    };
    let a = -T, b = T;
    const ga = g(a), gb = g(b);
    if (ga === null || gb === null || ga * gb > 0) return null;
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2, gm = g(m);
      if (gm === null) return null;
      if (ga * gm <= 0) b = m; else a = m;
    }
    return (a + b) / 2;
  }

  /* ================================================================== *
   * dragging the listener
   * ================================================================== */

  const fromPointer = e => {
    const g = GS(), p = sv.at(e);
    st.obs = [clamp(g.mOfX(p.x), -SCENE_X / 2 + 4, SCENE_X / 2 - 4),
              clamp(g.mOfY(p.y) + st.uo * st.t, -SCENE_Y * 0.38, SCENE_Y * 0.55)];
  };
  const onDown = e => {
    st.dragging = true; fromPointer(e);
    sv.el.setPointerCapture(e.pointerId); e.preventDefault(); render();
  };
  const onMove = e => {
    if (!st.dragging) { sv.el.style.cursor = 'grab'; return; }
    fromPointer(e); e.preventDefault(); render();
  };
  const onUp = e => {
    if (!st.dragging) return;
    st.dragging = false;
    try { sv.el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  sv.el.addEventListener('pointerdown', onDown);
  sv.el.addEventListener('pointermove', onMove);
  sv.el.addEventListener('pointerup', onUp);
  sv.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    sv.el.removeEventListener('pointerdown', onDown);
    sv.el.removeEventListener('pointermove', onMove);
    sv.el.removeEventListener('pointerup', onUp);
    sv.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (!st.playing) return;
    const T = tHalf();
    st.t += Math.min(dt, 0.1) / SLOW;
    if (st.t > T) st.t = -T;
    drawScene();
  }

  function render() {
    const T = tHalf();
    if (st.t > T || st.t < -T) st.t = -T;
    drawScene(); drawGraph();

    const v = vOf(), lam = lamOf();
    const ahead = (v - st.us) / st.fHz, behind = (v + st.us) / st.fHz;
    const hits = received(st.t);
    const cross = crossingTime();
    const cl = closest();
    const mu = mach();
    const g = GS();

    out.setAll({
      sp: `${st.thetaC} °C  →  v = ${fmt(v, 1)} m s⁻¹`,
      so: `${st.fHz} Hz, so λ = v/f = ${fmt(lam, 2)} m when nothing moves`,
      us: `${fmt(st.us, 0)} m s⁻¹ = ${fmt(st.us / v, 3)} of the speed of sound` +
          (st.us > v ? ' — supersonic' : ''),
      ah: st.us >= v
        ? `ahead: none at all, the source has outrun its own sound. Behind: ` +
          `${fmt(behind, 2)} m`
        : `ahead ${fmt(ahead, 2)} m, behind ${fmt(behind, 2)} m — the speed of sound is ` +
          'the same both ways, only the spacing has changed',
      ex: st.us >= v ? 'there is no "in front" to stand in'
        : `coming towards you ${fmt(st.fHz * v / (v - st.us), 1)} Hz, ` +
          `going away ${fmt(st.fHz * v / (v + st.us), 1)} Hz`,
      no: hits ? `${fmt(hits[0].f, 2)} Hz` +
                 (hits.length > 1
                   ? ` — and ${fmt(hits[1].f, 2)} Hz at the same instant, from an earlier ` +
                     'emission: two sounds arriving together is what a boom is'
                   : '')
                : 'nothing yet — the sound has not had time to get here',
      wh: hits ? `made ${fmt(st.t - hits[0].te, 3)} s ago, ${fmt(hits[0].r, 1)} m away, ` +
                 `when the source was at x = ${fmt(sourceAt(hits[0].te)[0], 1)} m`
               : '—',
      cr: cross === null
        ? 'the true frequency is not heard anywhere in this pass'
        : `at t = ${fmt(cross, 3)} s. The closest approach was at t = ${fmt(cl.t, 3)} s and ` +
          `${fmt(cl.r, 1)} m away, so you hear it ${fmt(cross - cl.t, 3)} s later` +
          (st.uo === 0
            ? ` — and ${fmt(cl.r, 1)} m of air takes ${fmt(cl.r / v, 3)} s to cross, which is ` +
              'the same number. The sound you hear then left at the closest approach'
            : ''),
      mc: mu === null
        ? `not yet: u/v = ${fmt(st.us / v, 3)}. Push the source past ${fmt(v, 0)} m s⁻¹`
        : `sin μ = v/u = ${fmt(Math.sin(mu), 4)}, so μ = ${fmt(mu * DEG, 2)}° — and everything ` +
          'ahead of that cone has heard nothing at all',
      sc: `${fmt(g.mm, 2)} pixels per metre — ${SCENE_X} m × ${fmt(SCENE_Y, 0)} m of world, to ` +
          `scale, so the wavelengths are drawn at their real spacing. Only the clock is ` +
          `stretched: ×${SLOW}`,
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(sv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      sv.setLogical(w, panelH(w));
      plot.xTicks = w < NARROW ? 4 : 8;
      plot.setSize(w, HB);
    }
    sv.fit();
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

  const anim = loop(frame, { element: root, autoStart: true });
  onDestroy(() => anim.destroy());

  st.t = -0.35 * tHalf();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      Object.assign(st, p);
      sF.set(st.fHz); sUs.set(st.us); sUo.set(st.uo); sTh.set(st.thetaC);
      render();
    },
    _state: () => ({
      fHz: st.fHz, us: st.us, uo: st.uo, thetaC: st.thetaC, v: vOf(),
      lam: lamOf(), t: st.t, obs: [...st.obs],
      mach: mach(), tHalf: tHalf(),
    }),
    _v: th => soundSpeed(th),
    _retarded: (t) => retarded(t, geomOf()),
    _received: t => received(t),
    _crossing: () => crossingTime(),
    _source: t => sourceAt(t),
    _obs: t => obsAt(t),
    _geom: () => { const g = GS(); return { W: g.W, Ht: g.Ht, H: g.H, mm: g.mm, sm: g.sm }; },
    _consts: () => ({ MW, HB, SCENE_X, SCENE_Y, RULER, F_MIN, F_MAX, US_MAX, UO_MAX,
                      TH_MIN, TH_MAX, SLOW }),
  };
}
