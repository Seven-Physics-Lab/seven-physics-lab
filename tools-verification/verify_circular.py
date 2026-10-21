"""
A2-5  The Circular Motion Rig — verification.

Nothing here trusts the simulation's own arithmetic. Each of the three benches
is re-implemented in Python from Newton's second law and driven against the
real simulation in a browser. The results of the topic — a = v²/r, the conical
pendulum's period, tan β = v²/rg, v_min = √(gr) — are never given to the
simulation; the Python asks it for a measurement and then checks the
measurement against the result.

Run:  cd seven-physics-lab && python3 -m http.server 8731 &
      cp tools-verification/harness-circular.html harness.html
      python3 tools-verification/verify_circular.py
"""
import math
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:8731/harness.html"
G = 9.81
DEG = math.pi / 180
TAU = math.pi * 2

fails = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (("   " + detail) if detail else ""))
    if not ok:
        fails.append(name)


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


# --------------------------------------------------------------------------
# independent models
# --------------------------------------------------------------------------

def cone_run(L, m, ph_deg, v0, seconds, h):
    """A bob on a string, free in two angles: a spherical pendulum. Gravity and
    the string have no moment about the vertical, so the angular momentum about
    it is constant and the azimuth follows from it."""
    ph = ph_deg * DEG
    Lz = L * math.sin(ph) * v0
    phd, ps, t = 0.0, 0.0, 0.0
    lo = hi = ph
    period, last, up = None, None, None

    def rate(p):
        s = max(abs(math.sin(p)), 1e-7)
        psd = Lz / (L * L * s * s)
        return math.sin(p) * math.cos(p) * psd * psd - (G / L) * math.sin(p)

    for _ in range(int(round(seconds / h))):
        a1, b1 = rate(ph), phd
        a2, b2 = rate(ph + h / 2 * b1), phd + h / 2 * a1
        a3, b3 = rate(ph + h / 2 * b2), phd + h / 2 * a2
        a4, b4 = rate(ph + h * b3), phd + h * a3
        ph += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4)
        phd += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4)
        s = max(abs(math.sin(ph)), 1e-7)
        ps += h * Lz / (L * L * s * s)
        t += h
        lo, hi = min(lo, ph), max(hi, ph)
        turns = math.floor(ps / TAU)
        if last is not None and turns > last:
            period = t - up
        if last is None or turns > last:
            up, last = t, turns
    s = max(abs(math.sin(ph)), 1e-7)
    psd = Lz / (L * L * s * s)
    speed = math.hypot(L * s * psd, L * phd)
    T = m * (G * math.cos(ph) + L * (phd * phd + s * s * psd * psd))
    return dict(ph=ph, phd=phd, ps=ps, t=t, lo=lo / DEG, hi=hi / DEG, period=period,
                T=T, speed=speed,
                energy=0.5 * m * speed * speed - m * G * L * math.cos(ph))


def bank_solve(r, beta_deg, v, m):
    """Newton's second law along the road surface and across it, solved for the
    road's push and the friction it must find."""
    b = beta_deg * DEG
    N = m * ((v * v / r) * math.sin(b) + G * math.cos(b))
    need = m * (G * math.sin(b) - (v * v / r) * math.cos(b))
    return N, need


