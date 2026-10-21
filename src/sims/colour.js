/* ============================================================================
 * Spectrum → colour
 *
 * Everywhere else in this set colour is a code: brand teal means "this is the
 * quantity", black means "this is the apparatus". A second hue on a physics
 * diagram is read as a second meaning, so there isn't one.
 *
 * Interference in a thin film is the exception, and so is white light through
 * a prism or a grating. There, colour is not a code for the physics — it IS
 * the physics, and the only honest way to draw it is to work out what the eye
 * would actually do with the light. That is what this module is for, and it is
 * the only place in the kit allowed to emit a colour that is not teal, black
 * or white.
 *
 * ---------------------------------------------------------------------------
 * THE CHAIN
 *
 * A spectrum arrives as a function P(λ). The eye has three cone responses, and
 * the CIE 1931 standard observer writes them as three colour-matching
 * functions x̄, ȳ, z̄:
 *
 *     X = ∫ P(λ) x̄(λ) dλ ,   Y = ∫ P(λ) ȳ(λ) dλ ,   Z = ∫ P(λ) z̄(λ) dλ
 *
 * Then XYZ goes to linear sRGB by the standard primaries matrix, and finally
 * through the sRGB transfer function to the numbers a screen wants.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE COLOUR-MATCHING FUNCTIONS COME FROM
 *
 * Not from a remembered table of three hundred numbers, and not from a
 * Gaussian fit — a published fit of them (Wyman, Sloan & Shirley 2013) is
 * accurate to about a percent of peak in the middle of the band but has the
 * wrong tails, and puts the 700 nm spectral point 0.24 away in chromaticity,
 * which on a spectrum bar is orange where it should be deep red.
 *
 * Instead they are BUILT, from the two things about the 1931 system that are
 * separately well known and separately checkable:
 *
 *   · ȳ(λ) is the photopic luminous efficiency curve V(λ). That is not a
 *     coincidence or an approximation — the system was constructed that way,
 *     so that Y is luminance. V(λ) is tabulated below.
 *   · the spectral locus: the chromaticity (x, y) of each pure wavelength,
 *     the horseshoe of the chromaticity diagram. Also tabulated below. Its
 *     long-wave end sits at (0.7347, 0.2653), which is where it was put by
 *     definition when the primaries were chosen.
 *
 * Given those, the rest is algebra and nothing else. Chromaticity is
 * x = X/(X+Y+Z) and y = Y/(X+Y+Z), so with Y = V(λ),
 *
 *     x̄(λ) = V(λ) · x(λ) / y(λ)
 *     ȳ(λ) = V(λ)
 *     z̄(λ) = V(λ) · (1 − x(λ) − y(λ)) / y(λ)
 *
 * and that reproduces the published table: at 600 nm it gives x̄ = 1.062
 * against a tabulated 1.0622, at 450 nm z̄ = 1.772 against 1.7721. The
 * verification script checks a spread of them, checks that ȳ peaks at 555 nm
 * with the value 1, and checks the CIE normalisation ∫x̄ = ∫ȳ = ∫z̄, which is
 * the thing that makes a flat spectrum neutral.
 *
 * THE ILLUMINANT
 *
 * Equal energy at every wavelength — CIE illuminant E. Not daylight, and the
 * choice is deliberate: every colour shown then comes from the film alone and
 * not from the lamp. A real bubble in daylight looks a little different, and
 * by the same argument different again under a tungsten bulb.
 *
 * OUT OF GAMUT
 *
 * A screen cannot show every colour the eye can see. A spectral colour of high
 * purity comes out of the matrix with a negative component, which means "no
 * mixture of this screen's three primaries can do this". Rather than clip the
 * channel — which shifts the hue — the smallest amount of white needed to lift
 * every channel to zero is added. The colour then keeps its hue and loses some
 * saturation, which is the standard and honest compromise, and `gamutLoss`
 * reports how much had to be added.
 * ==========================================================================*/

