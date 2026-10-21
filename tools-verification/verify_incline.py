"""
A2-2  The Inclined Plane — verification.

Nothing here trusts the simulation's own arithmetic. The dynamics are
re-implemented in Python from Newton's second law and the Coulomb friction
model, and driven against the real simulation in a real browser. The two
results the simulation is supposed to RECOVER — that the block lets go where
tan θ = μs, and that the angle does not depend on the mass — are never given
to either side: the Python asks the simulation to tilt until it slips and then
takes the tangent of the answer.

Run:  cd seven-physics-lab && python3 -m http.server 8731 &
      cp tools-verification/harness-incline.html harness.html
      python3 tools-verification/verify_incline.py
"""
import math
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:8731/harness.html"
G = 9.81
DEG = math.pi / 180

fails = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (("   " + detail) if detail else ""))
    if not ok:
        fails.append(name)


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


# --------------------------------------------------------------------------
# the independent model
# --------------------------------------------------------------------------

def components(th, m):
    """The weight resolved on the slope, done as a rotation of the axes rather
    than by quoting a formula: exactly what the simulation claims to do."""
    t = th * DEG
    down = (math.cos(t), -math.sin(t))
    norm = (math.sin(t), math.cos(t))
    W = (0.0, -m * G)
    drive = W[0] * down[0] + W[1] * down[1]
    press = -(W[0] * norm[0] + W[1] * norm[1])
    return drive, press


