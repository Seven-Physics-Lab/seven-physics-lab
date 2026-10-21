'use client';
import { useEffect, useRef } from 'react';

/**
 * The field behind the landing page.
 *
 * Nothing here is a decoration of a physics idea: five point charges drift on
 * slow paths, the electric field is Coulomb's law summed over them, and a
 * thousand test charges are released into it and simply follow the field
 * direction. The bright ribbons are the streamlines they trace out, so the
 * picture is dense where the field is strong and open where it is weak, for
 * the same reason a real field map is. The faint closed curves on top are
 * equipotentials of the same five charges, found by marching squares.
 *
 * Three colours only, as everywhere else: the ground is black warmed towards
 * the brand teal, and a streamline is drawn teal, lightened towards white
 * where the field is strong. Trails are laid down with additive blending, so
 * where many streamlines crowd together the line brightens on its own.
 */

type Src = {
  q: number; ax: number; ay: number; rx: number; ry: number;
  wx: number; wy: number; px: number; py: number;
};

/* charge, mean position (fractions of the box), drift amplitude (fraction of
 * the short side), drift rates and phases */
const SRC: Src[] = [
  { q: 1.00, ax: -0.31, ay: -0.10, rx: 0.055, ry: 0.070, wx: 0.21, wy: 0.17, px: 0.0, py: 1.1 },
  { q: -1.00, ax: 0.30, ay: 0.09, rx: 0.060, ry: 0.060, wx: 0.17, wy: 0.23, px: 2.0, py: 0.4 },
  { q: 0.70, ax: 0.09, ay: -0.27, rx: 0.070, ry: 0.048, wx: 0.13, wy: 0.19, px: 1.0, py: 2.6 },
  { q: -0.70, ax: -0.10, ay: 0.27, rx: 0.065, ry: 0.055, wx: 0.23, wy: 0.15, px: 3.1, py: 0.9 },
  { q: 0.55, ax: 0.42, ay: -0.30, rx: 0.075, ry: 0.065, wx: 0.11, wy: 0.27, px: 0.6, py: 1.9 },
  { q: -0.55, ax: -0.42, ay: 0.30, rx: 0.075, ry: 0.065, wx: 0.25, wy: 0.13, px: 2.4, py: 3.3 },
];

