/* ============================================================================
 * C2-1  Wave Anatomy: Transverse and Longitudinal
 * IB Physics C.2 Wave Model
 *
 * Built to the house pattern: a canvas for the medium, two canvases for the
 * two graphs, controls beneath, and every number in the readout grid.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING THIS SIMULATION EXISTS TO FIX
 *
 * Students confuse the displacement-TIME graph with the displacement-POSITION
 * graph, and read a wavelength off the first or a period off the second. The
 * two are drawn side by side here, from the same wave, at the same instant:
 *
 *   left   one particle, watched for several seconds     -> gives the PERIOD
 *   right  the whole medium, frozen at this instant      -> gives the WAVELENGTH
 *
 * The particle the left graph is watching is the marked one on the medium, and
 * you can drag it anywhere along the medium to see the phase change.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 *     y(x, t) = A sin( 2 pi ( t/T - x/lambda ) ) = A sin( omega t - k x )
 *
 * with omega = 2 pi f, k = 2 pi / lambda, and v = f lambda. Nothing is
 * integrated: the wave is evaluated in closed form at every pixel, so the
 * medium, both graphs and every readout come from one expression and cannot
 * drift apart.
 *
 * v = f lambda is not a slider you can break. One of the three is always
 * DERIVED from the other two, and which one is derived is yours to choose.
 * That is the honest way to present a constraint: you cannot set all three.
 *
 * TRANSVERSE AND LONGITUDINAL
 *
 * The same y(x, t) drives both. In transverse mode the displacement is drawn
 * perpendicular to the medium; in longitudinal mode it is drawn along it, and
 * the particles bunch into compressions where the displacement gradient is
 * most negative. Since
 *
 *     d(y)/dx = -A k cos(omega t - k x)
 *
 * the compressions sit a quarter of a wavelength from the points of greatest
 * displacement, which is exactly the phase relation students are asked about.
 * The density strip beneath the particles is shaded from that gradient, not
 * from counting dots, so it is exact.
 *
 * The drawn amplitude uses a different scale in the two modes, because a
 * transverse displacement has the whole height of the box to live in while a
 * longitudinal one must stay smaller than the particle spacing or the dots
 * would pass through one another. Both graphs plot the same y in centimetres,
 * so the physics is unaffected; the verification script checks the drawn
 * particles never cross at any setting.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, callout,
} from '../sim-kit.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const MW = 1120, MH = 232;          // the medium, at full width
const GW = 548,  GH = 260;          // each graph
const L_MEDIUM = 6.0;               // m, the length of the medium
const PAD_L = 62, PAD_R = 58;       // px, margins either side of the medium
const N_PARTICLES = 45;

const F_MIN = 0.10, F_MAX = 2.00;   // Hz
const L_MIN = 0.60, L_MAX = 3.00;   // m
const V_MIN = F_MIN * L_MIN, V_MAX = F_MAX * L_MAX;
const A_MIN = 0.20, A_MAX = 1.20;   // cm


/**
 * Px per cm for the longitudinal drawing.
 *
 * Two particles collide when the gap between them closes, and the gap
 * changes by the strain times this scale, NOT by the displacement compared
 * with the spacing. The fractional change in the gap is
 *
 *     (dy/dx) * PX_LONG / PPM
 *
 * so the worst case over the sliders is A_MAX * k_max * PX_LONG / PPM. Fixing
 * that at 0.78 gives the most bunching the picture can show without a single
 * pair ever touching, whatever is set. The verification script checks every
 * neighbouring pair over the whole parameter space rather than trusting this.
 *
 * The displacement is therefore drawn about 1.7 times exaggerated against the
 * position scale, which is the usual textbook convention for this diagram and
 * is the only way the bunching is visible at all at ordinary amplitudes.
 */
const K_MAX = TAU / L_MIN;
const BUNCH = 0.78;                 // the largest fraction of a gap ever closed

const PX_TRANS = 26;                // px per cm for the transverse drawing

/**
 * The medium's metrics, derived from the width it is currently drawn at.
 *
 * The canvas matches its logical width to the width it is rendered at, so one
 * unit is one CSS pixel and the scale labels stay legible on a phone. Every
 * horizontal quantity therefore has to be computed rather than fixed, and
 * PX_LONG is tied to PPM so the bunching keeps the same fraction of a gap at
 * every width.
 */
