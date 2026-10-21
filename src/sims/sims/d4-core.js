/* ============================================================================
 * D4 core — the field of a bar magnet, and how much of it a coil links
 *
 * Pure functions, no drawing. Everything the Faraday bench knows about
 * magnetism is in this file, and it is short on purpose.
 *
 * THE ONLY INPUTS
 *
 *   1. A uniformly magnetised cylinder is exactly a sheet of current running
 *      round its curved surface, K = M = B_r/μ₀ amperes per metre. That is a
 *      statement about what magnetisation IS, not a model of it.
 *   2. The vector potential of one circular loop of current, which is the
 *      Biot–Savart law integrated once round the loop:
 *
 *        A_φ(r, z) = (μ₀I/πk)·√(a/r)·[(1 − k²/2)K(k) − E(k)],
 *        k² = 4ar / ((a + r)² + z²)
 *
 *   3. The flux through any closed curve is the line integral of A round it.
 *
 * Nothing else. The field of the magnet is never written down; the dipole
 * approximation is never used; there is no "B = …" anywhere. The flux a coil
 * links is got by walking round every turn of the coil and adding up A, for
 * every slice of the magnet's current sheet — and because both the sheet and
 * the winding are uniform, the double sum along their lengths collapses to
 * four values of a single twice-integrated function H, which is tabulated
 * once, at start-up, from the three lines above.
 * ==========================================================================*/

export const MU0 = 4e-7 * Math.PI;
const TAU = Math.PI * 2;

/* the bench, in metres */
export const MAG_A = 0.008;       // magnet radius
export const MAG_L = 0.06;        // magnet length
export const COIL_R = 0.016;      // radius of the winding
export const COIL_L = 0.03;       // length of the winding
export const WIRE = 0.0016;       // how thick the winding is, for collisions

/* ------------------------------------------------------------ elliptic */

/** K(m) and E(m) by the arithmetic–geometric mean, m = k² */
export function ellKE(m) {
  let a = 1, b = Math.sqrt(Math.max(0, 1 - m)), c = Math.sqrt(Math.max(0, m));
  let s = 0.5 * c * c, p = 0.5;
  for (let i = 0; i < 40; i++) {
    const an = 0.5 * (a + b);
    c = 0.5 * (a - b);
    b = Math.sqrt(a * b);
    a = an;
    p *= 2;
    s += p * c * c;
    if (Math.abs(c) < 1e-17) break;
  }
  const K = Math.PI / (2 * a);
  return { K, E: K * (1 - s) };
}

/* (1 − m/2)K − E = (πm²/32)·S(m): the series, for small m, where the
 * difference of two numbers near π/2 would lose every digit it had */
const SER = [1.0, 0.75, 0.5859375, 0.478515625, 0.40374755859375,
  0.3489532470703125, 0.30715155601501465, 0.27424246072769165,
  0.24767522234469652, 0.22578473552130163, 0.20743972576019587,
  0.19184548064185947];

/**
 * A_φ / r for a loop of radius a carrying one ampere, at a point a distance r
 * from its axis and z along it. Divided by r because every use of it here
 * wants it that way, and because then it is finite on the axis.
 */
export function loopAr(a, r, z) {
  const sum = (a + r) * (a + r) + z * z;
  const m = 4 * a * r / sum;
  if (m < 0.1) {
    let S = 0, mp = 1;
    for (let i = 0; i < SER.length; i++) { S += SER[i] * mp; mp *= m; }
    return MU0 * a * a * S / (4 * sum * Math.sqrt(sum));
  }
  const { K, E } = ellKE(m);
  const k = Math.sqrt(m);
  return MU0 * Math.sqrt(a) * ((1 - 0.5 * m) * K - E) / (Math.PI * k * r * Math.sqrt(r));
}

/**
 * The flux one ampere in a loop of radius a sends through a ring of radius R,
 * parallel to it, a distance δ along the axis and ρ off it. It is ∮A·dl round
 * the ring. With the ring at (ρ + R cos φ, R sin φ) in the loop's frame,
 *
 *     A·dl = (A_φ / r) · R (R + ρ cos φ) dφ,    r = |ρ + R e^{iφ}|
 *
 * and the integrand is periodic and smooth, so the midpoint rule converges
 * faster than any power of N — except where the ring runs through the loop
 * itself, which is why N is raised there.
 */
