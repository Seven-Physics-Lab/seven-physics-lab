"""
A3-2  Work — verification.

Nothing here trusts the simulation's own arithmetic. Both benches are
re-implemented in Python from the definition of work alone and driven against
the real simulation in a browser. The results of the topic — ½kx² for a spring,
W = Fs cos θ, the work–energy theorem, tan θ = μ for the easiest rope angle —
are never given to the simulation; the Python asks it for a number it
accumulated and checks the number against the result.

Run:  cd seven-physics-lab && python3 -m http.server 8731 &
      cp tools-verification/harness-work.html harness.html
      python3 tools-verification/verify_work.py
"""
import math
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:8731/harness.html"
G = 9.81
DEG = math.pi / 180
S_MAX = 2.4

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

def force(x, p):
    """What the thing in the clamp pulls back with. A measured property of the
    object, with nothing about work in it."""
    if x <= 0:
        return 0.0
    if p["mode"] == "spring":
        return p["k"] * x
    return p["k"] * x * (1 + (x / p["xc"]) ** 2)


def work_to(x, p, n=4000):
    """The definition of work, and only the definition: force through
    displacement, added up along the way."""
    w = 0.0
    for i in range(n):
        x0, x1 = x * i / n, x * (i + 1) / n
        w += force((x0 + x1) / 2, p) * (x1 - x0)
    return w


def floor_forces(p):
    t = p["th"] * DEG
    along = p["F"] * math.cos(t)
    lift = p["F"] * math.sin(t)
    N = max(0.0, p["m"] * G - lift)
    return along, lift, N, p["mu"] * N