/* ------------------------------------------------------------------------ *
 * V(λ), the CIE 1924 photopic luminous efficiency function, at 10 nm.
 * This is ȳ.
 * ------------------------------------------------------------------------ */
const V = [
  [380, 0.000039], [390, 0.000120], [400, 0.000396], [410, 0.001210],
  [420, 0.004000], [430, 0.011600], [440, 0.023000], [450, 0.038000],
  [460, 0.060000], [470, 0.090980], [480, 0.139020], [490, 0.208020],
  [500, 0.323000], [510, 0.503000], [520, 0.710000], [530, 0.862000],
  [540, 0.954000], [550, 0.994950], [555, 1.000000], [560, 0.995000],
  [570, 0.952000],
  [580, 0.870000], [590, 0.757000], [600, 0.631000], [610, 0.503000],
  [620, 0.381000], [630, 0.265000], [640, 0.175000], [650, 0.107000],
  [660, 0.061000], [670, 0.032000], [680, 0.017000], [690, 0.008210],
  [700, 0.004102], [710, 0.002091], [720, 0.001047], [730, 0.000520],
];

/* ------------------------------------------------------------------------ *
 * The spectral locus: the chromaticity of each pure wavelength.
 * ------------------------------------------------------------------------ */
const LOCUS = [
  [380, 0.1741, 0.0050], [390, 0.1738, 0.0049], [400, 0.1733, 0.0048],
  [410, 0.1726, 0.0048], [420, 0.1714, 0.0051], [430, 0.1689, 0.0069],
  [440, 0.1644, 0.0109], [450, 0.1566, 0.0177], [460, 0.1440, 0.0297],
  [470, 0.1241, 0.0578], [480, 0.0913, 0.1327], [490, 0.0454, 0.2950],
  [500, 0.0082, 0.5384], [510, 0.0139, 0.7502], [520, 0.0743, 0.8338],
  [530, 0.1547, 0.8059], [540, 0.2296, 0.7543], [550, 0.3016, 0.6923],
  [555, 0.3373, 0.6589],
  [560, 0.3731, 0.6245], [570, 0.4441, 0.5547], [580, 0.5125, 0.4866],
  [590, 0.5752, 0.4242], [600, 0.6270, 0.3725], [610, 0.6658, 0.3340],
  [620, 0.6915, 0.3083], [630, 0.7079, 0.2920], [640, 0.7190, 0.2809],
  [650, 0.7260, 0.2740], [660, 0.7300, 0.2700], [670, 0.7320, 0.2680],
  [680, 0.7334, 0.2666], [690, 0.7344, 0.2656], [700, 0.7347, 0.2653],
  [710, 0.7347, 0.2653], [720, 0.7347, 0.2653], [730, 0.7347, 0.2653],
];

export const LAM_LO = 380, LAM_HI = 730, LAM_STEP = 1;

/** linear interpolation in a table of [x, ...values] rows */
function interp(table, x, col) {
  if (x <= table[0][0]) return table[0][col];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[col];
  let i = 0;
  while (i < table.length - 2 && table[i + 1][0] < x) i++;
  const a = table[i], b = table[i + 1];
  const u = (x - a[0]) / (b[0] - a[0]);
  return a[col] + u * (b[col] - a[col]);
}

/** the photopic curve, which is also ȳ */
export function luminous(l) { return interp(V, l, 1); }
/** the chromaticity of a pure wavelength */
export function locusAt(l) { return { x: interp(LOCUS, l, 1), y: interp(LOCUS, l, 2) }; }

export function yBar(l) { return luminous(l); }
export function xBar(l) {
  const { x, y } = locusAt(l);
  return y > 0 ? luminous(l) * x / y : 0;
}
export function zBar(l) {
  const { x, y } = locusAt(l);
  return y > 0 ? luminous(l) * (1 - x - y) / y : 0;
}