def loop_run(r, m, hold, v0, seconds, h):
    """Round the inside of a vertical circle. Along the circle r θ̈ = −g sin θ;
    across it the hold must supply C = m v²/r + mg cos θ towards the centre."""
    th, thd, t = 1e-4, v0 / r, 0.0
    free = False
    top = bottom = None
    left_at = None
    for _ in range(int(round(seconds / h))):
        if free:
            break
        a1, b1 = -(G / r) * math.sin(th), thd
        a2, b2 = -(G / r) * math.sin(th + h / 2 * b1), thd + h / 2 * a1
        a3, b3 = -(G / r) * math.sin(th + h / 2 * b2), thd + h / 2 * a2
        a4, b4 = -(G / r) * math.sin(th + h * b3), thd + h * a3
        th += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4)
        thd += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4)
        t += h
        C = m * (r * thd * thd) + m * G * math.cos(th)
        if bottom is None and th > 0:
            bottom = C
        if top is None and th >= math.pi:
            top = C
        if hold != "rod" and C < 0:
            free, left_at = True, th
    v = r * thd
    return dict(th=th, thd=thd, t=t, free=free, top=top, bottom=bottom, leftAt=left_at,
                energy=0.5 * m * v * v + m * G * r * (1 - math.cos(th)))


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={"width": 1280, "height": 1100})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_function("window.READY===true", timeout=20000)
        h = 1 / 1500

        # ================================================ the conical pendulum
        print("\nBENCH 1 — THE CONICAL PENDULUM")
        L, m, ph0, v0 = 0.80, 0.40, 35.0, 1.60
        sim = pg.evaluate("([L,m,ph,v0,s,h]) => window.SIM._coneRun(L,m,ph,v0,s,h)",
                          [L, m, ph0, v0, 8.0, h])
        mine = cone_run(L, m, ph0, v0, 8.0, h)
        check("the simulation's spherical pendulum and an independent Runge-Kutta of the "
              "same two angles agree step for step",
              rel(sim["ph"], mine["ph"]) < 1e-9 and rel(sim["ps"], mine["ps"]) < 1e-9,
              f'string angle {sim["ph"] / DEG:.6f}° against {mine["ph"] / DEG:.6f}°')

        worst = 0.0
        shown = []
        for Lx in (0.35, 0.80, 1.15):
            for phx in (12.0, 35.0, 62.0):
                vh = pg.evaluate("([L,ph]) => window.SIM._coneHold(L,ph)", [Lx, phx])
                want = math.sqrt(G * Lx * math.sin(phx * DEG) ** 2 / math.cos(phx * DEG))
                worst = max(worst, rel(vh, want))
                shown.append(f"{phx:.0f}°/{Lx:.2f}m")
        check("the speed that holds a cone, found by launching and watching whether the "
              "string angle climbs or falls, is the one the geometry demands",
              worst < 1e-8,
              f"worst departure {worst:.2e} over " + ", ".join(shown[:4]) + " …")

        steady_v = pg.evaluate("([L,ph]) => window.SIM._coneHold(L,ph)", [L, ph0])
        steady = pg.evaluate("([L,m,ph,v0,s,h]) => window.SIM._coneRun(L,m,ph,v0,s,h)",
                             [L, m, ph0, steady_v, 20.0, h])
        check("launched at that speed the cone really is steady: the string angle does not "
              "move over twenty seconds",
              steady["hi"] - steady["lo"] < 1e-5,
              f'between {steady["lo"]:.7f}° and {steady["hi"]:.7f}°')

        want_T = TAU * math.sqrt(L * math.cos(ph0 * DEG) / G)
        check("and the period timed off that motion is 2π√(L cos φ / g), which is nowhere "
              "in the simulation",
              rel(steady["period"], want_T) < 2e-4,
              f'timed {steady["period"]:.5f} s against {want_T:.5f} s')

        heavy = pg.evaluate("([L,m,ph,v0,s,h]) => window.SIM._coneRun(L,m,ph,v0,s,h)",
                            [L, 4 * m, ph0, steady_v, 20.0, h])
        check("ten times the mass, the same cone and the same period — the bob's weight "
              "and the pull it needs grow together",
              rel(heavy["period"], steady["period"]) < 1e-12,
              f'{heavy["period"]:.6f} s against {steady["period"]:.6f} s')

        wob = pg.evaluate("([L,m,ph,v0,s,h]) => window.SIM._coneRun(L,m,ph,v0,s,h)",
                          [L, m, ph0, steady_v * 1.25, 20.0, h])
        check("launch it too fast and it is not a cone at all: the bob rides up and down "
              "between two angles, with the steady one between them",
              wob["hi"] - wob["lo"] > 1 and wob["lo"] <= ph0 + 1e-6 <= wob["hi"],
              f'swinging between {wob["lo"]:.2f}° and {wob["hi"]:.2f}°, launched at {ph0:.0f}°')

        e0 = cone_run(L, m, ph0, steady_v * 1.25, 0.001, h)["energy"]
        check("energy holds along that wobble, which nothing in the model was told to "
              "conserve",
              rel(wob["energy"], e0) < 1e-9,
              f'{wob["energy"]:.9f} J against {e0:.9f} J')

        r_cone = L * math.sin(steady["ph"])
        check("the acceleration towards the axis is the horizontal part of the string's "
              "pull divided by the mass, and it equals v²/r",
              rel(steady["speed"] ** 2 / r_cone,
                  steady["T"] * math.sin(steady["ph"]) / m) < 1e-9,
              f'{steady["speed"] ** 2 / r_cone:.6f} m s⁻² both ways')

        # ==================================================== the banked track
        print("\nBENCH 2 — THE BANKED TRACK")
        worst = 0.0
        for r in (18.0, 40.0, 85.0):
            for beta in (5.0, 20.0, 34.0):
                vf = pg.evaluate("([r,b,m]) => window.SIM._bankFree(r,b,m)", [r, beta, 1200])
                worst = max(worst, rel(math.tan(beta * DEG), vf * vf / (r * G)))
        check("the speed at which the bend needs no friction at all, found by trial, "
              "satisfies tan β = v²/rg — a result the simulation never saw",
              worst < 1e-8, f"worst departure {worst:.2e} over nine bends")

        vs = [pg.evaluate("([r,b,m]) => window.SIM._bankFree(r,b,m)", [40.0, 20.0, mm])
              for mm in (300, 1200, 9000)]
        check("and it does not depend on the mass: a motorbike and a lorry are held by the "
              "same bend at the same speed",
              max(vs) - min(vs) < 1e-9, f"{min(vs):.9f} to {max(vs):.9f} m s⁻¹")

        p = dict(r=40.0, beta=20.0, mu=0.25, v=12.0, m=1200.0, w=9.0)
        q = pg.evaluate("([s,p]) => window.SIM._bankForces(s,p)", [0.0, p])
        N, need = bank_solve(p["r"], p["beta"], p["v"], p["m"])
        check("the push from the road and the friction it must find match an independent "
              "solve of the two equations",
              rel(q["N"], N) < 1e-12 and abs(q["need"] - need) < 1e-9,
              f'N {q["N"] / 1000:.4f} kN, friction {q["need"] / 1000:.4f} kN')

        band = pg.evaluate("p => window.SIM._bankBand(p)", p)
        for v, name in ((band["slowest"], "slowest"), (band["fastest"], "fastest")):
            qq = pg.evaluate("([s,p]) => window.SIM._bankForces(s,p)", [0.0, dict(p, v=v)])
            check(f"at the {name} speed the bend will hold, the tyres are giving exactly "
                  "everything they have",
                  rel(abs(qq["need"]), qq["grip"]) < 1e-6,
                  f'{v:.3f} m s⁻¹: friction {abs(qq["need"]) / 1000:.4f} kN of '
                  f'{qq["grip"] / 1000:.4f} kN')

        slow = pg.evaluate("([p,s,h]) => window.SIM._bankRun(p,s,h)",
                           [dict(p, v=band["slowest"] * 0.8), 4.0, h])
        fast = pg.evaluate("([p,s,h]) => window.SIM._bankRun(p,s,h)",
                           [dict(p, v=band["fastest"] * 1.2), 4.0, h])
        hold = pg.evaluate("([p,s,h]) => window.SIM._bankRun(p,s,h)",
                           [dict(p, v=band["free"]), 4.0, h])
        check("outside that band the car is not told it would slide, it is watched sliding: "
              "too slow and it goes down the bank, too fast and it goes up",
              slow["s"] < -0.5 and fast["s"] > 0.5 and abs(hold["s"]) < 1e-9,
              f'{slow["s"]:.2f} m down when slow, {fast["s"]:+.2f} m up when fast, '
              f'{hold["s"]:.1e} m at the free speed')

        dry = pg.evaluate("p => window.SIM._bankBand(p)", dict(p, mu=0.0))
        check("take the friction away and the band closes to a single speed — the control "
              "on the test above",
              abs(dry["fastest"] - dry["slowest"]) < 1e-6
              and rel(dry["free"], band["free"]) < 1e-12,
              f'{dry["slowest"]:.4f} to {dry["fastest"]:.4f} m s⁻¹')

        v = band["free"]
        check("the acceleration towards the axis is v²/r, and it is what the road's "
              "sideways push is providing on its own at that speed",
              rel(v * v / p["r"],
                  bank_solve(p["r"], p["beta"], v, 1.0)[0] * math.sin(p["beta"] * DEG)) < 1e-9,
              f'{v * v / p["r"]:.6f} m s⁻² both ways')

        # ==================================================== the vertical loop
        print("\nBENCH 3 — THE VERTICAL LOOP")
        lp = dict(r=1.2, m=0.25, hold="track")
        sim = pg.evaluate("([p,v0,s,h]) => window.SIM._loopRun(p,v0,s,h)", [lp, 9.0, 3.0, h])
        mine = loop_run(lp["r"], lp["m"], "track", 9.0, 3.0, h)
        check("the simulation's loop and an independent integration of r θ̈ = −g sin θ agree",
              rel(sim["th"], mine["th"]) < 1e-9 and rel(sim["thd"], mine["thd"]) < 1e-9,
              f'{sim["th"] / DEG:.5f}° against {mine["th"] / DEG:.5f}°')

        vmin = pg.evaluate("p => window.SIM._loopMin(p)", lp)
        check("the slowest launch that gets a body held by a track all the way round, "
              "measured by trying it, has v² = 5gr",
              rel(vmin * vmin, 5 * G * lp["r"]) < 2e-3,
              f'{vmin:.4f} m s⁻¹, v² = {vmin * vmin:.4f} against 5gr = {5 * G * lp["r"]:.4f}')

        atmin = pg.evaluate("([p,v0,s,h]) => window.SIM._loopRun(p,v0,s,h)",
                            [lp, vmin * 1.0005, 3.0, h])
        check("and at that speed the track is doing nothing at all at the top: the body is "
              "held up by its own motion",
              atmin["top"] is not None and abs(atmin["top"]) < 0.02 * lp["m"] * G,
              f'{atmin["top"]:.5f} N at the top, weight {lp["m"] * G:.3f} N')

        check("while at the bottom the same track is supplying the whole of mv²/r and the "
              "weight besides",
              rel(atmin["bottom"], lp["m"] * vmin * vmin / lp["r"] + lp["m"] * G) < 2e-3,
              f'{atmin["bottom"]:.4f} N against {lp["m"] * vmin ** 2 / lp["r"] + lp["m"] * G:.4f} N')

        heavy = pg.evaluate("p => window.SIM._loopMin(p)", dict(lp, m=1.4))
        check("the slowest speed round does not depend on the mass either",
              rel(heavy, vmin) < 1e-12, f"{heavy:.6f} against {vmin:.6f} m s⁻¹")

        rod = pg.evaluate("p => window.SIM._loopMin(p)", dict(lp, hold="rod"))
        check("swap the string for a rigid rod and the condition changes completely: it has "
              "only to arrive at the top at all, so v² = 4gr",
              rel(rod * rod, 4 * G * lp["r"]) < 3e-3 and rod < vmin,
              f'{rod:.4f} m s⁻¹, v² = {rod * rod:.4f} against 4gr = {4 * G * lp["r"]:.4f}')

        slowTrack = pg.evaluate("([p,v0,s,h]) => window.SIM._loopRun(p,v0,s,h)",
                                [lp, vmin * 0.95, 3.0, h])
        slowRod = pg.evaluate("([p,v0,s,h]) => window.SIM._loopRun(p,v0,s,h)",
                              [dict(lp, hold="rod"), vmin * 0.95, 3.0, h])
        check("just below it the track lets go and the body falls, while the rod carries it "
              "round — the control that shows the condition belongs to the hold, not the body",
              slowTrack["leftAt"] is not None and slowRod["leftAt"] is None,
              f'the track let go at {(slowTrack["leftAt"] or 0) / DEG:.1f}°, '
              f'the rod carried it right round')

        e0 = loop_run(lp["r"], lp["m"], "rod", 9.0, 0.001, h)["energy"]
        check("energy holds right round the loop, which the model was not told to conserve",
              rel(sim["energy"], e0) < 1e-9,
              f'{sim["energy"]:.9f} J against {e0:.9f} J')

        th = 1.1
        v = 7.0
        C = pg.evaluate("([p,th,v]) => window.SIM._loopForce(p,th,v)", [lp, th, v])
        check("and everywhere round the loop the hold plus gravity add up to exactly "
              "mv²/r towards the centre",
              rel(C - lp["m"] * G * math.cos(th), lp["m"] * v * v / lp["r"]) < 1e-12,
              f'{C - lp["m"] * G * math.cos(th):.6f} N against '
              f'{lp["m"] * v * v / lp["r"]:.6f} N')

        check("no bench threw anything at the browser", not errs,
              "; ".join(errs[:3]) if errs else "clean")
        br.close()

    print()
    if fails:
        print(f"{len(fails)} CHECK(S) FAILED")
        for f in fails:
            print("  - " + f)
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
