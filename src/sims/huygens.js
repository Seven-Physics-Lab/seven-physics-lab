/* ============================================================================
 * Huygens–Fresnel field
 *
 * A shared engine for every slit simulation: a plane wave arrives at a barrier,
 * each point of each opening becomes a source of a secondary wavelet, and the
 * wavelets are added. Nothing about the pattern is put in by hand — the fringes
 * are what the sum does.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS COMPUTED
 *
 * In two dimensions a point source radiates a cylindrical wave whose amplitude
 * falls as 1/√r, so the field beyond the barrier is
 *
 *     U(P) = Σ_apertures ∫ K(χ) · e^{ikr} / √r  ds
 *
 * with r the distance from the element ds of the opening to P, and K the
 * obliquity factor (1 + cos χ)/2, χ measured from the barrier's normal. The
 * incident wave arrives along +x, so every point of the barrier plane is in
 * phase and no extra phase has to be put on the sources.
 *
 * The integral is done by sampling each opening at a spacing well under a
 * wavelength. A finite set of sources is itself a diffraction grating, so its
 * spurious orders sit at sin χ = ±λ/ds; keeping ds below about λ/4 puts them
 * outside |sin χ| = 1 altogether, which is to say they do not exist.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS FAST ENOUGH TO ANIMATE
 *
 * Time separates out. U(P, t) = Re{ U(P) e^{−iωt} }, so the expensive complex
 * field U(P) is computed once per change of geometry and each frame is just
 *
 *     value = Re(U)·cos ωt + Im(U)·sin ωt
 *
 * two multiplications per cell. The phases inside the sum go through a lookup
 * table rather than Math.cos/Math.sin, which is what makes a hundred thousand
 * cells by forty sources tolerable on a slider drag.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT IDEALISED AWAY
 *
 * This is the real diffraction integral, not the far-field approximation, so
 * the picture shows the beams while they are still forming. At the distances a
 * screen can be drawn at, that is genuinely what a wave does; the far-field
 * formulae the textbook quotes are the limit of it, and a simulation should
 * not quietly substitute the limit for the thing.
 * ==========================================================================*/

const TAU = Math.PI * 2;

/* a phase lookup, so the inner loop has no transcendental calls in it */
const LUT_N = 8192, LUT_MASK = LUT_N - 1;
const LUT_COS = new Float32Array(LUT_N);
const LUT_SIN = new Float32Array(LUT_N);
for (let i = 0; i < LUT_N; i++) {
  LUT_COS[i] = Math.cos(TAU * i / LUT_N);
  LUT_SIN[i] = Math.sin(TAU * i / LUT_N);
}
const LUT_SCALE = LUT_N / TAU;

export class HuygensField {
  /**
   * @param {object} o
   * @param {number} o.W,o.H        the canvas, in logical pixels
   * @param {number} o.lamPx        one wavelength, in those pixels
   * @param {number} o.barrierX     where the barrier stands
   * @param {number} o.screenX      where the screen stands
   * @param {number} o.cell         computation cell size; 2 gives 7 cells per
   *                                wavelength at lamPx = 14, which is enough
   *                                to draw a sinusoid without aliasing it
   * @param {number} o.maxSources   per opening, to bound the work
   */
  constructor(o = {}) {
    this.W = o.W ?? 1120;
    this.H = o.H ?? 540;
    this.lamPx = o.lamPx ?? 14;
    this.barrierX = o.barrierX ?? 132;
    this.screenX = o.screenX ?? 1052;
    this.cell = o.cell ?? 2;
    this.maxSources = o.maxSources ?? 20;
    /* the fewest sources an opening of any width is sampled with; see
     * buildSources for why a narrow opening still needs more than two */
    this.minSources = o.minSources ?? 2;
    /* Sources normally sit on the barrier and radiate forwards, with the
     * obliquity factor of a Huygens wavelet on an aperture. A ripple tank
     * also wants free-standing dippers, which sit anywhere and radiate in
     * every direction equally, and image sources behind a reflecting wall.
     * fullField computes the grid across the whole panel rather than only
     * downstream of a barrier. */
    this.fullField = o.fullField ?? false;
    this.apertures = [];
    this.re = null; this.im = null;
    this.cols = 0; this.rows = 0;
    this.norm = 1;
    this.sources = [];
    this.key = '';
    /* the off-screen buffer the field is painted into before being scaled up */
    this.buf = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  }

  /**
   * Openings, or free sources: [{ y, half, x?, iso? }] in logical pixels.
   * x defaults to the barrier; iso makes a source radiate equally in every
   * direction, which is what a dipper in a tank does.
   */
  setApertures(list) { this.apertures = list; }