export const SAMPLES = (() => {
  const out = [];
  for (let l = LAM_LO; l <= LAM_HI + 1e-9; l += LAM_STEP) out.push(l);
  return out;
})();

/* what an equal-energy spectrum gives. In the true CIE system these three are
 * equal; here they agree to a fraction of a percent, and dividing by them
 * makes "a flat spectrum is exactly neutral" true by construction rather than
 * nearly true by luck. That is the one property this module must not get
 * wrong: a film that reflects every wavelength equally has to look grey, or
 * every colour it does show is suspect. */
const WHITE = (() => {
  let X = 0, Y = 0, Z = 0;
  for (const l of SAMPLES) { X += xBar(l); Y += yBar(l); Z += zBar(l); }
  return { X, Y, Z };
})();

/** how far from equal those three integrals came out — a check, not a knob */
export const whiteImbalance =
  (Math.max(WHITE.X, WHITE.Y, WHITE.Z) / Math.min(WHITE.X, WHITE.Y, WHITE.Z)) - 1;

/**
 * Tristimulus values of a spectrum, normalised so that a flat spectrum of
 * height 1 gives exactly X = Y = Z = 1 — that is, exactly neutral white.
 * @param {(l:number)=>number} P  the spectrum, as a function of nm
 */
export function spectrumToXYZ(P, samples = SAMPLES) {
  let X = 0, Y = 0, Z = 0, wx = 0, wy = 0, wz = 0;
  for (const l of samples) {
    const p = P(l);
    const bx = xBar(l), by = yBar(l), bz = zBar(l);
    X += p * bx; Y += p * by; Z += p * bz;
    wx += bx; wy += by; wz += bz;
  }
  /* normalised by what THIS sample set gives for a flat spectrum, so a coarse
   * sampling is still exactly neutral on a flat spectrum rather than slightly
   * tinted by its own spacing */
  return { X: wx > 0 ? X / wx : 0, Y: wy > 0 ? Y / wy : 0, Z: wz > 0 ? Z / wz : 0 };
}

/** a coarser sample set, for when a whole chart of colours has to be built */
export function samplesEvery(step, lo = LAM_LO, hi = LAM_HI) {
  const out = [];
  for (let l = lo; l <= hi + 1e-9; l += step) out.push(l);
  return out;
}

/* sRGB primaries, D65 white (IEC 61966-2-1) */
const M = [
  [ 3.2406, -1.5372, -0.4986],
  [-0.9689,  1.8758,  0.0415],
  [ 0.0557, -0.2040,  1.0570],
];

/* what a flat spectrum gives in linear sRGB, used for the adaptation below */
const W_RGB = {
  r: M[0][0] + M[0][1] + M[0][2],
  g: M[1][0] + M[1][1] + M[1][2],
  b: M[2][0] + M[2][1] + M[2][2],
};

