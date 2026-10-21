/* ============================================================================
 * C3-1  Ripple Tank
 * IB Physics C.3 Wave phenomena
 *
 * The apparatus wave behaviour is taught with, and — uniquely among the
 * simulations in this set — one where NOTHING has to be exaggerated. Water
 * ripples are centimetres long and a tank is a few tens of centimetres across,
 * so the wavelength, the gap, the separation and the tank all fit on the same
 * ruler at the same time. The top panel is always the same 320 mm × 180 mm
 * piece of tank whatever the screen, drawn to scale, with the millimetre scale
 * printed along the bottom so you can check it against a real ruler.
 *
 * That matters for one lesson above all. In the light simulations a slit is
 * always hundreds of wavelengths wide, so a diffracted beam is always narrow
 * and the relation between gap and spreading has to be argued. Here you can
 * simply wind the gap down to about a wavelength and watch the beam open out
 * into a semicircle.
 *
 * ---------------------------------------------------------------------------
 * PHYSICS MODEL
 *
 * The water supplies its own numbers. A shallow-water wave travels at
 *
 *     v = √(g h)
 *
 * so the depth sets the speed, and the dipper's frequency sets the rest:
 *
 *     λ = v / f
 *
 * Both are real relations with real values — 5 mm of water gives 0.221 m s⁻¹,
 * and a 10 Hz dipper then makes 22 mm ripples, which is what a school tank
 * does. Everything after that is the same Huygens–Fresnel sum as the slit
 * simulations: every point of every opening, and every dipper, radiates a
 * wavelet, and the pattern is their sum. No fringe is drawn by hand.
 *
 * THE ONE LIBERTY, AND IT IS DECLARED
 *
 * Time. A 10 Hz ripple would be a grey blur at 60 frames a second, so the
 * clock runs slow by a single fixed factor SLOW. Because the factor is fixed,
 * everything else stays honest: the wave on the screen still travels at v/SLOW,
 * so raising f still shortens the ripples without changing their speed, and
 * deepening the water still speeds them up.
 *
 * FOUR THINGS A RIPPLE TANK IS FOR
 *
 *   one gap        diffraction, and its dependence on b/λ
 *   two gaps       the double slit, at a scale you can see
 *   two dippers    interference from two sources, with the nodal lines that
 *                  make the classic photograph
 *   a reflector    a straight barrier — and the fact that the reflected wave is
 *                  exactly the wave of an IMAGE source behind it, which is
 *                  where "angle in = angle out" comes from. It is computed that
 *                  way here, not drawn as a mirrored ray. A rigid wall reflects
 *                  with no phase change, so the image is in step with the
 *                  dipper, and the wall itself is an antinode.
 * ==========================================================================*/

import {
  createRoot, el, heading, panelBox, controls, note, button, slider,
  readouts, loop, fmt, clamp, surface, palette, carrow, ctext, chatch, callout,
} from '../sim-kit.js';
import { HuygensField } from '../huygens.js';

/* ---------------------------------------------------------------- config */

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;
const MW = 1120;
const HB = 300;
const CELL = 3;

/* the piece of tank the top panel always shows, in millimetres */
const TANK_X = 320;                     // along the direction the waves travel
const TANK_Y = 180;                     // across the tank
const ASPECT = TANK_Y / TANK_X;
/* the ruler gets a band of its own below the water, so that no part of the
 * tank is hidden behind it and "320 mm × 180 mm, to scale" stays exactly true */
const RULER = 26;
const panelH = w => Math.round(w * ASPECT) + RULER;

const H_MIN = 2, H_MAX = 10;            // mm of water
const F_MIN = 4, F_MAX = 24;            // Hz
const B_MIN = 5, B_MAX = 80;            // mm, gap width
const D_MIN = 20, D_MAX = 130;          // mm, separation
const D_MAX_MIRROR = 70;                // mm, so the image source stays drawn
const G = 9.81;
const NARROW = 720;
const SLOW = 20;                        // the declared slow-motion factor

/* where things stand, as fractions of the panel */
const BAR_F = 0.16, PROBE_F = 0.62, MIRROR_SRC_F = 0.30;

const MODES = {
  gap:     { name: 'one gap' },
  two:     { name: 'two gaps' },
  dippers: { name: 'two dippers' },
  mirror:  { name: 'a reflector' },
};

/** a shallow-water wave: the depth sets the speed */
export function speedOf(hMm) { return Math.sqrt(G * hMm * 1e-3); }