  /** a signature of everything the field depends on */
  signature() {
    return [this.W, this.H, this.lamPx, this.barrierX, this.screenX, this.cell,
            this.fullField ? 'F' : 'B',
            ...this.apertures.map(a => `${(a.x ?? this.barrierX).toFixed(3)}:` +
                                       `${a.y.toFixed(3)}:${a.half.toFixed(3)}:` +
                                       `${a.iso ? 1 : 0}:${a.w ?? 1}`)].join('|');
  }

  /**
   * The discrete secondary sources, with their integration weights.
   *
   * The integral across an opening is done by the midpoint rule, so the error
   * in the far-field aperture factor is about (k·sinχ·h)²/24 with h the source
   * spacing. Two things follow, and both are enforced here. The spacing must
   * stay well under a wavelength, or that error is not small; and a narrow
   * opening still needs several sources, because a two-point rule across a
   * tenth of a wavelength is a worse approximation to the integral than the
   * width of the opening suggests.
   */
  buildSources() {
    const ds = this.lamPx / 4;                 // spacing, well under a wavelength
    const out = [];
    for (const a of this.apertures) {
      const x = a.x ?? this.barrierX, iso = !!a.iso, gain = a.w ?? 1;
      if (a.half <= 1e-6) { out.push({ x, y: a.y, w: gain, iso }); continue; }
      const n = Math.max(this.minSources,
                         Math.min(this.maxSources, Math.ceil(2 * a.half / ds)));
      const step = 2 * a.half / n;
      for (let i = 0; i < n; i++) {
        out.push({ x, y: a.y - a.half + (i + 0.5) * step, w: step * gain, iso });
      }
    }
    /* weights are normalised so that a wider opening lets more through, which
     * is the physical thing, but the display normalisation below keeps the
     * picture legible whatever the total */
    const tot = out.reduce((s, x) => s + x.w, 0) || 1;
    for (const x of out) x.w /= tot;
    this.sources = out;
    return out;
  }