/** the sRGB transfer function — not a plain gamma, it has a linear toe */
export function encode(u) {
  const v = Math.min(1, Math.max(0, u));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * XYZ (normalised as above) to display sRGB.
 *
 * @param {object} o
 * @param {number} o.scale  multiply the linear colour before encoding. A film
 *                          reflects a few percent, so its colour has to be
 *                          brightened to be a colour at all; every caller that
 *                          does so says so in the panel.
 * @returns {{r,g,b,css,gamutLoss,clipped}}
 */
export function toLinear({ X, Y, Z }, scale = 1) {
  let r = M[0][0] * X + M[0][1] * Y + M[0][2] * Z;
  let g = M[1][0] * X + M[1][1] * Y + M[1][2] * Z;
  let b = M[2][0] * X + M[2][1] * Y + M[2][2] * Z;
  /* the sRGB matrix is written for a D65 white; an equal-energy spectrum is
   * not D65, so the three channels are put back on terms with each other by
   * dividing through by what a flat spectrum gives. This is a von Kries
   * adaptation carried out in the display primaries, and it is what makes a
   * mirror come out white rather than faintly blue. */
  r = r / W_RGB.r * scale;
  g = g / W_RGB.g * scale;
  b = b / W_RGB.b * scale;
  /* out of gamut: add white rather than clip, so the hue survives */
  const lo = Math.min(r, g, b, 0);
  return { r: r - lo, g: g - lo, b: b - lo, gamutLoss: -lo };
}

/** linear sRGB, clipped and gamma-encoded, as a css colour */
export function packRGB({ r, g, b, gamutLoss = 0 }) {
  const hi = Math.max(r, g, b, 1);
  const clipped = hi > 1;
  if (clipped) { r /= hi; g /= hi; b /= hi; }
  const R = Math.round(255 * encode(r));
  const G = Math.round(255 * encode(g));
  const B = Math.round(255 * encode(b));
  return { r: R, g: G, b: B, css: `rgb(${R},${G},${B})`, gamutLoss, clipped };
}

export function xyzToSRGB(xyz, { scale = 1 } = {}) {
  return packRGB(toLinear(xyz, scale));
}

/** the whole chain in one call */
export function spectrumToCSS(P, opts) {
  return xyzToSRGB(spectrumToXYZ(P), opts);
}

/**
 * The colour of a single wavelength. Used to paint a spectrum bar — the strip
 * along a wavelength axis that says "this is where in the spectrum you are".
 * Saturated spectral colours lie outside a screen's gamut, so these come back
 * desaturated by the rule above; that is a property of the screen, not of the
 * light. Brightness is normalised away, because this bar is about hue: one
 * nanometre of deep red really is very dim, and drawing it that way would make
 * the end of the bar black.
 */
export function wavelengthCSS(l, { scale = 1 } = {}) {
  const { x, y } = locusAt(l);
  const xyz = { X: x / WHITE.X, Y: y / WHITE.Y, Z: (1 - x - y) / WHITE.Z };
  const L = toLinear(xyz, 1);
  /* brightness is normalised away in LINEAR light, before the transfer
   * function: one nanometre of deep red really is very dim, and drawing it
   * that way would make the end of the bar black */
  const m = Math.max(L.r, L.g, L.b, 1e-12);
  return packRGB({ r: L.r / m * scale, g: L.g / m * scale, b: L.b / m * scale,
                   gamutLoss: L.gamutLoss / m });
}

/**
 * Dominant wavelength: where a line from the white point through this colour
 * meets the spectral locus, in the CIE xy diagram. It is the ordinary-language
 * "what colour is it" for a mixed spectrum. Returns null when the line leaves
 * through the purple line instead, where no single wavelength will do — which
 * is exactly what "magenta is not in the rainbow" means.
 */
export function dominantWavelength({ X, Y, Z }) {
  const s = X + Y + Z;
  if (!(s > 1e-12)) return null;
  const x = X / s, y = Y / s;
  const wx = 1 / 3, wy = 1 / 3;
  const dx = x - wx, dy = y - wy;
  if (Math.hypot(dx, dy) < 1e-6) return null;                  // neutral
  let best = null;
  for (let i = 0; i < LOCUS.length - 1; i++) {
    const a = LOCUS[i], b = LOCUS[i + 1];
    const ax = a[1] - wx, ay = a[2] - wy;
    const bx = b[1] - wx, by = b[2] - wy;
    /* solve  white + u·d = a + v·(b − a)  for u ≥ 0 and v in [0,1] */
    const ex = bx - ax, ey = by - ay;
    const det = dx * (-ey) - dy * (-ex);
    if (Math.abs(det) < 1e-15) continue;
    const u = (ax * (-ey) - ay * (-ex)) / det;
    const v = (dx * ay - dy * ax) / det;
    if (u > 0 && v >= -1e-9 && v <= 1 + 1e-9) {
      best = a[0] + Math.min(Math.max(v, 0), 1) * (b[0] - a[0]);
      break;
    }
  }
  return best;
}