export default function FieldCanvas() {
  const trailRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tc = trailRef.current, oc = overRef.current;
    if (!tc || !oc) return;
    const tx = tc.getContext('2d'), ox = oc.getContext('2d');
    if (!tx || !ox) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, R = 0, ref = 1, n = 0;
    let px = new Float32Array(0), py = new Float32Array(0), age = new Float32Array(0),
        life = new Float32Array(0);
    let raf = 0, t = 0, dead = false;

    const seed = (i: number, fresh: boolean) => {
      px[i] = Math.random() * w;
      py[i] = Math.random() * h;
      age[i] = fresh ? 0 : Math.random() * 190;
      life[i] = 70 + Math.random() * 170;
    };

    const fit = () => {
      w = tc.clientWidth; h = tc.clientHeight;
      R = Math.min(w, h);
      ref = 1 / ((0.26 * R) * (0.26 * R));          // field of unit charge a quarter-box away
      for (const cv of [tc, oc]) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      tx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ox.setTransform(dpr, 0, 0, dpr, 0, 0);
      tx.clearRect(0, 0, w, h);
      const want = Math.max(360, Math.min(1250, Math.round((w * h) / 2100)));
      if (want !== n) {
        n = want;
        px = new Float32Array(n); py = new Float32Array(n);
        age = new Float32Array(n); life = new Float32Array(n);
      }
      for (let i = 0; i < n; i++) seed(i, false);
    };
    fit();
    window.addEventListener('resize', fit);

    const sx = new Float64Array(SRC.length), sy = new Float64Array(SRC.length);
    const place = () => {
      for (let i = 0; i < SRC.length; i++) {
        const s = SRC[i];
        sx[i] = w * 0.5 + s.ax * w + Math.cos(s.wx * t + s.px) * s.rx * R;
        sy[i] = h * 0.5 + s.ay * h + Math.sin(s.wy * t + s.py) * s.ry * R;
      }
    };

    /* Coulomb's law, added up. The softening keeps the singularity at a
     * charge from throwing a tracer across the page in one step. */
    const soft = () => (0.016 * R) * (0.016 * R);
    let ex = 0, ey = 0;
    const field = (x: number, y: number, s2: number) => {
      ex = 0; ey = 0;
      for (let i = 0; i < SRC.length; i++) {
        const dx = x - sx[i], dy = y - sy[i];
        const d2 = dx * dx + dy * dy + s2;
        const k = SRC[i].q / (d2 * Math.sqrt(d2));
        ex += k * dx; ey += k * dy;
      }
    };
    const pot = (x: number, y: number) => {
      let v = 0;
      for (let i = 0; i < SRC.length; i++) {
        const dx = x - sx[i], dy = y - sy[i];
        v += SRC[i].q / Math.sqrt(dx * dx + dy * dy + 900);
      }
      return v;
    };

    const advect = () => {
      const s2 = soft();
      tx.globalCompositeOperation = 'destination-out';
      tx.fillStyle = 'rgba(0,0,0,.052)';                   // the trails fade, the page does not
      tx.fillRect(0, 0, w, h);
      tx.globalCompositeOperation = 'lighter';
      tx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = px[i], y = py[i];
        field(x, y, s2);
        const m = Math.hypot(ex, ey);
        if (!(m > 0)) { seed(i, true); continue; }
        const s = m / (m + ref);                           // 0 weak … 1 strong
        const v = 0.55 + 3.0 * s;
        const nx = x + (ex / m) * v, ny = y + (ey / m) * v;
        const lum = Math.min(1, s * 1.55);
        tx.strokeStyle = `rgba(${Math.round(0 + 255 * lum * 0.92)},`
          + `${Math.round(95 + 160 * lum)},${Math.round(106 + 149 * lum)},`
          + `${(0.20 + 0.42 * s).toFixed(3)})`;
        tx.lineWidth = 0.75 + 0.9 * s;
        tx.beginPath(); tx.moveTo(x, y); tx.lineTo(nx, ny); tx.stroke();
        px[i] = nx; py[i] = ny; age[i] += 1;
        if (age[i] > life[i] || nx < -30 || ny < -30 || nx > w + 30 || ny > h + 30) seed(i, true);
      }
      tx.globalCompositeOperation = 'source-over';
    };

    const overlay = () => {
      ox.clearRect(0, 0, w, h);
      /* equipotentials, by marching squares: the curves are where the field
       * puts them, not where a designer would */
      const step = Math.max(10, Math.round(R / 64));
      const levels = [-0.055, -0.03, -0.017, -0.009, -0.005, 0.005, 0.009, 0.017, 0.03, 0.055];
      ox.lineWidth = 1;
      ox.strokeStyle = 'rgba(210,246,250,.085)';
      ox.beginPath();
      for (let x = -step; x < w + step; x += step) {
        for (let y = -step; y < h + step; y += step) {
          const v = [pot(x, y), pot(x + step, y), pot(x + step, y + step), pot(x, y + step)];
          const c = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]];
          for (const L of levels) {
            const cut: number[][] = [];
            for (let e = 0; e < 4; e++) {
              const p0 = v[e] - L, p1 = v[(e + 1) % 4] - L;
              if ((p0 < 0) !== (p1 < 0)) {
                const f = p0 / (p0 - p1);
                cut.push([c[e][0] + f * (c[(e + 1) % 4][0] - c[e][0]),
                          c[e][1] + f * (c[(e + 1) % 4][1] - c[e][1])]);
              }
            }
            for (let k = 0; k + 1 < cut.length; k += 2) {
              ox.moveTo(cut[k][0], cut[k][1]);
              ox.lineTo(cut[k + 1][0], cut[k + 1][1]);
            }
          }
        }
      }
      ox.stroke();

      /* the charges themselves: a halo, then the sign */
      ox.globalCompositeOperation = 'lighter';
      for (let i = 0; i < SRC.length; i++) {
        const rad = R * (0.055 + 0.075 * Math.abs(SRC[i].q));
        const g = ox.createRadialGradient(sx[i], sy[i], 0, sx[i], sy[i], rad);
        g.addColorStop(0, 'rgba(0,150,166,.34)');
        g.addColorStop(1, 'rgba(0,95,106,0)');
        ox.fillStyle = g;
        ox.beginPath(); ox.arc(sx[i], sy[i], rad, 0, Math.PI * 2); ox.fill();
      }
      ox.globalCompositeOperation = 'source-over';
      for (let i = 0; i < SRC.length; i++) {
        ox.beginPath(); ox.arc(sx[i], sy[i], 3.4, 0, Math.PI * 2);
        ox.fillStyle = SRC[i].q > 0 ? 'rgba(236,253,255,.92)' : 'rgba(0,18,21,.92)';
        ox.strokeStyle = 'rgba(180,240,246,.75)'; ox.lineWidth = 1.6;
        ox.fill(); ox.stroke();
      }
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      /* one still picture: the same tracers, run forward and then left alone */
      place();
      for (let k = 0; k < 220; k++) advect();
      overlay();
    } else {
      const frame = () => {
        if (dead) return;
        if (tc.clientWidth !== w || tc.clientHeight !== h) fit();
        if (w < 2 || h < 2) { raf = requestAnimationFrame(frame); return; }
        t += 1 / 60;
        place();
        advect();
        overlay();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <canvas ref={trailRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={overRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