  /**
   * The complex field at one point, from the sources. Used for the screen
   * profile and by the tests, and written so it is the same arithmetic the
   * grid loop does.
   */
  at(x, y) {
    const k = TAU / this.lamPx;
    let re = 0, im = 0;
    for (const s of this.sources) {
      const dx = x - s.x, dy = y - s.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 1e-6) continue;
      const ob = s.iso ? 1 : 0.5 * (1 + dx / r);   // obliquity, (1 + cos chi)/2
      const amp = s.w * ob / Math.sqrt(r);
      const ph = k * r;
      re += amp * Math.cos(ph);
      im += amp * Math.sin(ph);
    }
    return [re, im];
  }

  /** intensity along the screen, sampled every `step` pixels */
  screenProfile(step = 2) {
    const out = [];
    for (let y = 0; y <= this.H; y += step) {
      const [re, im] = this.at(this.screenX, y);
      out.push([y, re * re + im * im]);
    }
    const mx = out.reduce((m, p) => Math.max(m, p[1]), 0) || 1;
    return out.map(([y, I]) => [y, I / mx]);
  }

  /**
   * Fill the grid. Returns true if anything was recomputed.
   *
   * The inner loop is written flat and with a lookup table on purpose: this
   * runs over a hundred thousand cells and every source, and it has to finish
   * inside one slider drag.
   */
  compute(force = false) {
    const sig = this.signature();
    if (!force && sig === this.key && this.re) return false;
    this.key = sig;
    this.buildSources();

    const c = this.cell;
    const x0 = this.fullField ? 0 : Math.floor(this.barrierX);
    const cols = Math.ceil((this.screenX + c - x0) / c);
    const rows = Math.ceil(this.H / c) + 1;
    this.cols = cols; this.rows = rows; this.x0 = x0;
    const n = cols * rows;
    if (!this.re || this.re.length !== n) {
      this.re = new Float32Array(n);
      this.im = new Float32Array(n);
    } else { this.re.fill(0); this.im.fill(0); }

    const k = TAU / this.lamPx;
    const src = this.sources;
    const ns = src.length;
    const sy = new Float64Array(ns), sw = new Float64Array(ns);
    const sx = new Float64Array(ns), so = new Uint8Array(ns);
    for (let j = 0; j < ns; j++) {
      sx[j] = src[j].x; sy[j] = src[j].y; sw[j] = src[j].w; so[j] = src[j].iso ? 1 : 0;
    }

    const re = this.re, im = this.im;
    for (let ix = 0; ix < cols; ix++) {
      const x = x0 + ix * c;
      for (let iy = 0; iy < rows; iy++) {
        const y = iy * c;
        let ar = 0, ai = 0;
        for (let j = 0; j < ns; j++) {
          const dx = x - sx[j], dy = y - sy[j];
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 0.5) continue;
          const amp = sw[j] * (so[j] ? 1 : 0.5 * (1 + dx / r)) / Math.sqrt(r);
          /* round, not truncate: truncation biases every phase downwards by
           * half a bin, and a systematic bias survives the sum where a
           * symmetric one largely cancels */
          const idx = ((k * r * LUT_SCALE + 0.5) | 0) & LUT_MASK;
          ar += amp * LUT_COS[idx];
          ai += amp * LUT_SIN[idx];
        }
        const o = ix * rows + iy;
        re[o] = ar; im[o] = ai;
      }
    }

    /* a display scale from the typical size of the field well beyond the
     * barrier, not from its maximum: right at a slit 1/sqrt(r) is enormous
     * and would crush everything else to invisibility */
    let sum = 0, cnt = 0;
    const from = Math.floor((this.barrierX + (this.fullField ? 0 : 6 * this.lamPx) - x0) / c);
    for (let ix = Math.max(0, from); ix < cols; ix += 2) {
      for (let iy = 0; iy < rows; iy += 2) {
        const o = ix * rows + iy;
        sum += re[o] * re[o] + im[o] * im[o];
        cnt++;
      }
    }
    const rms = cnt ? Math.sqrt(sum / cnt) : 1;
    this.norm = rms > 1e-30 ? 1 / (2.1 * rms) : 1;
    return true;
  }

  /**
   * Paint one instant of the field.
   *
   * @param ctx      the canvas context
   * @param t        time, in periods
   * @param rgb      "r,g,b" for the accent colour
   * @param opts     { incident, mode } — mode 'wave' draws the field at this
   *                 instant, 'intensity' draws |U|², which is what a screen or
   *                 an eye records because both average over many periods
   */
  draw(ctx, t, rgb, opts = {}) {
    if (!this.buf) return;
    const c = this.cell;
    const bcols = Math.ceil(this.W / c) + 1, brows = this.rows;
    if (this.buf.width !== bcols || this.buf.height !== brows) {
      this.buf.width = bcols; this.buf.height = brows;
    }
    const bctx = this.buf.getContext('2d');
    const img = bctx.createImageData(bcols, brows);
    const px = img.data;

    const [R, G, B] = rgb.split(',').map(Number);
    const ph = TAU * t;
    const co = Math.cos(ph), si = Math.sin(ph);
    const k = TAU / this.lamPx;
    const inc = opts.incident !== false;
    const avg = opts.mode === 'intensity';
    const A = 235;                       // the strongest alpha the field reaches
    const GAMMA = 1.7;                   // keeps the zero level pale, not a wash
    const n2 = this.norm * this.norm * 1.25;
    const ix0 = Math.floor((this.x0) / c);

    for (let bx = 0; bx < bcols; bx++) {
      const x = bx * c;
      let column = null, plane = 0;
      if (!this.fullField && x < this.barrierX) {
        /* the beam on its way in: a plain travelling plane wave */
        plane = inc ? Math.cos(k * x - ph) : 0;
      } else {
        column = (bx - ix0);
      }
      for (let by = 0; by < brows; by++) {
        let u;
        if (column === null) {
          /* a plane wave has uniform intensity, so in the averaged view the
           * incoming beam is a flat wash — deliberately paler than the
           * pattern, since the two sides carry their own normalisations */
          u = avg ? 0.42 : (plane + 1) * 0.5;
        } else {
          const o = column * brows + by;
          if (avg) {
            let I = (this.re[o] * this.re[o] + this.im[o] * this.im[o]) * n2;
            if (I > 1) I = 1;
            u = Math.pow(I, 0.62);
          } else {
            let v = (this.re[o] * co + this.im[o] * si) * this.norm;
            if (v > 1) v = 1; else if (v < -1) v = -1;
            u = (v + 1) * 0.5;
          }
        }
        const a = (Math.pow(u, avg ? 1 : GAMMA) * A) | 0;
        const p = (by * bcols + bx) * 4;
        px[p] = R; px[p + 1] = G; px[p + 2] = B; px[p + 3] = a;
      }
    }
    bctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.buf, 0, 0, bcols, brows, 0, 0, bcols * c, brows * c);
    ctx.restore();
  }

  /** the far-field directions of the maxima, for a two-slit geometry */
  ordersFor(dPix) {
    const out = [];
    for (let m = -20; m <= 20; m++) {
      const s = m * this.lamPx / dPix;
      if (Math.abs(s) > 0.999) continue;
      out.push({ m, sin: s, th: Math.asin(s) });
    }
    return out;
  }
}