def pull_run(p, seconds, h):
    """Newton's second law for the block, with each force's own F·ds kept
    separately as it goes."""
    s = v = t = wp = wf = 0.0
    along, lift, N, fric = floor_forces(p)
    for _ in range(int(round(seconds / h))):
        if v <= 0 and along <= fric:
            t += h
            continue
        a = (along - fric * (1.0 if v >= 0 else -1.0)) / p["m"]
        ds = v * h + 0.5 * a * h * h
        s += ds
        v += a * h
        t += h
        wp += along * ds
        wf += fric * abs(ds)
        if v < 0:
            v = 0.0
        if s >= S_MAX:
            s = S_MAX
            break
    return dict(s=s, v=v, t=t, wPull=wp, wFric=wf, ke=0.5 * p["m"] * v * v)


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={"width": 1280, "height": 1100})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_function("window.READY===true", timeout=20000)
        h = 1 / 2000

        # =========================================================== stretching
        print("\nBENCH 1 — STRETCHING")
        spring = {"mode": "spring", "k": 40.0, "xc": 0.16}
        rubber = {"mode": "rubber", "k": 40.0, "xc": 0.16}
        x = 0.25

        for p, name in ((spring, "spring"), (rubber, "rubber band")):
            sim = pg.evaluate("([x,p]) => window.SIM._stretchTo(x,p)", [x, p])
            mine = work_to(x, p)
            check(f"the {name}'s running total and an independent sum of F·dx agree",
                  rel(sim, mine) < 1e-12, f"{sim:.9f} J against {mine:.9f} J")

        wS = pg.evaluate("([x,p]) => window.SIM._stretchTo(x,p)", [x, spring])
        check("for a spring the work the hand did comes out as ½kx², which is written "
              "nowhere in the simulation",
              rel(wS, 0.5 * spring["k"] * x * x) < 1e-9,
              f'{wS:.8f} J against ½kx² = {0.5 * spring["k"] * x * x:.8f} J')

        F = force(x, spring)
        check("and it is also exactly half of force × extension, because the graph is a "
              "straight line and the area under it is a triangle",
              rel(wS, 0.5 * F * x) < 1e-9, f"{wS:.8f} J against ½Fx = {0.5 * F * x:.8f} J")

        wR = pg.evaluate("([x,p]) => window.SIM._stretchTo(x,p)", [x, rubber])
        FR = force(x, rubber)
        tri = 0.5 * FR * x
        over = (tri - wR) / wR
        check("for the rubber band that triangle is simply the wrong answer, and it is too "
              "big, because the curve bends up away from the chord",
              over > 0.2,
              f"½Fx = {tri:.5f} J against the real {wR:.5f} J, over by {over * 100:.1f} %")

        area = pg.evaluate("([x,p,n]) => window.SIM._area(x,p,n)", [x, rubber, 4000])
        check("the running total matches the area under the curve the graph actually draws, "
              "measured off the drawn samples rather than assumed",
              rel(wR, area) < 1e-6, f"{wR:.8f} J against an area of {area:.8f} J")

        e1 = abs(pg.evaluate("([x,p,n]) => window.SIM._stretchTo(x,p,n)", [x, rubber, 250]) - wR)
        e2 = abs(pg.evaluate("([x,p,n]) => window.SIM._stretchTo(x,p,n)", [x, rubber, 500]) - wR)
        e3 = abs(pg.evaluate("([x,p,n]) => window.SIM._stretchTo(x,p,n)", [x, rubber, 1000]) - wR)
        o1, o2 = math.log(e1 / e2, 2), math.log(e2 / e3, 2)
        check("halving the step shrinks the error fourfold: taking the force at the middle "
              "of each step is second order, as it should be",
              1.8 < o1 < 2.2 and 1.8 < o2 < 2.2,
              f"errors {e1:.2e}, {e2:.2e}, {e3:.2e}; order {o1:.2f}, {o2:.2f}")

        back = pg.evaluate("([a,b,p]) => window.SIM._outAndBack(a,b,p)", [x, 0.0, rubber])
        check("pull it out and let it all the way back and the hand has done no net work at "
              "all: on the way in the force points against the motion",
              abs(back) < 1e-12, f"{back:.3e} J over the round trip")

        half = pg.evaluate("([a,b,p]) => window.SIM._outAndBack(a,b,p)", [x, 0.12, rubber])
        direct = pg.evaluate("([x,p]) => window.SIM._stretchTo(x,p)", [0.12, rubber])
        check("and going out past a point and coming back to it leaves the same total as "
              "going straight there — the stored energy depends on where it is, not how it got there",
              rel(half, direct) < 2e-7,
              f"{half:.8f} J against {direct:.8f} J, apart only by what two runs of a "
              f"second-order sum leave behind")

        w1 = pg.evaluate("([x,p]) => window.SIM._stretchTo(x,p)", [0.1, spring])
        w2 = pg.evaluate("([x,p]) => window.SIM._stretchTo(x,p)", [0.2, spring])
        check("twice the extension on a spring costs four times the work, which falls out of "
              "the area and was never stated",
              rel(w2, 4 * w1) < 1e-9, f"{w2:.8f} J against 4 × {w1:.8f} J")

        # ============================================================== pulling
        print("\nBENCH 2 — PULLING AT AN ANGLE")
        p = {"F": 22.0, "th": 25.0, "mu": 0.35, "m": 6.0}
        sim = pg.evaluate("([p,s,h]) => window.SIM._pullRun(p,s,h)", [p, 3.0, h])
        mine = pull_run(p, 3.0, h)
        check("the simulation's drag and an independent integration of F = ma agree, work "
              "totals and all",
              rel(sim["s"], mine["s"]) < 1e-9 and rel(sim["wPull"], mine["wPull"]) < 1e-9,
              f'{sim["s"]:.9f} m and {sim["wPull"]:.6f} J')

        check("the work the pull did is F s cos θ — accumulated as F·ds, never computed "
              "that way",
              rel(sim["wPull"], p["F"] * sim["s"] * math.cos(p["th"] * DEG)) < 1e-9,
              f'{sim["wPull"]:.6f} J against {p["F"] * sim["s"] * math.cos(p["th"] * DEG):.6f} J')

        books = sim["wPull"] - sim["wFric"] - sim["ke"]
        check("and the books close: what the pull put in, less what the friction took, is "
              "the kinetic energy — the work–energy theorem, recovered",
              abs(books) / sim["wPull"] < 1e-9,
              f'in {sim["wPull"]:.6f} J, out {sim["wFric"] + sim["ke"]:.6f} J')

        up = pg.evaluate("([p,s,h]) => window.SIM._pullRun(p,s,h)", [dict(p, th=90.0), 3.0, h])
        check("hold the rope straight up and the pull does no work at all, however long you "
              "hold it — which is why carrying a bag across a room does none either",
              up["wPull"] == 0 and up["s"] == 0,
              f'{up["wPull"]:.1f} J over {up["s"]:.1f} m')

        q = pg.evaluate("p => window.SIM._floorForces(p)", p)
        along, lift, N, fric = floor_forces(p)
        check("lifting the rope takes weight off the floor, so the floor presses back less "
              "and rubs back less",
              rel(q["N"], N) < 1e-12 and rel(q["fric"], fric) < 1e-12 and N < p["m"] * G,
              f'N {q["N"]:.4f} N against mg = {p["m"] * G:.4f} N, friction {q["fric"]:.4f} N')

        lifted = pg.evaluate("p => window.SIM._floorForces(p)", dict(p, F=70.0, th=80.0))
        check("pull hard enough and upward enough and the block comes off the floor "
              "altogether, with nothing left to rub",
              lifted["N"] == 0 and lifted["fric"] == 0 and lifted["lifted"],
              "N and friction both zero")

        worst = 0.0
        shown = []
        for mu in (0.1, 0.25, 0.35, 0.6, 0.9):
            best = pg.evaluate("p => window.SIM._easiestAngle(p)", dict(p, mu=mu))
            worst = max(worst, rel(math.tan(best["angle"] * DEG), mu))
            shown.append(f"{mu:.2f}→{best['angle']:.2f}°")
        check("the rope angle that needs the least pull of all, found by sweeping and "
              "closing in, has tan θ = μ — never written down anywhere",
              worst < 1e-6, "  ".join(shown))

        angles = [pg.evaluate("p => window.SIM._easiestAngle(p)", dict(p, m=mm))["angle"]
                  for mm in (1.5, 6.0, 20.0)]
        check("and that angle does not depend on the mass: it is a property of the surfaces "
              "and nothing else",
              max(angles) - min(angles) < 1e-4,
              f"{min(angles):.6f}° to {max(angles):.6f}° from 1.5 to 20 kg")

        best = pg.evaluate("p => window.SIM._easiestAngle(p)", p)
        lo = pg.evaluate("([th,p]) => window.SIM._steadyPull(th,p)", [best["angle"] - 2, p])
        hi = pg.evaluate("([th,p]) => window.SIM._steadyPull(th,p)", [best["angle"] + 2, p])
        check("it really is the least: two degrees either side of it both need more",
              lo > best["pull"] and hi > best["pull"],
              f'{best["pull"]:.5f} N there, {lo:.5f} N and {hi:.5f} N beside it')

        wBest = pg.evaluate("([th,p,s]) => window.SIM._workToDrag(th,p,s)",
                            [best["angle"], p, S_MAX])
        wSteep = pg.evaluate("([th,p,s]) => window.SIM._workToDrag(th,p,s)",
                             [best["angle"] + 25, p, S_MAX])
        check("but the work is a different question, and it keeps falling past that angle — "
              "the simulation does not pretend the two minima are the same",
              wSteep < wBest,
              f'{wBest:.3f} J at the easiest angle, {wSteep:.3f} J twenty-five degrees past it')

        dry = pg.evaluate("p => window.SIM._easiestAngle(p)", dict(p, mu=0.0))
        check("take the friction away and there is nothing to be gained by lifting, so the "
              "best angle is flat along the floor — the control on the test above",
              dry["angle"] < 1e-6, f'{dry["angle"]:.6f}°')

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