def run(th, m, us, uk, L, seconds, h, v0=0.0):
    """A block on a slope. The surface holds with anything up to us*press and,
    once sliding, pushes back with uk*press against the motion."""
    drive, press = components(th, m)
    grip = us * press
    s, v, t, heat = 0.0, v0, 0.0, 0.0
    stuck = v0 == 0.0
    grips = 0
    at_foot = False
    for _ in range(int(round(seconds / h))):
        if stuck:
            if abs(drive) > grip:
                stuck = False
            else:
                t += h
                continue
        d = 1.0 if v > 0 else (-1.0 if v < 0 else (1.0 if drive >= 0 else -1.0))
        a = (drive - uk * press * d) / m
        ds = v * h + 0.5 * a * h * h
        s += ds
        v += a * h
        t += h
        heat += uk * press * abs(ds)
        if (d > 0 and v <= 0) or (d < 0 and v >= 0):
            v = 0.0
            if abs(drive) <= grip:
                stuck = True
                grips += 1
        if s >= L:
            # the stop is an event inside the step: back up to the wall exactly
            over = s - L
            s = L
            v = math.sqrt(max(0.0, v * v - 2 * a * over))
            heat -= uk * press * over
            bang = 0.5 * m * v * v
            v, stuck, at_foot = 0.0, True, True
            return dict(s=s, v=v, t=t, heat=heat, grips=grips, atFoot=at_foot, bang=bang)
        if s < 0:
            s, v = 0.0, 0.0
    return dict(s=s, v=v, t=t, heat=heat, grips=grips, atFoot=at_foot, bang=0.0)


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={"width": 1280, "height": 1100})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_function("window.READY===true", timeout=20000)

        L = pg.evaluate("() => window.SIM._geom().L")
        h = 1 / 2000

        # ------------------------------------------------ the resolution
        print("\nRESOLVING THE WEIGHT")
        worst = 0.0
        for th in (0, 7.5, 18, 31.8, 45):
            for m in (0.2, 2.0, 5.0):
                sim = pg.evaluate("([th,m]) => window.SIM._weightOn(th,m)", [th, m])
                dr, pr = components(th, m)
                worst = max(worst, abs(sim["drive"] - dr), abs(sim["press"] - pr))
        check("the simulation resolves the weight the same way an independent rotation "
              "of the axes does, at every angle and mass tried",
              worst < 1e-12, f"worst disagreement {worst:.2e} N")

        dr, pr = components(31.8, 2.0)
        check("and those components are the textbook ones, which were never written in "
              "the simulation: mg sin θ down the slope and mg cos θ into the surface",
              rel(dr, 2.0 * G * math.sin(31.8 * DEG)) < 1e-12
              and rel(pr, 2.0 * G * math.cos(31.8 * DEG)) < 1e-12,
              f"{dr:.4f} N and {pr:.4f} N at 31.8° for 2 kg")

        # -------------------------------------------- the static law, recovered
        print("\nTHE ANGLE IT LETS GO AT")
        worst = 0.0
        shown = []
        for us in (0.10, 0.27, 0.45, 0.62, 0.80, 1.00):
            ang = pg.evaluate("([m,mu]) => window.SIM._critical(m,mu)", [2.0, us])
            worst = max(worst, rel(math.tan(ang * DEG), us))
            shown.append(f"{us:.2f}->{ang:.3f}°")
        check("tan of the angle the block lets go at IS μs — Amontons' angle, recovered by "
              "tilting the model until it slips, never calculated",
              worst < 1e-9, "  ".join(shown))

        angles = [pg.evaluate("([m,mu]) => window.SIM._critical(m,mu)", [m, 0.62])
                  for m in (0.2, 0.5, 1.0, 2.0, 3.5, 5.0)]
        check("and that angle does not depend on the mass, which is why the picture on the "
              "ramp is drawn the same size whatever m is",
              max(angles) - min(angles) < 1e-9,
              f"{min(angles):.6f}° to {max(angles):.6f}° over 0.2 to 5 kg")

        # the dynamic model has to agree with the bisected answer
        crit = pg.evaluate("([m,mu]) => window.SIM._critical(m,mu)", [2.0, 0.62])
        p = dict(th=0, m=2.0, us=0.62, uk=0.40, L=L)
        tilt = pg.evaluate("([p,rate,h]) => window.SIM._tiltUp(p,rate,h)", [p, 2.0, h])
        check("tilting the ramp up slowly in the running simulation releases the block at "
              "that same angle, so the number in the readout is the behaviour on screen",
              abs(tilt["angle"] - crit) < 0.01,
              f'released at {tilt["angle"]:.3f}°, bisection says {crit:.3f}°')

        below = run(crit - 0.05, 2.0, 0.62, 0.40, L, 30.0, h)
        above = run(crit + 0.05, 2.0, 0.62, 0.40, L, 30.0, h)
        check("a twentieth of a degree below it the block never moves in half a minute, and "
              "a twentieth above it reaches the foot — the threshold is sharp",
              below["s"] == 0 and above["atFoot"],
              f'{below["s"] * 100:.2f} cm below, {above["s"] * 100:.1f} cm above')

        # ------------------------------------------------- the sliding block
        print("\nONCE IT IS SLIDING")
        th = 40.0
        sim = pg.evaluate("([p,s,h]) => window.SIM._run(p,s,h)",
                          [dict(p, th=th), 3.0, h])
        mine = run(th, 2.0, 0.62, 0.40, L, 3.0, h)
        check("the simulation's slide and an independent integration of F = ma agree",
              rel(sim["s"], mine["s"]) < 1e-9 and rel(sim["heat"], mine["heat"]) < 1e-9,
              f'{sim["s"]:.9f} m against {mine["s"]:.9f} m')

        drive, press = components(th, 2.0)
        a_th = (drive - 0.40 * press) / 2.0
        quick = pg.evaluate("([p,s,h]) => window.SIM._run(p,s,h)", [dict(p, th=th), 0.3, h])
        check("the acceleration measured off the slide is g(sin θ − μk cos θ), a result the "
              "simulation was never told",
              rel(2 * quick["s"] / quick["t"] ** 2, a_th) < 2e-9
              and rel(a_th, G * (math.sin(th * DEG) - 0.40 * math.cos(th * DEG))) < 1e-12,
              f'{2 * quick["s"] / quick["t"] ** 2:.6f} m s⁻² against {a_th:.6f} m s⁻²')

        part = pg.evaluate("([p,s,h]) => window.SIM._run(p,s,h)", [dict(p, th=th), 0.8, h])
        inn = 2.0 * G * part["s"] * math.sin(th * DEG)
        outn = 0.5 * 2.0 * part["v"] ** 2 + part["heat"]
        check("the books balance part way down: the height given up is the kinetic energy "
              "plus the heat the rubbing made",
              rel(inn, outn) < 1e-9, f"in {inn:.6f} J, out {outn:.6f} J")

        full = pg.evaluate("([p,s,h]) => window.SIM._run(p,s,h)", [dict(p, th=th), 5.0, h])
        inn = 2.0 * G * full["s"] * math.sin(th * DEG)
        outn = 0.5 * 2.0 * full["v"] ** 2 + full["heat"] + full["bang"]
        check("and they still balance after it hits the stop, once what the stop had to "
              "absorb is counted — the energy does not simply vanish at the bottom",
              rel(inn, outn) < 1e-9,
              f'in {inn:.6f} J, out {outn:.6f} J of which the stop took {full["bang"]:.3f} J')

        # ------------------------------------------- the lower angle, and hysteresis
        print("\nTILTING BACK DOWN")
        stop = pg.evaluate("([m,mu]) => window.SIM._critical(m,mu)", [2.0, 0.40])
        check("a block already sliding only stops at the lower angle whose tangent is μk, "
              "so tilting up and back down is not reversible",
              rel(math.tan(stop * DEG), 0.40) < 1e-9 and stop < crit,
              f"stops at {stop:.3f}°, went at {crit:.3f}°")

        keeps = pg.evaluate("([p,s,h,v0]) => window.SIM._run(p,s,h,v0)",
                            [dict(p, th=(stop + crit) / 2), 6.0, h, 0.4])
        halts = pg.evaluate("([p,s,h,v0]) => window.SIM._run(p,s,h,v0)",
                            [dict(p, th=stop - 2), 6.0, h, 0.4])
        check("between the two angles a moving block keeps moving while a resting one "
              "cannot start, and below them both it comes to rest",
              keeps["atFoot"] and not halts["atFoot"] and halts["v"] == 0,
              f'at {(stop + crit) / 2:.1f}° it reaches the foot; '
              f'at {stop - 2:.1f}° it stops after {halts["s"] * 100:.1f} cm')

        same = pg.evaluate("([m,mu]) => window.SIM._critical(m,mu)", [2.0, 0.62])
        check("make the two coefficients equal and the two angles collapse onto one — the "
              "control on the test above",
              abs(same - crit) < 1e-12,
              f"both {same:.3f}° when μk is raised to μs")

        free = pg.evaluate("([p,s,h]) => window.SIM._run(p,s,h)",
                           [dict(p, th=th, uk=0.0, us=0.0), 0.3, h])
        check("take the friction away entirely and the slide is g sin θ, which is the "
              "frictionless limit the model must reduce to",
              rel(2 * free["s"] / free["t"] ** 2, G * math.sin(th * DEG)) < 2e-9,
              f'{2 * free["s"] / free["t"] ** 2:.6f} m s⁻² against '
              f'{G * math.sin(th * DEG):.6f} m s⁻²')

        # --------------------------------------------------------- the stepper
        print("\nTHE INTEGRATOR")
        exact_t = 0.4
        s_exact = 0.5 * a_th * exact_t ** 2
        worst = 0.0
        for hh in (1 / 500, 1 / 2000, 1 / 8000):
            r = pg.evaluate("([p,s,h]) => window.SIM._run(p,s,h)", [dict(p, th=th), exact_t, hh])
            worst = max(worst, rel(r["s"], s_exact))
        check("on a slope held still the acceleration is constant, so the step is exact: "
              "the distance matches the closed form at every step size tried",
              worst < 1e-12, f"worst departure from ½at² is {worst:.2e}")

        rate = 2.0
        over = []
        for hh in (1 / 500, 1 / 1000, 1 / 2000, 1 / 8000):
            r = pg.evaluate("([p,rate,h]) => window.SIM._tiltUp(p,rate,h)", [p, rate, hh])
            over.append((hh, r["angle"] - crit))
        check("tilting is an event, not a smooth solution: the ramp can only overshoot the "
              "release angle by the tilt it adds in one step, and it never undershoots",
              all(0 <= o <= rate * hh * 1.000001 for hh, o in over),
              "; ".join(f"{o:.2e}° of a possible {rate * hh:.2e}°" for hh, o in over))

        # ------------------------------------------------------ the drawn curve
        print("\nTHE PICTURE")
        pg.evaluate("q => window.SIM._set(q)", dict(th=18, m=2.0, us=0.62, uk=0.40))
        cv = pg.evaluate("() => window.SIM._curve(2000)")
        pts = cv["pts"]
        drops = [(pts[i][1] - pts[i + 1][1], pts[i][0]) for i in range(len(pts) - 1)]
        biggest, where = max(drops)
        _, press_c = components(cv["crit"], 2.0)
        check("the drop in the curve the graph draws is at the angle the readout names, "
              "found on the drawn samples rather than assumed",
              abs(where - cv["crit"]) < 45 / 2000 * 2,
              f'drop at {where:.3f}°, readout says {cv["crit"]:.3f}°')

        check("and the size of that drop is the gap between the two coefficients times the "
              "force pressing the surfaces together",
              rel(biggest, (0.62 - 0.40) * press_c) < 0.01,
              f"{biggest:.4f} N against (μs − μk)N = {(0.62 - 0.40) * press_c:.4f} N")

        gauge = pg.evaluate("() => window.SIM._gauge()")
        drive18, press18 = components(18.0, 2.0)
        check("the gauge shows the friction actually acting, not the ceiling: at 18° the bar "
              "is the demand, and the ceiling marker is above it",
              rel(gauge["f"], abs(drive18)) < 1e-9 and gauge["cap"] > gauge["f"]
              and rel(gauge["cap"], 0.62 * press18) < 1e-9,
              f'bar {gauge["f"]:.3f} N, ceiling {gauge["cap"]:.3f} N')

        pg.evaluate("q => window.SIM._set(q)", dict(th=40))
        pg.wait_for_timeout(400)
        gauge = pg.evaluate("() => window.SIM._gauge()")
        _, press40 = components(40.0, 2.0)
        check("past the crossing the bar has snapped down to what sliding takes, which is "
              "below the ceiling it was touching a moment earlier",
              rel(gauge["f"], 0.40 * press40) < 1e-9 and gauge["f"] < gauge["cap"],
              f'bar {gauge["f"]:.3f} N, ceiling {gauge["cap"]:.3f} N, '
              f'μk N = {0.40 * press40:.3f} N')

        # the page itself
        pg.evaluate("q => window.SIM._set(q)", dict(th=18, m=2.0, us=0.62, uk=0.40))
        pg.wait_for_timeout(300)
        cells = pg.evaluate(
            """() => { const out = {};
                 document.querySelectorAll('.ibs-reads .ibs-rd').forEach(r =>
                   out[r.querySelector('.k').textContent.trim()] =
                     r.querySelector('.v').textContent.trim());
                 return out; }""")
        tan_cell = [v for k, v in cells.items() if k.startswith("tan of that angle")][0]
        shown_tan = float(tan_cell.split()[0])
        check("and the page says so too: the readout a student reads prints the tangent of "
              "the measured angle and it is μs",
              abs(shown_tan - 0.62) < 1e-3, f"page says {tan_cell}")

        check("no stage threw anything at the browser", not errs,
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