export function ringFlux(a, R, delta, rho, N = 64) {
  let s = 0;
  const R2 = R * R, rho2 = rho * rho;
  for (let i = 0; i < N; i++) {
    const c = Math.cos(Math.PI * (i + 0.5) / N);
    const r = Math.sqrt(rho2 + R2 + 2 * rho * R * c);
    s += loopAr(a, r, delta) * R * (R + rho * c);
  }
  return s * TAU / N;
}

/* ------------------------------------------------------------ the table */

/**
 * H(δ, ρ) with ∂²H/∂δ² = G(δ, ρ), the ring flux; H(0) = ∂H/∂δ(0) = 0.
 *
 * Why a twice-integrated thing: the magnet is a uniform sheet of current
 * over its length and the coil a uniform winding over its length, so the
 * flux linked is K·n·∫∫ G(d + u − v) du dv over both lengths. Integrate G
 * twice and the double integral is exactly
 *
 *     H(d + Σ) − H(d + Δ) − H(d − Δ) + H(d − Σ),   Σ, Δ = (L_m ± L_c)/2
 *
 * — four look-ups, however many turns the coil has.
 */
export function buildH(a = MAG_A, R = COIL_R, opts = {}) {
  const DMAX = opts.dmax ?? 0.34;
  const h0 = opts.h0 ?? 2e-4, grow = opts.grow ?? 1.02, near = opts.near ?? 0.02;
  const DR = opts.dr ?? 0.0009, RMAX = opts.rmax ?? 0.072;
  const Nq = opts.N ?? 64, Nb = opts.Nb ?? 320;

  const d = [0];
  let h = h0;
  while (d[d.length - 1] < DMAX) {
    const x = d[d.length - 1];
    if (x >= near) h *= grow;
    d.push(x + h);
  }
  const nd = d.length;
  const nr = Math.ceil(RMAX / DR) + 1;
  const H = new Float64Array(nd * nr), H1 = new Float64Array(nd * nr);
  for (let j = 0; j < nr; j++) {
    const rho = j * DR;
    const band = Math.abs(rho - (R - a)) < 0.004 || Math.abs(rho - (R + a)) < 0.004;
    let I1 = 0, HH = 0;
    H[j * nd] = 0; H1[j * nd] = 0;
    for (let i = 0; i < nd - 1; i++) {
      const w = d[i + 1] - d[i], mid = 0.5 * (d[i] + d[i + 1]);
      const N = band && mid < 0.005 ? Nb : Nq;
      const g = ringFlux(a, R, mid, rho, N);
      HH += w * I1 + 0.5 * w * w * g;
      I1 += w * g;
      H[j * nd + i + 1] = HH;
      H1[j * nd + i + 1] = I1;
    }
  }
  return { d, nd, nr, DR, H, H1, a, R };
}

function locate(d, x) {
  let lo = 0, hi = d.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid] <= x) lo = mid; else hi = mid;
  }
  return lo;
}

/** H along δ at one ρ node, by cubic Hermite from H and its slope */
function hAlong(T, j, x) {
  const { d, nd, H, H1 } = T;
  const jj = Math.abs(j);                      // H is even in ρ
  const base = jj * nd;
  const last = nd - 1;
  if (x >= d[last]) {
    return H[base + last] + H1[base + last] * (x - d[last]);
  }
  const i = locate(d, x);
  const w = d[i + 1] - d[i], t = (x - d[i]) / w;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * H[base + i] + (t3 - 2 * t2 + t) * w * H1[base + i]
       + (-2 * t3 + 3 * t2) * H[base + i + 1] + (t3 - t2) * w * H1[base + i + 1];
}

/** H(δ, ρ): Hermite along δ, Catmull–Rom across ρ */
export function readH(T, delta, rho) {
  const x = Math.abs(delta), r = Math.abs(rho);
  const g = r / T.DR;
  let j = Math.floor(g);
  if (j > T.nr - 3) j = T.nr - 3;
  const t = g - j;
  const p0 = hAlong(T, j - 1, x), p1 = hAlong(T, j, x);
  const p2 = hAlong(T, j + 1, x), p3 = hAlong(T, j + 2, x);
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3
       + t * (3 * (p1 - p2) + p3 - p0)));
}

/**
 * The flux linkage of the coil, in webers, with the magnet's centre a
 * distance d along the axis from the coil's and ρ off it.
 *   Br: remanence in tesla; turns: the number of turns; sgn: ±1 for which
 *   way round the magnet is.
 */