export default function mount(container, options = {}) {
  const { root, onDestroy, destroy } = createRoot(container, {
    id: 'c3-ripple-tank',
    title: 'Ripple tank',
    theme: options.theme,
    shadow: options.shadow,
  });

  /* ------------------------------------------------------------- state */

  const st = {
    mode: 'gap',
    hMm: 5, fHz: 10, bMm: 22, dMm: 60,
    probeMm: 0,                 // where the probe sits, mm along the probe line
    t: 0, playing: true, avg: false, ann: false, dragging: false,
  };

  const vOf = () => speedOf(st.hMm);                 // m/s
  const lamMm = () => vOf() / st.fHz * 1e3;          // mm
  const isBarrier = () => st.mode === 'gap' || st.mode === 'two';
  const isPair = () => st.mode === 'two' || st.mode === 'dippers';

  /* ---------------------------------------------------------- surfaces */

  const fv = surface(MW, panelH(MW),
                     { label: 'A ripple tank seen from above, drawn to scale in millimetres' });
  const bv = surface(MW, HB,
                     { label: 'How much the water moves along a line across the tank' });

  /* the tank is drawn to scale, so an opening can be a fraction of a wavelength
   * or a dozen of them; the sampling has to be good enough for both */
  const field = new HuygensField({ W: MW, H: Math.round(MW * ASPECT), cell: CELL,
                                  minSources: 8, maxSources: 64 });
  let profile = [];
  /* the largest raw amplitude along the probe line — what `profile` was
   * divided by, kept so the probe dot can be put back on the curve */
  let rawMaxCache = 1;

  /* the top panel: one fixed rectangle of tank, whatever the screen */
  const GF = () => {
    const W = fv.w, Ht = Math.round(W * ASPECT), H = Ht + RULER, mm = W / TANK_X;
    /* the reflector stands far enough up the panel to leave room for the image
     * source below it, and no further: dry bench is wasted drawing */
    const wallY = Math.round(clamp(Ht - st.dMm * mm - 30, 0.40 * Ht, 0.80 * Ht));
    return { W, H, Ht, mm, sm: W < NARROW,
             barX: Math.round(W * (st.mode === 'mirror' ? MIRROR_SRC_F : BAR_F)),
             probeX: Math.round(W * PROBE_F),
             midY: Math.round(Ht / 2),
             wallY,
             /* the symmetry line of the arrangement, and how far the probe line
              * runs either side of it — a reflector is only water on one side */
             axisY: st.mode === 'mirror' ? wallY : Math.round(Ht / 2),
             lo: st.mode === 'mirror' ? 0 : -(Ht / 2) / mm,
             hi: st.mode === 'mirror' ? wallY / mm : (Ht / 2) / mm };
  };

  /* the lower panel maps that same millimetre range onto its plot box */
  const GB = () => {
    const W = bv.w, sm = W < NARROW;
    const x0 = sm ? 44 : 70, x1 = W - (sm ? 20 : 48);
    const g = GF();
    const lo = g.lo, hi = g.hi;
    return { W, sm, x0, x1, lo, hi,
             xOf: v => x0 + (v - lo) / (hi - lo) * (x1 - x0),
             vOf: px => clamp(lo + (px - x0) / (x1 - x0) * (hi - lo), lo, hi) };
  };

  /** canvas y for a position along the probe line, in mm from the axis */
  const yOfMm = (g, v) => st.mode === 'mirror' ? g.axisY - v * g.mm : g.axisY + v * g.mm;
  /** and back again */
  const mmOfY = (g, y) => st.mode === 'mirror' ? (g.axisY - y) / g.mm : (y - g.axisY) / g.mm;

  function syncField() {
    const g = GF();
    field.W = g.W;
    /* six cells to a wavelength, whatever the wavelength: a fixed cell would
     * alias the shortest ripples on a phone, where the whole tank is 390 px
     * wide, and would waste work on the longest ones */
    field.cell = clamp(Math.round(lamMm() * g.mm / 6 * 2) / 2, 1.5, 4);
    /* a reflector is a wall: there is no water behind it, so the grid stops */
    field.H = st.mode === 'mirror' ? g.wallY : g.Ht;
    field.lamPx = lamMm() * g.mm;
    field.barrierX = g.barX; field.screenX = g.W;
    field.fullField = !isBarrier();
    const bpx = st.bMm * g.mm, dpx = st.dMm * g.mm;
    let ap;
    if (st.mode === 'gap') {
      ap = [{ y: g.midY, half: bpx / 2 }];
    } else if (st.mode === 'two') {
      ap = [{ y: g.midY - dpx / 2, half: bpx / 2 },
            { y: g.midY + dpx / 2, half: bpx / 2 }];
    } else if (st.mode === 'dippers') {
      ap = [{ x: g.barX, y: g.midY - dpx / 2, half: 0, iso: true },
            { x: g.barX, y: g.midY + dpx / 2, half: 0, iso: true }];
    } else {
      /* one dipper and its image in the wall: the reflected wave IS the
       * image's wave, which is why the angles come out equal. A rigid wall
       * gives no phase change, so the image is in step. */
      ap = [{ x: g.barX, y: g.wallY - dpx, half: 0, iso: true },
            { x: g.barX, y: g.wallY + dpx, half: 0, iso: true }];
    }
    field.setApertures(ap);
    if (field.compute()) profile = probeLine(g);
  }

  /** the amplitude along the probe line, normalised to its own largest */
  function probeLine(g) {
    const out = [];
    const yTop = 0, yBot = st.mode === 'mirror' ? g.wallY : g.Ht;
    let mx = 0;
    for (let y = yTop; y <= yBot; y += 2) {
      const [re, im] = field.at(g.probeX, y);
      const a = Math.hypot(re, im);
      if (a > mx) mx = a;
      out.push([y, a]);
    }
    rawMaxCache = mx > 0 ? mx : 1;
    return out.map(([y, a]) => [y, a / rawMaxCache]);
  }

  /* ---------------------------------------------------------- readouts */

  const out = readouts([
    { key: 'wt', label: 'Water depth, and the speed it gives, <i>v</i> = √(<i>gh</i>)' },
    { key: 'wl', label: 'Dipper frequency, and the wavelength, <i>λ</i> = <i>v</i>/<i>f</i>' },
    { key: 'ge', label: 'The geometry on the bench' },
    { key: 'rt', label: 'In wavelengths — the only ratio that matters' },
    { key: 'sp', label: 'How far the wave spreads past the gap' },
    { key: 'or', label: 'Directions of the maxima, <i>d</i>&thinsp;sin<i>θ</i> = <i>mλ</i>' },
    { key: 'nd', label: 'Nodal lines — where the water never moves' },
    { key: 'pb', label: 'At the probe: position, and the path difference there' },
    { key: 'sc', label: 'The scale of this drawing, and the one liberty taken' },
    { key: 'nt', label: 'What this arrangement is showing' },
  ]);

  /* ---------------------------------------------------------- controls */

  /* A wide pair of gaps in shallow, fast water is a hundred-odd sources over
   * sixty thousand cells, which is tens of milliseconds. A pointer can send
   * more events than that per second, so a drag asks for the work at most once
   * per frame rather than once per event. */
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  const sH = slider({ label: '<i>h</i>', min: H_MIN, max: H_MAX, step: 0.5, value: st.hMm,
    format: v => `${v.toFixed(1)} mm deep`, onInput: v => { st.hMm = v; schedule(); } });
  const sF = slider({ label: '<i>f</i>', min: F_MIN, max: F_MAX, step: 0.5, value: st.fHz,
    format: v => `${v.toFixed(1)} Hz`, onInput: v => { st.fHz = v; schedule(); } });
  const sB = slider({ label: '<i>b</i>', min: B_MIN, max: B_MAX, step: 1, value: st.bMm,
    format: v => `${v.toFixed(0)} mm gap`, onInput: v => { st.bMm = v; schedule(); } });
  const sD = slider({ label: '<i>d</i>', min: D_MIN, max: D_MAX, step: 1, value: st.dMm,
    format: v => `${v.toFixed(0)} mm`, onInput: v => { st.dMm = v; schedule(); } });

  const bMode = Object.keys(MODES).map(k => button({
    label: MODES[k].name, pressed: k === st.mode, onClick: () => setMode(k),
  }));

  function setMode(k) {
    st.mode = k;
    bMode.forEach((b, i) => b.setPressed(Object.keys(MODES)[i] === k));
    sB.node.hidden = !(k === 'gap' || k === 'two');
    sD.node.hidden = (k === 'gap');
    /* the reflector has to keep its image source on the drawing */
    st.dMm = sD.setRange(D_MIN, k === 'mirror' ? D_MAX_MIRROR : D_MAX);
    sD.node.querySelector('label').innerHTML =
      k === 'mirror' ? 'to&nbsp;wall' : '<i>d</i>';
    if (k === 'mirror') st.probeMm = clamp(st.probeMm, 0, 1e9);
    render();
  }

  const bPlay = button({ label: '⏸ Pause', pressed: true, onClick: b => {
    st.playing = !st.playing;
    b.textContent = st.playing ? '⏸ Pause' : '▶ Play';
    b.setAttribute('aria-pressed', String(st.playing));
  } });
  const bAvg = button({ label: 'Time-average — the photograph', pressed: false, onClick: b => {
    st.avg = !st.avg; b.setAttribute('aria-pressed', String(st.avg)); render();
  } });
  const bMatch = button({ label: 'Make the gap one wavelength', onClick: () => {
    if (!isBarrier()) setMode('gap');
    st.bMm = clamp(Math.round(lamMm()), B_MIN, B_MAX); sB.set(st.bMm); render();
  } });
  const bAnn = button({ label: 'Annotations', pressed: false, onClick: b => {
    st.ann = !st.ann; b.setAttribute('aria-pressed', String(st.ann)); render();
  } });

  /* ------------------------------------------------------------ layout */

  root.append(
    heading('Ripple Tank',
            'the one figure in this set that needs no exaggeration in space at all — every length to scale'),
    controls([el('div', { class: 'ibs-btns' }, bMode.map(b => b.node))], { label: 'set up:' }),
    panelBox('The tank from above — 320 mm × 180 mm of it, to scale', fv.el),
    panelBox('Along the dashed line across the tank — drag to move the probe', bv.el),
    controls([el('div', { class: 'ibs-btns' }, [bPlay.node, bAvg.node, bMatch.node, bAnn.node])]),
    controls([sH.node, sF.node, sB.node, sD.node]),
    out.node,
    note('<b>Every length here is to scale.</b> Water ripples are centimetres long and a tank is ' +
         'tens of centimetres across, so for once the wavelength, the gap and the apparatus all ' +
         'fit on one ruler — and it is printed along the bottom. That makes one thing visible ' +
         'that a light experiment never can: press <b>make the gap one wavelength</b> ' +
         'and watch the beam stop being a beam. A gap many wavelengths across passes a wave ' +
         'almost straight through; a gap of about one wavelength turns it into a single ' +
         'semicircular wavelet. <b>Diffraction matters when the gap is comparable to the ' +
         'wavelength</b> — that sentence is examinable, and here it is a thing you do rather ' +
         'than a thing you are told. The water supplies its own numbers: the depth sets the ' +
         'speed through <i>v</i> = √(<i>gh</i>) and the dipper sets the frequency, so ' +
         '<i>λ</i> = <i>v</i>/<i>f</i>. The reflector is not drawn with a mirrored ray: the ' +
         'reflected wave is computed as the wave of an <b>image source</b> behind the barrier, ' +
         'which is where "angle of incidence = angle of reflection" comes from in the first ' +
         'place. <b>One liberty, and only one:</b> a 10 Hz ripple would be a blur, so the clock ' +
         `runs slow by a fixed factor of ${SLOW}. Because the factor is fixed, the wave on the ` +
         'screen still travels at the real <i>v</i> divided by that factor, so raising <i>f</i> ' +
         'still shortens the ripples without speeding them up.')
  );

  /* ================================================================== *
   * drawing
   * ================================================================== */

  /* declared before the first setMode, because that renders */
  let P = palette(root);

  setMode('gap');

  function hexish(css) {
    const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
    if (m) {
      const v = parseInt(m[1], 16);
      return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
    }
    const r = /rgba?\(([^)]+)\)/.exec(css);
    if (r) return r[1].split(',').slice(0, 3).map(x => Math.round(+x)).join(',');
    return '0,95,106';
  }

  /** the far-field directions of the maxima and the nodal lines, in radians */
  function directions(kind) {
    const list = [];
    const dLam = st.dMm * (st.mode === 'mirror' ? 2 : 1) / lamMm();
    for (let m = -14; m <= 14; m++) {
      const s = (kind === 'max' ? m : m + 0.5) / dLam;
      if (Math.abs(s) > 0.999) continue;
      list.push({ m, s, th: Math.asin(s) });
    }
    return list;
  }

  /** the angle at which the beam from a gap runs out, if it has an edge at all */
  function beamEdge() {
    const bl = st.bMm / lamMm();
    return bl > 1 ? Math.asin(1 / bl) : null;
  }

  /**
   * The Fresnel number a²/(λL) of an aperture or a source separation a, seen
   * from the probe line.
   *
   * Every far-field formula in the textbook — sin θ = λ/b, d sin θ = mλ — is
   * the limit of the real integral as this number goes to zero. A real ripple
   * tank is a third of a metre across, so it is often of order one, and the
   * measured pattern then sits a little inside the straight-line prediction.
   * The sum being drawn is the exact integral, so the panels disagree with the
   * formula exactly as much as the experiment would, and the readout says so
   * rather than quietly hiding it.
   */
  function fresnelN(aMm) {
    const g = GF();
    const L = (g.probeX - g.barX) / g.mm;
    return aMm * aMm / (lamMm() * L);
  }

  function drawF() {
    const ctx = fv.ctx, g = GF(), W = g.W, H = g.H, Ht = g.Ht;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);

    field.draw(ctx, st.t * st.fHz / SLOW, hexish(P.accent),
               { mode: st.avg ? 'intensity' : 'wave', incident: isBarrier() });

    const bpx = st.bMm * g.mm, dpx = st.dMm * g.mm;

    if (isBarrier()) {
      ctx.fillStyle = P.text;
      ctx.fillRect(g.barX - 4, 0, 8, Ht);
      ctx.fillStyle = P.bg;
      const gaps = st.mode === 'gap' ? [g.midY]
                                     : [g.midY - dpx / 2, g.midY + dpx / 2];
      for (const y of gaps) ctx.fillRect(g.barX - 5, y - bpx / 2, 10, bpx);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2.6;
      for (const y of gaps) {
        ctx.beginPath();
        ctx.moveTo(g.barX - 12, y - bpx / 2); ctx.lineTo(g.barX - 12, y + bpx / 2);
        ctx.stroke();
      }
      /* on a phone the barrier is only 60 px from the edge, so the arrow has
       * to speak for itself */
      carrow(ctx, 10, 20, g.sm ? 46 : 62, 20, { color: P.text, width: 2, head: 8 });
      if (!g.sm) {
        ctext(ctx, 'straight waves in', 68, 24,
          { font: `600 11.5px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });
      }
    } else if (st.mode === 'dippers') {
      for (const y of [g.midY - dpx / 2, g.midY + dpx / 2]) {
        ctx.fillStyle = P.text;
        ctx.beginPath(); ctx.arc(g.barX, y, 5.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = P.bg; ctx.lineWidth = 1.8; ctx.stroke();
      }
      ctext(ctx, 'two dippers, in step', g.barX + 13, g.midY - dpx / 2 - 11,
        { font: `600 11.5px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });
    } else {
      drawMirror(ctx, g, dpx);
    }

    /* The directions that matter, drawn from the midpoint of the pair.
     *
     * In shallow fast water on a phone there can be twenty of these within the
     * panel, which is a thicket rather than a diagram, so they are laid down
     * from the centre outwards and one is dropped whenever it would land on top
     * of the last — the orders nearest the middle, which is where a student
     * counts from, always survive. */
    if (isPair()) {
      const reach = g.probeX - g.barX;
      const taken = [];
      const room = y => taken.every(v => Math.abs(v - y) > (g.sm ? 15 : 13));
      const lines = [];
      for (const kind of ['max', 'nod']) {
        for (const o of directions(kind)) lines.push({ kind, o, y: g.midY + reach * Math.tan(o.th) });
      }
      lines.sort((a2, b2) => (a2.kind === b2.kind
        ? Math.abs(a2.y - g.midY) - Math.abs(b2.y - g.midY)
        : (a2.kind === 'max' ? -1 : 1)));
      for (const L of lines) {
        const { kind, o, y } = L;
        if (y < 18 || y > Ht - 12 || !room(y)) continue;
        taken.push(y);
        ctx.save();
        ctx.setLineDash(kind === 'max' ? [7, 5] : [2, 5]);
        ctx.globalAlpha = kind === 'max' ? 0.65 : 0.8;
        ctx.strokeStyle = P.text; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(g.barX, g.midY); ctx.lineTo(g.probeX, y); ctx.stroke();
        ctx.restore();
        if (kind === 'max' || !g.sm) {
          ctext(ctx, kind === 'max' ? `m = ${o.m}` : 'nodal', g.probeX - 7, y - 5,
            { font: `600 10.5px ${P.font}`, color: P.text, align: 'right',
              halo: P.bg, haloWidth: 4 });
        }
      }
    }
    if (st.mode === 'gap') {
      const th = beamEdge();
      if (th !== null) {
        for (const sgn of [-1, 1]) {
          const y = g.midY + (g.probeX - g.barX) * Math.tan(th) * sgn;
          if (y < 18 || y > Ht - 10) continue;
          ctx.save();
          ctx.setLineDash([6, 5]); ctx.globalAlpha = 0.7;
          ctx.strokeStyle = P.text; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.moveTo(g.barX, g.midY); ctx.lineTo(g.probeX, y); ctx.stroke();
          ctx.restore();
          if (sgn > 0) {
            ctext(ctx, 'edge of the beam, sin θ = λ/b', g.probeX - 7, y - 5,
              { font: `600 10.5px ${P.font}`, color: P.text, align: 'right',
                halo: P.bg, haloWidth: 4 });
          }
        }
      }
    }

    /* the probe line */
    ctx.save();
    ctx.setLineDash([5, 5]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(g.probeX, 6);
    ctx.lineTo(g.probeX, st.mode === 'mirror' ? g.wallY : Ht);
    ctx.stroke();
    ctx.restore();
    /* where the probe itself sits, so the two panels read as one picture */
    const pyc = yOfMm(g, clamp(st.probeMm, g.lo, g.hi));
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(g.probeX, pyc, 4.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();

    drawRuler(ctx, g);

    /* one wavelength, measured off the drawing */
    const lp = lamMm() * g.mm;
    if (lp < W * 0.42) {
      const lx = g.probeX + 26, ly = 28;
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 5); ctx.lineTo(lx, ly + 5);
      ctx.moveTo(lx + lp, ly - 5); ctx.lineTo(lx + lp, ly + 5);
      ctx.stroke();
      carrow(ctx, lx, ly, lx + lp, ly, { color: P.accent, width: 1.4, head: 6, min: 4 });
      carrow(ctx, lx + lp, ly, lx, ly, { color: P.accent, width: 1.4, head: 6, min: 4 });
      ctext(ctx, `λ = ${fmt(lamMm(), 1)} mm`, lx + lp / 2, ly - 9,
        { font: P.sym(12), color: P.accent, align: 'center', halo: P.bg, haloWidth: 4 });
    }

    if (st.ann) {
      callout(ctx, ['Nothing in this panel is magnified, stretched',
                    'or exaggerated. Hold a ruler to the screen and',
                    'the scale along the bottom will agree with it.',
                    'Only the clock is slowed.'],
        16, Ht - 122, g.barX + 34, g.midY, { palette: P });
    }
  }

  /** the reflector: a wall, a dipper, and the image that makes the angles equal */
  function drawMirror(ctx, g, dpx) {
    const W = g.W, sx = g.barX, sy = g.wallY - dpx, iy = g.wallY + dpx;

    /* everything below the wall is not water */
    ctx.save();
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, g.wallY, W, g.Ht - g.wallY);
    /* a wash, so the eye reads "not water" without a fourth colour */
    ctx.globalAlpha = 0.05; ctx.fillStyle = P.text;
    ctx.fillRect(0, g.wallY, W, g.Ht - g.wallY);
    ctx.restore();
    ctx.strokeStyle = P.text; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(0, g.wallY); ctx.lineTo(W, g.wallY); ctx.stroke();
    chatch(ctx, 0, g.wallY, W, 0, { color: P.muted, gap: 15, len: 11, width: 1 });

    /* the equal-angle construction: dipper → wall → probe, and the straight
     * line from the image that proves the two angles are the same */
    const px = g.probeX, py = yOfMm(g, clamp(st.probeMm, g.lo, g.hi));
    const hitX = sx + (px - sx) * (dpx / (dpx + (g.wallY - py)));
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(hitX, g.wallY); ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.55; ctx.strokeStyle = P.text;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hitX, g.wallY); ctx.lineTo(sx, iy); ctx.stroke();
    /* the normal at the reflection point, so the two angles have something
     * to be measured from */
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hitX, g.wallY - 34); ctx.lineTo(hitX, g.wallY + 22); ctx.stroke();
    ctx.restore();
    const ang = Math.atan2(hitX - sx, dpx) * DEG;
    ctext(ctx, `${fmt(ang, 1)}°`, hitX - 8, g.wallY - 10,
      { font: `600 11px ${P.font}`, color: P.text, align: 'right', halo: P.bg, haloWidth: 4 });
    ctext(ctx, `${fmt(ang, 1)}°`, hitX + 8, g.wallY - 10,
      { font: `600 11px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });

    /* the dipper */
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.8; ctx.stroke();
    ctext(ctx, 'the dipper', sx + 12, sy - 9,
      { font: `600 11.5px ${P.font}`, color: P.text, halo: P.bg, haloWidth: 4 });

    /* its image */
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(sx, iy, 5.5, 0, TAU);
    ctx.fillStyle = P.bg; ctx.fill();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, iy); ctx.stroke();
    ctx.restore();
    ctext(ctx, 'its image — the reflected wave is this source’s wave',
      sx + 12, iy + 5,
      { font: `600 11.5px ${P.font}`, color: P.muted, halo: P.bg, haloWidth: 4 });
    ctext(ctx, `${fmt(st.dMm, 0)} mm`, sx - 8, (sy + g.wallY) / 2,
      { font: `500 10.5px ${P.font}`, color: P.muted, align: 'right', halo: P.bg, haloWidth: 4 });
  }

  /** the millimetre scale, which is the point of the panel */
  function drawRuler(ctx, g) {
    const W = g.W, ry = g.Ht + 9;
    ctx.fillStyle = P.bg; ctx.fillRect(0, g.Ht, W, RULER);
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke();
    const lab = g.sm ? 100 : 50;
    for (let mmv = 0; mmv <= TANK_X; mmv += 10) {
      const px = mmv * g.mm;
      const big = mmv % 50 === 0;
      ctx.beginPath(); ctx.moveTo(px, ry); ctx.lineTo(px, ry - (big ? 7 : 3.5)); ctx.stroke();
      if (mmv % lab === 0 && mmv > 0 && mmv < TANK_X - (g.sm ? 40 : 10)) {
        ctext(ctx, String(mmv), px + 3, ry - 8,
          { font: `500 10px ${P.font}`, color: P.muted });
      }
    }
    ctext(ctx, 'mm', W - 6, ry - 8,
      { font: `500 10px ${P.font}`, color: P.muted, align: 'right' });
  }

  /* ------------------------------------------- the line across the tank */

  function drawB() {
    const ctx = bv.ctx, g = GB(), gf = GF(), W = g.W;
    ctx.clearRect(0, 0, W, HB);
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, HB);

    const PLOT_T = 48, PLOT_B = 234, AX = 246;
    const IY = a => PLOT_B - a * (PLOT_B - PLOT_T);

    ctx.strokeStyle = P.frame; ctx.lineWidth = 1;
    ctx.strokeRect(g.x0 + 0.5, PLOT_T + 0.5, g.x1 - g.x0, PLOT_B - PLOT_T);

    /* where the theory says the features should land, drawn first so the
     * measured trace lies over them */
    const reach = (gf.probeX - gf.barX) / gf.mm;
    const marks = [];
    if (isPair()) {
      for (const kind of ['max', 'nod']) {
        for (const o of directions(kind)) marks.push({ kind, v: reach * Math.tan(o.th), m: o.m });
      }
    } else if (st.mode === 'gap') {
      const th = beamEdge();
      if (th !== null) for (const s of [-1, 1]) marks.push({ kind: 'edge', v: s * reach * Math.tan(th) });
    } else {
      /* the reflector is a Lloyd's mirror, so the fringes are not evenly
       * spaced in angle from a midpoint — they are solved for directly */
      const sep = 2 * st.dMm;
      for (let m = 0; m <= 24; m++) {
        for (const kind of ['max', 'nod']) {
          const v = lloydAt(kind === 'max' ? m : m + 0.5, sep, reach);
          if (v !== null) marks.push({ kind, v, m });
        }
      }
    }
    for (const k of marks) {
      if (k.v < g.lo || k.v > g.hi) continue;
      const px = g.xOf(k.v);
      ctx.save();
      ctx.setLineDash(k.kind === 'nod' ? [2, 4] : [5, 4]);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = P.text; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, PLOT_T); ctx.lineTo(px, PLOT_B); ctx.stroke();
      ctx.restore();
      if (k.kind === 'max') {
        ctext(ctx, String(k.m), px, PLOT_T - 7,
          { font: `600 10.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
      } else if (k.kind === 'edge') {
        ctext(ctx, 'λ/b', px, PLOT_T - 7,
          { font: `600 10.5px ${P.font}`, color: P.text, align: 'center', halo: P.bg });
      }
    }

    ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    profile.forEach(([y, a], i) => {
      const px = g.xOf(mmOfY(gf, y));
      i ? ctx.lineTo(px, IY(a)) : ctx.moveTo(px, IY(a));
    });
    ctx.stroke();
    ctext(ctx, 'how much the water moves, along that line', g.x0, 20,
      { font: `600 11.5px ${P.font}`, color: P.accent });

    /* the millimetre axis */
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x0, AX); ctx.lineTo(g.x1, AX); ctx.stroke();
    const step = g.sm ? 40 : 20;
    const first = Math.ceil(g.lo / step) * step;
    for (let v = first; v <= g.hi + 1e-9; v += step) {
      const px = g.xOf(v);
      ctx.beginPath(); ctx.moveTo(px, AX); ctx.lineTo(px, AX + 5); ctx.stroke();
      ctext(ctx, String(Math.round(v)), px, AX + 16,
        { font: `500 10px ${P.font}`, color: P.muted, align: 'center' });
    }
    ctext(ctx, st.mode === 'mirror' ? 'height above the reflector / mm'
                                    : 'across the tank / mm from the centre line',
      g.x1, AX + 34, { font: `500 11px ${P.font}`, color: P.muted, align: 'right' });

    /* the probe */
    const pv = clamp(st.probeMm, g.lo, g.hi);
    const px = g.xOf(pv);
    const yPix = yOfMm(gf, pv);
    const [re, im] = field.at(gf.probeX, yPix);
    /* the trace was divided by its own largest, so the dot has to be divided
     * by the same number if it is to sit on the curve it reads */
    const rel = clamp(Math.hypot(re, im) / rawMaxCache, 0, 1);
    ctx.save();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = P.text; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px, PLOT_T); ctx.lineTo(px, AX); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = P.text;
    ctx.beginPath(); ctx.arc(px, IY(rel), 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.bg; ctx.lineWidth = 1.6; ctx.stroke();
  }

  /**
   * Lloyd's mirror: the height above a reflector at which the direct path and
   * the path via the image differ by q wavelengths. Returns null if there is
   * no such height on this side of the wall.
   *
   *   Δ = √(L² + (y + a)²) − √(L² + (y − a)²) = qλ,  a = half the source
   *   separation (that is, the dipper's height above the wall)
   */
  function lloydAt(q, sepMm, L) {
    const a = sepMm / 2, lam = lamMm(), target = q * lam;
    const f = y => Math.hypot(L, y + a) - Math.hypot(L, y - a) - target;
    let lo = 0, hi = GF().wallY / GF().mm;
    if (f(lo) * f(hi) > 0) return null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /* ================================================================== *
   * dragging the probe
   * ================================================================== */

  const fromPointer = e => { st.probeMm = GB().vOf(bv.at(e).x); };
  const onDown = e => {
    st.dragging = true; fromPointer(e);
    bv.el.setPointerCapture(e.pointerId); e.preventDefault(); schedule();
  };
  const onMove = e => {
    if (!st.dragging) { bv.el.style.cursor = 'ew-resize'; return; }
    fromPointer(e); e.preventDefault(); schedule();
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
    if (st.playing) { st.t += Math.min(dt, 0.1); drawF(); }
  }

  function render() {
    syncField();
    const g = GF();
    drawF(); drawB();

    const lm = lamMm();
    const bl = st.bMm / lm, dl = st.dMm / lm;
    const edge = beamEdge();
    const reachMm = (g.probeX - g.barX) / g.mm;
    /* the path difference at the probe, for the two-source arrangements */
    let pd = null;
    if (st.mode !== 'gap') {
      const y = clamp(st.probeMm, g.lo, g.hi);
      /* a reflector puts the image a whole d beyond the wall, so the pair is
       * 2d apart; two gaps or two dippers are d apart */
      const a = st.mode === 'mirror' ? st.dMm : st.dMm / 2;
      const r1 = Math.hypot(reachMm, y + a), r2 = Math.hypot(reachMm, y - a);
      pd = Math.abs(r1 - r2);
    }
    const maxima = st.mode === 'gap' ? [] : directions('max');
    const nodal = st.mode === 'gap' ? [] : directions('nod');
    const nq = pd === null ? 0 : pd / lm;

    out.setAll({
      wt: `${fmt(st.hMm, 1)} mm  →  v = ${fmt(vOf(), 3)} m s⁻¹`,
      wl: `${fmt(st.fHz, 1)} Hz  →  λ = ${fmt(lm, 1)} mm`,
      ge: st.mode === 'gap' ? `a ${st.bMm} mm gap, ${fmt(reachMm, 0)} mm from the probe line`
        : st.mode === 'two' ? `two ${st.bMm} mm gaps, ${st.dMm} mm apart`
        : st.mode === 'dippers' ? `two dippers ${st.dMm} mm apart`
        : `one dipper, ${st.dMm} mm above the wall — so dipper and image are ` +
          `${2 * st.dMm} mm apart`,
      rt: isBarrier()
        ? `b/λ = ${fmt(bl, 2)}` + (st.mode === 'two' ? `,  d/λ = ${fmt(dl, 2)}` : '')
        : st.mode === 'mirror' ? `2d/λ = ${fmt(2 * dl, 2)}` : `d/λ = ${fmt(dl, 2)}`,
      sp: isBarrier()
        ? (edge === null
            ? 'the gap is no wider than a wavelength — the wave leaves it as a single ' +
              'semicircular ripple, spreading through the whole half-plane'
            : `the beam runs out to ±${fmt(edge * DEG, 1)}°, where sin θ = λ/b` +
              (fresnelN(st.bMm) > 0.5
                ? `  — but b²/λL = ${fmt(fresnelN(st.bMm), 1)} at the probe line, so that ` +
                  'edge is where the beam is heading, not where it has got to yet'
                : `  — and b²/λL = ${fmt(fresnelN(st.bMm), 2)}, small enough that this is ` +
                  'the edge you would measure'))
        : '—',
      or: maxima.length
        ? (st.mode === 'mirror' ? 'from the wall — ' : '') +
          maxima.filter(o => o.m >= 0 && o.m <= 5)
            .map(o => `${o.m}: ${fmt(o.th * DEG, 1)}°`).join(',  ') +
          (fresnelN(st.mode === 'mirror' ? 2 * st.dMm : st.dMm) > 0.5
            ? `  (straight-line directions; d²/λL = ` +
              `${fmt(fresnelN(st.mode === 'mirror' ? 2 * st.dMm : st.dMm), 1)} here, so the ` +
              'measured maxima sit a little inside them)'
            : '')
        : '—',
      nd: nodal.length
        ? `${nodal.length} of them, the first at ${fmt(nodal.find(o => o.m >= 0).th * DEG, 1)}°` +
          ' — the water along those lines never moves at all'
        : '—',
      pb: pd === null
        ? `${fmt(st.probeMm, 1)} mm from the centre line`
        : `${fmt(st.probeMm, 1)} mm,  path difference ${fmt(pd, 1)} mm = ${fmt(nq, 2)} λ` +
          (Math.abs(nq - Math.round(nq)) < 0.03 ? '  — a maximum'
           : Math.abs(Math.abs(nq % 1) - 0.5) < 0.03 ? '  — a nodal line' : ''),
      sc: `${fmt(g.mm, 2)} pixels per millimetre — ${TANK_X} mm × ${TANK_Y} mm of tank, to scale ` +
          `in both directions. Only the clock is stretched: ×${SLOW}, so the ripples cross the ` +
          `screen at ${fmt(vOf() * 1000 / SLOW, 1)} mm s⁻¹ instead of ${fmt(vOf() * 1000, 0)}`,
      nt: st.mode === 'gap'
        ? 'wind b down towards λ and the beam becomes a single spreading ripple'
        : st.mode === 'two'
        ? 'the double slit, at a size you can see — and each gap diffracts as well'
        : st.mode === 'dippers'
        ? 'two sources in step: the nodal lines are hyperbolae, straight only far out'
        : 'the reflected wave is the image source’s wave — which is why the two angles ' +
          'at the wall are equal, and why the fringes along the probe line are those of ' +
          'a pair of sources 2d apart',
    });
  }

  function fitAll() {
    P = palette(root);
    const cw = Math.round(fv.el.clientWidth || root.clientWidth || MW);
    if (cw > 0) {
      const w = clamp(cw, 340, MW);
      fv.setLogical(w, panelH(w));
      bv.setLogical(w, HB);
    }
    fv.fit(); bv.fit();
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

  fitAll();

  /* --------------------------------------------------- test surface */

  return {
    destroy,
    _set: p => {
      const mode = p.mode;
      Object.assign(st, p);
      sH.set(st.hMm); sF.set(st.fHz); sB.set(st.bMm); sD.set(st.dMm);
      if (mode) setMode(mode); else render();
    },
    _state: () => ({
      mode: st.mode, hMm: st.hMm, fHz: st.fHz, bMm: st.bMm, dMm: st.dMm,
      v: vOf(), lamMm: lamMm(), bOverLam: st.bMm / lamMm(), dOverLam: st.dMm / lamMm(),
      probeMm: st.probeMm, slow: SLOW,
    }),
    _speed: h => speedOf(h),
    _field: () => field,
    _fieldAt: (x, y) => field.at(x, y),
    _sources: () => field.sources.map(s => [s.x, s.y, s.w, s.iso ? 1 : 0]),
    _profile: () => profile,
    _directions: kind => directions(kind),
    _beamEdge: () => beamEdge(),
    _fresnel: a => fresnelN(a),
    /* the fast path: what the grid loop put in the cell nearest (x, y), so a
     * test can hold the lookup table to account against the exact sum */
    _gridAt: (x, y) => {
      const c = field.cell;
      const ix = Math.round((x - field.x0) / c), iy = Math.round(y / c);
      if (ix < 0 || ix >= field.cols || iy < 0 || iy >= field.rows) return null;
      const o = ix * field.rows + iy;
      return [field.re[o], field.im[o], field.x0 + ix * c, iy * c];
    },
    /* the reflection construction the reflector panel draws, so a test can
     * check that the two angles it prints really are the same angle */
    _hit: probeMm => {
      const g = GF(), dpx = st.dMm * g.mm;
      const sx = g.barX, sy = g.wallY - dpx;
      const px = g.probeX, py = yOfMm(g, probeMm);
      const hitX = sx + (px - sx) * (dpx / (dpx + (g.wallY - py)));
      return { hitX, sx, sy, px, py, wallY: g.wallY, dpx,
               angIn: Math.atan2(hitX - sx, dpx) * DEG,
               angOut: Math.atan2(px - hitX, g.wallY - py) * DEG };
    },
    _lloyd: (q) => lloydAt(q, 2 * st.dMm, (GF().probeX - GF().barX) / GF().mm),
    _geom: () => {
      const g = GF(), b = GB();
      return { ...g, lamPx: lamMm() * g.mm, bPx: st.bMm * g.mm, dPx: st.dMm * g.mm,
               sources: field.sources.length, fullField: field.fullField,
               fieldH: field.H, x0: b.x0, x1: b.x1, lo: b.lo, hi: b.hi,
               reachMm: (g.probeX - g.barX) / g.mm };
    },
    _consts: () => ({ MW, HB, CELL, TANK_X, TANK_Y, H_MIN, H_MAX, F_MIN, F_MAX,
                      B_MIN, B_MAX, D_MIN, D_MAX, D_MAX_MIRROR, G, SLOW,
                      BAR_F, PROBE_F, MIRROR_SRC_F }),
  };
}