function metrics(w) {
  const X0 = PAD_L, X1 = w - PAD_R;
  const PPM = (X1 - X0) / L_MEDIUM;
  return {
    X0, X1, PPM,
    SPACING: (X1 - X0) / (N_PARTICLES - 1),
    PX_LONG: BUNCH * PPM / (A_MAX * K_MAX),
  };
}

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c2-wave-anatomy',
    title: 'Wave anatomy: transverse and longitudinal',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    f: 0.60, lam: 1.60, A: 0.80,
    derive: 'v',                 // which of v, f, lambda follows from the others
    mode: 'transverse',
    xm: 1.20,                    // m, the marked particle
    t: 0, speed: 1, playing: true, ann: false, dragging: false,
  };

  const vOf = () => st.f * st.lam;
  const w   = () => TAU * st.f;
  const k   = () => TAU / st.lam;
  /** the wave itself, in cm, at position x metres and time t seconds */
  const y   = (x, t) => st.A * Math.sin(w() * t - k() * x);
  /** particle velocity, cm/s */
  const vy  = (x, t) => st.A * w() * Math.cos(w() * t - k() * x);
  /** displacement gradient, cm/m: negative where the medium is compressed */
  const dydx = (x, t) => -st.A * k() * Math.cos(w() * t - k() * x);

  /* ---------------------------------------------------------- surfaces */

  const mv = surface(MW, MH, { label: 'A wave travelling through a medium' });
  const tg = surface(GW, GH, { label: 'Displacement of one particle against time' });
  const xg = surface(GW, GH, { label: 'Displacement of the whole medium against position' });

  const trace = [];                  // [t, y] for the marked particle

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'f',  label: 'Frequency <i>f</i>' },
    { key: 'T',  label: 'Period <i>T</i> = 1/<i>f</i>  (read off the LEFT graph)' },
    { key: 'l',  label: 'Wavelength <i>λ</i>  (read off the RIGHT graph)' },
    { key: 'v',  label: '<i>v</i> = <i>fλ</i>' },
    { key: 'w',  label: '<i>ω</i> = 2π<i>f</i>' },
    { key: 'k',  label: '<i>k</i> = 2π/<i>λ</i>' },
    { key: 'p',  label: 'Marked particle: position, and its phase lag <i>kx</i>' },
    { key: 'd',  label: 'Its displacement and velocity now' },
  ]);

  /* ---------------------------------------------------------- controls */

  const sF = slider({ label: '<i>f</i>', min: F_MIN, max: F_MAX, step: 0.01, value: st.f,
    format: v => `${v.toFixed(2)} Hz`, onInput: v => { st.f = v; afterChange('f'); } });
  const sL = slider({ label: '<i>λ</i>', min: L_MIN, max: L_MAX, step: 0.01, value: st.lam,
    format: v => `${v.toFixed(2)} m`, onInput: v => { st.lam = v; afterChange('lam'); } });
  const sV = slider({ label: '<i>v</i>', min: V_MIN, max: V_MAX, step: 0.01, value: vOf(),
    format: v => `${v.toFixed(2)} m s⁻¹`, onInput: v => { setV(v); afterChange('v'); } });
  const sA = slider({ label: '<i>A</i>', min: A_MIN, max: A_MAX, step: 0.05, value: st.A,
    format: v => `${v.toFixed(2)} cm`, onInput: v => { st.A = v; } });
  const sS = slider({ label: 'sim speed', word: true, min: 0.1, max: 1.5, step: 0.1, value: 1,
    format: v => `×${v.toFixed(1)}`, onInput: v => { st.speed = v; } });

  /** v is not free: moving it moves whichever of f or lambda is not derived */
  function setV(v) {
    if (st.derive === 'f')   { st.lam = clamp(st.lam, L_MIN, L_MAX); st.f = clamp(v / st.lam, F_MIN, F_MAX); }
    else                     { st.lam = clamp(v / st.f, L_MIN, L_MAX); }
  }

  /** re-derive the dependent quantity and push every slider back into line */
  function afterChange() {
    if (st.derive === 'v')   { /* v follows automatically */ }
    else if (st.derive === 'f')   st.f   = clamp(vOf() / st.lam, F_MIN, F_MAX);
    else if (st.derive === 'lam') st.lam = clamp(st.lam, L_MIN, L_MAX);
    syncSliders();
    trace.length = 0;
  }

  function syncSliders() {
    sF.set(st.f); sL.set(st.lam); sV.set(vOf());
    sF.disable(st.derive === 'f');
    sL.disable(st.derive === 'lam');
    sV.disable(st.derive === 'v');
  }

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bTrans = button({ label: 'Transverse', pressed: true, onClick: () => setMode('transverse') });
  const bLong  = button({ label: 'Longitudinal', pressed: false, onClick: () => setMode('longitudinal') });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann));
  } });

  function setMode(m) {
    st.mode = m;
    bTrans.setPressed(m === 'transverse');
    bLong.setPressed(m === 'longitudinal');
  }

  const dBtns = {};
  function setDerive(d) {
    st.derive = d;
    for (const [key, b] of Object.entries(dBtns)) b.setPressed(key === d);
    // re-derive at once so the three are consistent the moment you switch
    if (d === 'f')        st.f   = clamp(vOf() / st.lam, F_MIN, F_MAX);
    else if (d === 'lam') st.lam = clamp(vOf() / st.f,   L_MIN, L_MAX);
    syncSliders();
    trace.length = 0;
  }
  dBtns.v   = button({ label: '<i>v</i> = fλ'.replace(/<[^>]+>/g, ''), pressed: true,
                       onClick: () => setDerive('v') });
  dBtns.f   = button({ label: 'f = v/λ',  pressed: false, onClick: () => setDerive('f') });
  dBtns.lam = button({ label: 'λ = v/f',  pressed: false, onClick: () => setDerive('lam') });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Wave Anatomy',
            'transverse and longitudinal — and the difference between the two graphs'),
    panelBox('Medium — drag anywhere to move the marked particle', mv.el),
    el('div', { class: 'wa-row' }, [
      el('div', { class: 'wa-half' }, [
        panelBox('ONE particle against TIME — this gives the period', tg.el),
      ]),
      el('div', { class: 'wa-half' }, [
        panelBox('The WHOLE medium against POSITION — this gives the wavelength', xg.el),
      ]),
    ]),
    controls([el('div', { class: 'ibs-btns' },
      [bPlay.node, bTrans.node, bLong.node, bAnn.node])]),
    controls([el('div', { class: 'ibs-btns' }, [dBtns.v.node, dBtns.f.node, dBtns.lam.node])],
             { label: 'which one is derived:' }),
    controls([sF.node, sL.node, sV.node, sA.node, sS.node]),
    out.node,
    note('<b>The wave.</b> Every pixel here comes from one expression, ' +
         '<i>y</i>(<i>x</i>,<i>t</i>) = <i>A</i> sin(2π(<i>t</i>/<i>T</i> − <i>x</i>/<i>λ</i>)), ' +
         'evaluated in closed form, so the medium and both graphs cannot drift apart. ' +
         '<b>The two graphs are not the same picture.</b> The left one watches a single ' +
         'particle for several seconds, so the distance between its peaks is a <b>time</b>, ' +
         'the period. The right one is the whole medium frozen at this instant, so the ' +
         'distance between its peaks is a <b>length</b>, the wavelength. Move the amplitude ' +
         'and both change; move the frequency and only the left one changes its spacing. ' +
         'Note also that <i>v</i> = <i>fλ</i> is a constraint, not three free choices: pick ' +
         'which of the three follows from the other two.')
  );

  const cssId = 'ibs-c2-wave-anatomy-v1';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent = `
.ibs .wa-row{ display:flex; gap:14px; align-items:flex-start; }
.ibs .wa-half{ flex:1 1 0; min-width:0; }
@container (max-width: 900px){ .ibs .wa-row{ flex-direction:column; } }
`;
    document.head.appendChild(s);
  }

  /* ================================================================== *
   * the medium
   * ================================================================== */

  let P = palette(root);

  const M = () => metrics(mv.w);
  const xPix = x => { const m = M(); return m.X0 + x * m.PPM; };
  const xMet = px => { const m = M(); return clamp((px - m.X0) / m.PPM, 0, L_MEDIUM); };

  /* the medium's vertical layout, in one place */
  const MID = 100, DENS_Y = 142, DENS_H = 26, LABEL_Y = 184, SCALE_Y = 198;

  function drawMedium() {
    const ctx = mv.ctx, mid = MID;
    const { X0, X1 } = M();
    const MWn = mv.w;
    ctx.clearRect(0, 0, MWn, MH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, MWn, MH);

    /* the position scale, shared with the right-hand graph */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X0, SCALE_Y); ctx.lineTo(X1, SCALE_Y); ctx.stroke();
    ctx.font = `500 10.5px ${P.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = 0; x <= L_MEDIUM + 1e-9; x += 1) {
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(xPix(x), SCALE_Y); ctx.lineTo(xPix(x), SCALE_Y + 7); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(String(x), xPix(x), SCALE_Y + 11);
    }
    ctext(ctx, 'x (m)', X1 + 6, SCALE_Y + 4, { font: P.sym(13), color: P.text });

    if (st.mode === 'transverse') drawTransverse(ctx, mid);
    else                          drawLongitudinal(ctx, mid);

    /* which way the wave is going */
    if (carrow(ctx, X1 - 150, 30, X1 - 40, 30,
               { color: P.accent, width: 2.4, head: 9 })) {
      ctext(ctx, `v = ${fmt(vOf(), 2)} m s⁻¹`, X1 - 156, 34,
        { font: `600 12px ${P.font}`, color: P.accent, align: 'right' });
    }

    if (st.ann) {
      callout(ctx, st.mode === 'transverse'
        ? ['The marked particle only moves up and down,',
           'in place. Energy travels along the medium;',
           'matter does not.']
        : ['The particles move along the direction of travel.',
           'Where they crowd together the medium is',
           'compressed. The strip below is shaded from the',
           'displacement gradient, so it is exact.'],
        X0 + 8, 22, xPix(st.xm), mid, { palette: P });
    }
  }

  function drawTransverse(ctx, mid) {
    const { X0, X1, SPACING } = M();
    /* the undisturbed line */
    ctx.save();
    ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.35; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X0, mid); ctx.lineTo(X1, mid); ctx.stroke();
    ctx.restore();

    /* the string */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let px = X0; px <= X1; px += 2) {
      const yy = mid - y(xMet(px), st.t) * PX_TRANS;
      px === X0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
    }
    ctx.stroke();

    /* the particles that make it up */
    for (let i = 0; i < N_PARTICLES; i += 2) {
      const px = X0 + i * SPACING;
      ctx.fillStyle = P.accent; ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(px, mid - y(xMet(px), st.t) * PX_TRANS, 2.6, 0, TAU);
      ctx.fill(); ctx.globalAlpha = 1;
    }

    drawMarker(ctx, mid, false);
  }

  function drawLongitudinal(ctx, mid) {
    const { X0, X1, SPACING, PPM, PX_LONG } = M();
    /* the density strip, shaded from the displacement gradient, not from
       counting dots, so it is exact */
    const band = DENS_H;
    for (let px = X0; px < X1; px += 3) {
      const g = dydx(xMet(px), st.t) / (st.A * k() || 1);   // -1 .. +1
      const compress = -g;                                   // +1 at a compression
      ctx.fillStyle = P.accent;
      ctx.globalAlpha = 0.06 + 0.34 * (0.5 + 0.5 * compress);
      ctx.fillRect(px, DENS_Y, 3, band);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.strokeRect(X0, DENS_Y, X1 - X0, band);
    ctext(ctx, 'density', X0 - 8, DENS_Y + band / 2 + 4,
      { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* the particles */
    for (let i = 0; i < N_PARTICLES; i++) {
      const xe = i * SPACING / PPM;                 // equilibrium position, m
      const px = X0 + i * SPACING + y(xe, st.t) * PX_LONG;
      ctx.fillStyle = P.accent; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(px, mid, 4.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawMarker(ctx, mid, true);

    if (st.ann) {
      // name one compression and one rarefaction, not every one of them
      const pick = off => {
        for (let n = -3; n <= 9; n++) {
          const xx = (w() * st.t - off - TAU * n) / k();
          if (xx > 1.6 && xx < L_MEDIUM - 0.8) return xx;
        }
        return null;
      };
      const xc = pick(0), xr = pick(Math.PI);
      if (xc != null) ctext(ctx, 'compression', xPix(xc), DENS_Y - 7,
        { font: `600 10.5px ${P.font}`, color: P.accent, align: 'center', halo: P.bg });
      if (xr != null) ctext(ctx, 'rarefaction', xPix(xr), DENS_Y - 7,
        { font: `600 10.5px ${P.font}`, color: P.muted, align: 'center', halo: P.bg });
    }
  }

  /** the one particle the left-hand graph is watching */
  function drawMarker(ctx, mid, longitudinal) {
    const { PX_LONG } = M();
    const yc = y(st.xm, st.t);
    const ex = xPix(st.xm);
    const px = longitudinal ? ex + yc * PX_LONG : ex;
    const py = longitudinal ? mid : mid - yc * PX_TRANS;

    /* its equilibrium position, so "it stays at the same x" is visible */
    ctx.save();
    ctx.strokeStyle = P.text; ctx.globalAlpha = 0.4; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ex, mid - 58); ctx.lineTo(ex, SCALE_Y); ctx.stroke();
    ctx.restore();

    /* the path it is confined to */
    ctx.save();
    ctx.strokeStyle = P.text; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (longitudinal) {
      ctx.moveTo(ex - st.A * PX_LONG, mid - 13); ctx.lineTo(ex + st.A * PX_LONG, mid - 13);
      ctx.moveTo(ex - st.A * PX_LONG, mid - 16); ctx.lineTo(ex - st.A * PX_LONG, mid - 10);
      ctx.moveTo(ex + st.A * PX_LONG, mid - 16); ctx.lineTo(ex + st.A * PX_LONG, mid - 10);
    } else {
      ctx.moveTo(ex, mid - st.A * PX_TRANS); ctx.lineTo(ex, mid + st.A * PX_TRANS);
      ctx.moveTo(ex - 5, mid - st.A * PX_TRANS); ctx.lineTo(ex + 5, mid - st.A * PX_TRANS);
      ctx.moveTo(ex - 5, mid + st.A * PX_TRANS); ctx.lineTo(ex + 5, mid + st.A * PX_TRANS);
    }
    ctx.stroke(); ctx.restore();

    const gr = ctx.createRadialGradient(px - 2.5, py - 3, 1, px, py, 9);
    gr.addColorStop(0, '#dceef0');
    gr.addColorStop(0.3, '#5fa3ab');
    gr.addColorStop(1, '#00323a');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.5; ctx.stroke();

    /* the direction it is moving in right now */
    const v = vy(st.xm, st.t);
    if (Math.abs(v) > st.A * 0.25) {
      const L = clamp(v * 9, -34, 34);
      if (longitudinal) carrow(ctx, px, py - 20, px + L, py - 20,
        { color: P.text, width: 2, head: 7, min: 6 });
      else carrow(ctx, px + 20, py, px + 20, py - L,
        { color: P.text, width: 2, head: 7, min: 6 });
    }
    ctext(ctx, 'the marked particle', ex, LABEL_Y,
      { font: `600 10.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
  }

  /* ================================================================== *
   * the two graphs
   * ================================================================== */

  /** a shared frame, so the two graphs are visibly the same kind of object */
  function frameOf(ctx, yLabel, xLabel) {
    const p = { l: 52, r: 16, t: 22, b: 46 };
    const A0 = p.l, A1 = GW - p.r, B0 = p.t, B1 = GH - p.b;
    ctx.clearRect(0, 0, GW, GH);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW, GH);
    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(A0, B0, A1 - A0, B1 - B0);
    ctx.save();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = P.frame;
    ctx.beginPath(); ctx.moveTo(A0, (B0 + B1) / 2); ctx.lineTo(A1, (B0 + B1) / 2); ctx.stroke();
    ctx.restore();
    ctx.font = `500 10px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('+' + fmt(A_MAX, 1), A0 - 5, B0 + 5);
    ctx.fillText('0', A0 - 5, (B0 + B1) / 2);
    ctx.fillText('−' + fmt(A_MAX, 1), A0 - 5, B1 - 5);
    ctx.fillStyle = P.text;
    ctx.save();
    ctx.translate(13, (B0 + B1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = P.sym(12); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctext(ctx, xLabel, (A0 + A1) / 2, B1 + 34,
      { font: P.sym(12), color: P.text, align: 'center' });
    return { A0, A1, B0, B1, Y: c => (B0 + B1) / 2 - (c / A_MAX) * ((B1 - B0) / 2) };
  }

  /** a double-headed measuring arrow with a label, the thing being taught */
  function measure(ctx, x1, x2, yy, label) {
    ctx.save();
    ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, yy - 6); ctx.lineTo(x1, yy + 6);
    ctx.moveTo(x2, yy - 6); ctx.lineTo(x2, yy + 6);
    ctx.stroke();
    ctx.restore();
    carrow(ctx, x1, yy, x2, yy, { color: P.text, width: 1.4, head: 7, min: 4 });
    carrow(ctx, x2, yy, x1, yy, { color: P.text, width: 1.4, head: 7, min: 4 });
    ctext(ctx, label, (x1 + x2) / 2, yy - 9,
      { font: P.sym(13), color: P.text, align: 'center', halo: P.bg });
  }

  const T_WINDOW = 8;                 // s shown on the time graph

  function drawTimeGraph() {
    const ctx = tg.ctx;
    const F = frameOf(ctx, 'y (cm)', 't (s)');
    const t0 = Math.max(0, st.t - T_WINDOW);
    const TX = u => F.A0 + (u - t0) / T_WINDOW * (F.A1 - F.A0);

    ctx.font = `500 10px ${P.font}`; ctx.fillStyle = P.muted;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let u = Math.ceil(t0 / 2) * 2; u <= t0 + T_WINDOW + 1e-9; u += 2) {
      const gx = TX(u);
      if (gx < F.A0 - 0.5 || gx > F.A1 + 0.5) continue;
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(gx, F.B0); ctx.lineTo(gx, F.B1); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(u.toFixed(0), gx, F.B1 + 5);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(F.A0, F.B0 - 2, F.A1 - F.A0, F.B1 - F.B0 + 4); ctx.clip();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (const d of trace) {
      const gx = TX(d[0]);
      if (gx < F.A0 - 4) continue;
      started ? ctx.lineTo(gx, F.Y(d[1])) : ctx.moveTo(gx, F.Y(d[1]));
      started = true;
    }
    ctx.stroke();

    /* one period, marked on the graph that actually shows a period */
    const T = 1 / st.f;
    if (st.t > T * 1.2 && TX(st.t - T) > F.A0 + 6) {
      measure(ctx, TX(st.t - T), TX(st.t), F.B0 + 16, `T = ${fmt(T, 2)} s`);
    }
    ctx.restore();

    if (trace.length) {
      const d = trace[trace.length - 1];
      ctx.fillStyle = P.text;
      ctx.beginPath(); ctx.arc(TX(d[0]), F.Y(d[1]), 3.6, 0, TAU); ctx.fill();
    }
    ctext(ctx, `the particle at x = ${fmt(st.xm, 2)} m`, F.A1 - 4, F.B0 - 6,
      { font: `600 11px ${P.font}`, color: P.accent, align: 'right' });
  }

  function drawPositionGraph() {
    const ctx = xg.ctx;
    const F = frameOf(ctx, 'y (cm)', 'x (m)');
    const PX = u => F.A0 + (u / L_MEDIUM) * (F.A1 - F.A0);

    ctx.font = `500 10px ${P.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let u = 0; u <= L_MEDIUM + 1e-9; u += 1) {
      const gx = PX(u);
      ctx.strokeStyle = P.line;
      ctx.beginPath(); ctx.moveTo(gx, F.B0); ctx.lineTo(gx, F.B1); ctx.stroke();
      ctx.fillStyle = P.muted; ctx.fillText(u.toFixed(0), gx, F.B1 + 5);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(F.A0, F.B0 - 2, F.A1 - F.A0, F.B1 - F.B0 + 4); ctx.clip();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const x = L_MEDIUM * i / 400, gx = PX(x);
      i ? ctx.lineTo(gx, F.Y(y(x, st.t))) : ctx.moveTo(gx, F.Y(y(x, st.t)));
    }
    ctx.stroke();

    /* one wavelength, marked on the graph that actually shows a wavelength.
       A crest sits where omega t - k x = pi/2, so they are a wavelength apart. */
    const xc = crestNear(L_MEDIUM * 0.3);
    if (xc != null && xc + st.lam < L_MEDIUM) {
      measure(ctx, PX(xc), PX(xc + st.lam), F.B0 + 16, `λ = ${fmt(st.lam, 2)} m`);
    }
    ctx.restore();

    /* the marked particle, on this graph too, so the link is obvious */
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(PX(st.xm), F.Y(y(st.xm, st.t)), 4.2, 0, TAU); ctx.fill();
    ctext(ctx, 'this instant only', F.A1 - 4, F.B0 - 6,
      { font: `600 11px ${P.font}`, color: P.accent, align: 'right' });
  }

  /** the first crest at or after x, in metres, or null if there is none */
  function crestNear(x) {
    const n = Math.ceil((w() * st.t - k() * x - Math.PI / 2) / TAU);
    const xc = (w() * st.t - Math.PI / 2 - TAU * n) / k();
    return xc >= 0 && xc <= L_MEDIUM ? xc : null;
  }

  /* ================================================================== *
   * drag the marker
   * ================================================================== */

  const onDown = e => {
    st.dragging = true;
    st.xm = clamp(xMet(mv.at(e).x), 0.05, L_MEDIUM - 0.05);
    trace.length = 0;
    mv.el.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = e => {
    if (!st.dragging) { mv.el.style.cursor = 'pointer'; return; }
    st.xm = clamp(xMet(mv.at(e).x), 0.05, L_MEDIUM - 0.05);
    trace.length = 0;
    e.preventDefault();
  };
  const onUp = e => {
    if (!st.dragging) return;
    st.dragging = false;
    try { mv.el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  mv.el.addEventListener('pointerdown', onDown);
  mv.el.addEventListener('pointermove', onMove);
  mv.el.addEventListener('pointerup', onUp);
  mv.el.addEventListener('pointercancel', onUp);
  onDestroy(() => {
    mv.el.removeEventListener('pointerdown', onDown);
    mv.el.removeEventListener('pointermove', onMove);
    mv.el.removeEventListener('pointerup', onUp);
    mv.el.removeEventListener('pointercancel', onUp);
  });

  /* ================================================================== *
   * frame
   * ================================================================== */

  function frame(dt) {
    if (st.playing) {
      st.t += Math.min(dt, 0.1) * st.speed;
      trace.push([st.t, y(st.xm, st.t)]);
      const cut = st.t - T_WINDOW * 1.3;
      while (trace.length && trace[0][0] < cut) trace.shift();
    }
    render();
  }

  function render() {
    drawMedium(); drawTimeGraph(); drawPositionGraph();
    const phi = (k() * st.xm * 180 / Math.PI) % 360;
    out.setAll({
      f: `${fmt(st.f, 3)} Hz`,
      T: `${fmt(1 / st.f, 3)} s`,
      l: `${fmt(st.lam, 3)} m`,
      v: `${fmt(vOf(), 3)} m s⁻¹`,
      w: `${fmt(w(), 2)} rad s⁻¹`,
      k: `${fmt(k(), 2)} rad m⁻¹`,
      p: `x = ${fmt(st.xm, 2)} m,  lags by ${fmt(phi, 0)}°`,
      d: `${fmt(y(st.xm, st.t), 3)} cm,  ${fmt(vy(st.xm, st.t), 2)} cm s⁻¹`,
    });
  }

  function fitAll() {
    P = palette(root);
    // the medium carries a metre scale, so one logical unit stays one CSS pixel
    const cw = Math.round(mv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) mv.setLogical(clamp(cw, 360, MW), MH);
    mv.fit(); tg.fit(); xg.fit();
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

  syncSliders();
  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      Object.assign(st, p);
      if (p.derive) setDerive(p.derive); else { afterChange(); }
      render();
    },
    _state: () => ({
      f: st.f, lam: st.lam, A: st.A, v: vOf(), w: w(), k: k(),
      t: st.t, xm: st.xm, mode: st.mode,
      y: y(st.xm, st.t), vy: vy(st.xm, st.t),
    }),
    _y: (x, t) => y(x, t),
    _dydx: (x, t) => dydx(x, t),
    /** the drawn x of particle i in longitudinal mode, in px */
    _particleX: (i, t) => { const m = M();
      return m.X0 + i * m.SPACING + y(i * m.SPACING / m.PPM, t) * m.PX_LONG; },
    _consts: () => ({ MW: mv.w, MH, L_MEDIUM, N_PARTICLES, PX_TRANS,
                      A_MAX, F_MIN, F_MAX, L_MIN, L_MAX, ...M() }),
    _advance: seconds => { st.t += seconds; return st.t; },
  };
}