export function linkage(T, d, rho, Br, turns, sgn = 1, Lm = MAG_L, Lc = COIL_L) {
  const K = Br / MU0, n = turns / Lc;
  const S = 0.5 * (Lm + Lc), D = 0.5 * (Lm - Lc);
  return sgn * K * n * (readH(T, d + S, rho) - readH(T, d + D, rho)
                      - readH(T, d - D, rho) + readH(T, d - S, rho));
}

/* ------------------------------------------------------------ field lines */

/**
 * ψ = r·A_φ of the magnet: in a field with an axis of symmetry, the lines of
 * B are exactly the contours of ψ, and equal steps in ψ are equal amounts of
 * flux. The magnet's A is its sheet of current integrated along its length.
 */
export function magnetPsi(r, z, a = MAG_A, L = MAG_L, Ng = 96) {
  /* composite Gauss, 3 points a panel */
  const gx = [-0.7745966692414834, 0, 0.7745966692414834];
  const gw = [0.5555555555555556, 0.8888888888888888, 0.5555555555555556];
  const P = Ng / 3, w = L / P;
  let s = 0;
  for (let p = 0; p < P; p++) {
    const c = -L / 2 + (p + 0.5) * w;
    for (let q = 0; q < 3; q++) {
      const u = c + 0.5 * w * gx[q];
      s += gw[q] * 0.5 * w * loopAr(a, r, z - u);
    }
  }
  return r * r * s;          // r · A,  with A = r · (A/r)
}

/* ------------------------------------------------------------ collisions */

/** can the magnet's centre be at (x, y), with the coil centred at (xc, yc)? */
export function magnetFits(x, y, xc, yc, Lm = MAG_L, a = MAG_A,
                           R = COIL_R, Lc = COIL_L, w = WIRE) {
  const overlap = Math.abs(x - xc) < 0.5 * Lm + 0.5 * Lc + w;
  if (!overlap) return true;
  const r = Math.abs(y - yc);
  return r + a <= R - w || r - a >= R + w;
}

/* ------------------------------------------------------------ the generator */

/**
 * A rectangular coil of half-width wh and half-height hh, turning about a
 * vertical axle in a uniform field B along x. θ is the angle between the
 * coil's normal and the field.
 *
 * The emf is worked out the way a charge in the wire feels it: every piece
 * of wire moves, the force per unit charge on it is v × B, and the emf is
 * that pushed round the loop, ∮(v × B)·dl. Nothing about flux is used.
 */
export function motionalEmf(theta, omega, B, wh, hh, turns, nseg = 24) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const n = [c, 0, s], eu = [-s, 0, c];
  /* the loop's four corners, in order of positive circulation about n̂ */
  const corner = (u, y) => [u * eu[0], y, u * eu[2]];
  const P = [corner(0, hh), corner(wh, hh), corner(wh, -hh), corner(-wh, -hh),
             corner(-wh, hh), corner(0, hh)];
  let emf = 0;
  for (let k = 0; k < P.length - 1; k++) {
    const A = P[k], Bp = P[k + 1];
    for (let i = 0; i < nseg; i++) {
      const t = (i + 0.5) / nseg;
      const x = A[0] + (Bp[0] - A[0]) * t, y = A[1] + (Bp[1] - A[1]) * t;
      const z = A[2] + (Bp[2] - A[2]) * t;
      /* the coil turns so θ grows: a point at u along ê_u moves as u·dê_u/dθ·ω */
      const u = x * eu[0] + z * eu[2];
      const vx = -omega * u * n[0], vy = 0, vz = -omega * u * n[2];
      /* v × B with B = (B, 0, 0) */
      const fx = 0, fy = vz * B, fz = -vy * B;
      const dlx = (Bp[0] - A[0]) / nseg, dly = (Bp[1] - A[1]) / nseg;
      const dlz = (Bp[2] - A[2]) / nseg;
      emf += fx * dlx + fy * dly + fz * dlz;
      void y;
    }
  }
  return turns * emf;
}

/** the flux through the same coil, by adding up B·n̂ over its area */
export function coilFlux(theta, B, wh, hh, turns, ng = 8) {
  const n = [Math.cos(theta), 0, Math.sin(theta)];
  let s = 0;
  const du = 2 * wh / ng, dy = 2 * hh / ng;
  for (let i = 0; i < ng; i++) {
    for (let j = 0; j < ng; j++) {
      s += (B * n[0]) * du * dy;       // the field is (B, 0, 0) everywhere
    }
  }
  return turns * s;
}
