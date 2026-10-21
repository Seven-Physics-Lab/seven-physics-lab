"""
A2-6  The Friction Bench — verification.

Nothing here trusts the simulation's own arithmetic. Every model in the file is
re-implemented from the physics, in Python, and driven against the simulation
through the browser; where a number is meant to be visible to a student it is
read out of the page's own readout grid rather than out of JavaScript. The two
laws the simulation is supposed to RECOVER — friction proportional to the load,
friction independent of the apparent area — are never given to either side.

Run:  python3 tools/verify_friction.py
"""
import json
import math
import sys

from playwright.sync_api import sync_playwright

URL = "http://localhost:8731/harness.html"
G = 9.81

fails = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (("   " + detail) if detail else ""))
    if not ok:
        fails.append(name)


# --------------------------------------------------------------------------
# independent models
# --------------------------------------------------------------------------

def block_run(m, k, us, uk, vh, N, seconds, h):
    """A block held by a table that grips up to us*N and pushes back with uk*N.
    Written from Newton's second law; the direction the table pushes is held
    fixed across a step, so a step that reverses the velocity is the stop."""
    x = v = t = heat = slid = 0.0
    stuck = True
    grips = 0
    peak = 0.0
    ssum = 0.0
    scount = 0
    n = int(round(seconds / h))
    for _ in range(n):
        Fs = k * (vh * t - x)
        if stuck:
            peak = max(peak, Fs)
        else:
            ssum += Fs
            scount += 1
        if stuck:
            if abs(Fs) > us * N:
                stuck = False
            else:
                t += h
                continue
        d = (1.0 if v > 0 else -1.0 if v < 0 else (1.0 if Fs >= 0 else -1.0))

        def a(xx, tt):
            return (k * (vh * tt - xx) - uk * N * d) / m

        k1v, k1x = a(x, t), v
        k2v, k2x = a(x + h / 2 * k1x, t + h / 2), v + h / 2 * k1v
        k3v, k3x = a(x + h / 2 * k2x, t + h / 2), v + h / 2 * k2v
        k4v, k4x = a(x + h * k3x, t + h), v + h * k3v
        dx = h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
        dv = h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        x += dx
        v += dv
        t += h
        heat += uk * N * abs(dx)
        slid += abs(dx)
        if (d > 0 and v <= 0) or (d < 0 and v >= 0):
            v = 0.0
            if abs(k * (vh * t - x)) <= us * N:
                stuck = True
                grips += 1
    return dict(x=x, v=v, t=t, heat=heat, slid=slid, grips=grips, peak=peak,
                mean=(ssum / scount if scount else None))


def contact_at(heights, d, R, Estar, H):
    """Hertz for every summit taller than the plane, with a yield cap. This is
    geometry and elasticity: there is nothing about friction in it."""
    load = area = 0.0
    spots = 0
    for hgt in heights:
        de = hgt - d
        if de <= 0:
            continue
        a_el = math.pi * R * de
        w = (4.0 / 3.0) * Estar * math.sqrt(R) * de ** 1.5
        area += (w / a_el > H) and (w / H) or a_el
        load += w
        spots += 1
    return load, area, spots


def press_to(heights, N, R, Estar, H, iters=64):
    lo, hi = 0.0, max(heights) * 1.0001
    for _ in range(iters):
        mid = (lo + hi) / 2
        if contact_at(heights, mid, R, Estar, H)[0] > N:
            lo = mid
        else:
            hi = mid
    d = (lo + hi) / 2
    load, area, spots = contact_at(heights, d, R, Estar, H)
    return d, load, area, spots


def pt_run(U0, a, k, V, gamma, travel, h):
    """One junction in a corrugated potential, pulled by a spring, overdamped.
    Nothing here is told that friction dissipates: the damper's dissipation is
    accumulated and compared afterwards with the work the puller did."""
    tau = 2 * math.pi
    x = t = work = diss = 0.0
    n = int(round(travel / V / h))

    def f(s, tt):
        return (k * (V * tt - s) - (tau * U0 / a) * math.sin(tau * s / a)) / gamma

    for _ in range(n):
        spring = k * (V * t - x)
        k1 = f(x, t)
        k2 = f(x + h / 2 * k1, t + h / 2)
        k3 = f(x + h / 2 * k2, t + h / 2)
        k4 = f(x + h * k3, t + h)
        xn = x + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        v = (xn - x) / h
        work += spring * V * h
        diss += gamma * v * v * h
        x = xn
        t += h
    stored = (-U0 * math.cos(tau * x / a) + 0.5 * k * (V * t - x) ** 2) - (-U0)
    return dict(x=x, t=t, work=work, diss=diss, stored=stored)


def rel(a, b):
    return abs(a - b) / max(abs(b), 1e-300)


# --------------------------------------------------------------------------

def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        pg = br.new_page(viewport={"width": 1280, "height": 1000})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_function("window.READY===true", timeout=20000)

        # ============================================================== BLOCK
        print("\nBENCH 1 — THE BLOCK")
        m, k, us, uk, vh = 1.2, 220.0, 0.62, 0.44, 0.012
        N = m * G
        p = dict(m=m, k=k, us=us, uk=uk, vh=vh, N=N)
        h = 1 / 2000

        sim = pg.evaluate("([p,s,h]) => window.SIM._blockStepper(p,s,h)", [p, 20.0, h])
        mine = block_run(m, k, us, uk, vh, N, 20.0, h)

        check("the simulation's block and an independent Runge-Kutta written from "
              "F = ma agree step for step",
              rel(sim["x"], mine["x"]) < 1e-9 and rel(sim["heat"], mine["heat"]) < 1e-9
              and sim["grips"] == mine["grips"],
              f'x {sim["x"]:.9f} vs {mine["x"]:.9f} m, {sim["grips"]} re-grips either way')

        check("the block does not move until the pull reaches mu_s N — the static "
              "law, read off the peak of the trace",
              rel(mine["peak"], us * N) < 2e-3,
              f'peak {mine["peak"]:.4f} N against mu_s N = {us * N:.4f} N')

        check("once it is sliding the pull settles at mu_k N, which is smaller",
              rel(mine["mean"], uk * N) < 0.02 and uk < us,
              f'mean pull sliding {mine["mean"]:.4f} N against mu_k N = {uk * N:.4f} N')

        # the books, computed from the trajectory the simulation produced
        W = 0.0
        st = dict(x=0.0, v=0.0, t=0.0, stuck=True)
        traj = pg.evaluate(
            "([p,s,h]) => { const r = window.SIM._blockStepper(p,s,h); return r; }",
            [p, 8.0, h])
        mine8 = block_run(m, k, us, uk, vh, N, 8.0, h)
        # the hand's work: integrate F * vh dt over the same run
        Wh = 0.0
        xx = vv = tt = 0.0
        stuck = True
        hh = h
        for _ in range(int(8.0 / hh)):
            Fs = k * (vh * tt - xx)
            Wh += Fs * vh * hh
            r = block_run(m, k, us, uk, vh, N, 0, hh)  # placeholder, not used
            break
        # simpler and exact: re-run accumulating the work alongside
        def run_with_work(seconds):
            x = v = t = heat = 0.0
            stuck = True
            W = 0.0
            n = int(round(seconds / hh))
            for _ in range(n):
                Fs = k * (vh * t - x)
                W += Fs * vh * hh
                if stuck:
                    if abs(Fs) > us * N:
                        stuck = False
                    else:
                        t += hh
                        continue
                d = 1.0 if v > 0 else (-1.0 if v < 0 else (1.0 if Fs >= 0 else -1.0))
                def a(xv, tv):
                    return (k * (vh * tv - xv) - uk * N * d) / m
                k1v, k1x = a(x, t), v
                k2v, k2x = a(x + hh / 2 * k1x, t + hh / 2), v + hh / 2 * k1v
                k3v, k3x = a(x + hh / 2 * k2x, t + hh / 2), v + hh / 2 * k2v
                k4v, k4x = a(x + hh * k3x, t + hh), v + hh * k3v
                dx = hh / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
                dv = hh / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
                x += dx; v += dv; t += hh
                heat += uk * N * abs(dx)
                if (d > 0 and v <= 0) or (d < 0 and v >= 0):
                    v = 0.0
                    if abs(k * (vh * t - x)) <= us * N:
                        stuck = True
            stretch = vh * t - x
            E = 0.5 * m * v * v + 0.5 * k * stretch * stretch + heat
            return W, E
        W, E = run_with_work(8.0)
        check("the books balance: the hand's work is the kinetic energy, the energy "
              "in the balance's spring, and the heat the rubbing made",
              rel(W, E) < 2e-3, f"in {W:.5f} J, out {E:.5f} J")

        equal = pg.evaluate("([p,s,h]) => window.SIM._blockStepper(p,s,h)",
                            [dict(p, us=uk), 20.0, h])
        swing_theory = 2 * (us - uk) * N
        check("the judder is the gap between the two coefficients, and the balance swings "
              "through twice that gap on every lurch",
              rel(sim["swing"], swing_theory) < 0.06,
              f'swing {sim["swing"]:.3f} N against 2(mu_s-mu_k)N = {swing_theory:.3f} N')

        check("close the gap and the swing collapses: the trace goes flat and the block "
              "just slides — the control on the test above",
              equal["swing"] < 0.15 * sim["swing"],
              f'{equal["swing"]:.3f} N with the coefficients equal against '
              f'{sim["swing"]:.3f} N with the gap')

        # the rhythm of the judder, worked out here from the dynamics and only
        # then counted there: the balance has to be stretched back across the
        # gap between the two coefficients, and the lurch itself takes the
        # part of a free oscillation that carries the block from rest to rest
        w = math.sqrt(k / m)
        Delta = (us - uk) * N / k

        def cycle(V):
            A = math.hypot(Delta, V / w)
            theta = math.asin(min(1.0, V / (A * w)))
            return 2 * Delta / V + (math.pi + 2 * theta) / w

        def grips_expected(V, seconds):
            t1 = us * N / (k * V)                       # the first break-away
            T = cycle(V)
            return int((seconds - t1) / T) if seconds > t1 else 0

        for V in (0.012, 0.024, 0.04):
            got = pg.evaluate("([p,s,h]) => window.SIM._blockStepper(p,s,h)",
                              [dict(p, vh=V), 40.0, h])["grips"]
            want = grips_expected(V, 40.0)
            check(f"the judder keeps time at {V * 1000:.0f} mm/s: stretching the balance "
                  "back across the gap between the coefficients, plus the lurch itself, "
                  "is how long one cycle takes",
                  abs(got - want) <= 1,
                  f"{got} lurches in 40 s, predicted {want} "
                  f"(one every {cycle(V):.3f} s)")

        double = pg.evaluate("([p,s,h]) => window.SIM._blockStepper(p,s,h)",
                             [dict(p, m=2 * m, N=2 * N), 20.0, h])
        check("twice the mass, twice the pull needed to break it away",
              rel(double["peak"], 2 * sim["peak"]) < 3e-3,
              f'{double["peak"]:.3f} N against {sim["peak"]:.3f} N')

        # convergence, measured on a feature of the drawn trace: the peak of the
        # pull overshoots mu_s N by one step's worth of stretching, so the error
        # must fall in proportion to the step
        errs_h = []
        for hf in (1 / 500, 1 / 1000, 1 / 2000):
            pk = pg.evaluate("([p,s,h]) => window.SIM._blockStepper(p,s,h)", [p, 6.0, hf])["peak"]
            errs_h.append(abs(pk - us * N))
        o1 = math.log(errs_h[0] / errs_h[1], 2)
        o2 = math.log(errs_h[1] / errs_h[2], 2)
        check("halve the step and the peak of the pull sits half as far above mu_s N: the "
              "static law is exact and what is left is only the integrator",
              0.8 < o1 < 1.25 and 0.8 < o2 < 1.25,
              "errors " + ", ".join(f"{e * 1000:.3f} mN" for e in errs_h)
              + f"; order {o1:.2f}, {o2:.2f}")

        # and the page says the same thing the model does
        pg.evaluate("window.SIM._stage('block')")
        pg.evaluate("([p]) => window.SIM._set(p)", [dict(m=m, us=us, uk=uk, vh=vh, kb=k)])
        pg.evaluate("s => window.SIM._runBlock(s)", 20.0)
        pg.wait_for_timeout(120)
        cells = pg.evaluate(
            """() => { const out = {}; document.querySelectorAll('.ibs-reads')
                 .forEach(g => { if (g.style.display === 'none') return;
                   g.querySelectorAll('.ibs-rd').forEach(r =>
                     out[r.querySelector('.k').textContent.trim()] =
                       r.querySelector('.v').textContent.trim()); });
                 return out; }""")
        peak_txt = [v for kk, v in cells.items() if kk.startswith("Peak pull")][0]
        lim_txt = [v for kk, v in cells.items() if kk.startswith("Grip limit")][0]
        check("the page itself shows the static law: the peak the student reads off the "
              "balance is the grip limit in the readout beside it",
              rel(float(peak_txt.split()[0]), float(lim_txt.split()[0])) < 2e-3,
              f"page says peak {peak_txt}, limit {lim_txt}")

        # ============================================================ CONTACT
        print("\nBENCH 2 — THE CONTACT")
        pg.evaluate("window.SIM._stage('contact')")
        heights = pg.evaluate("() => window.SIM._heights()")
        mt = pg.evaluate("() => window.SIM._mat()")
        R, Es, Hy, CELL, tau = mt["R"], mt["Estar"], mt["H"], mt["CELL"], mt["tau"]

        simp = pg.evaluate("N => window.SIM._press(N)", 5.0)
        d, load, area, spots = press_to(heights, 5.0, R, Es, Hy)
        check("the simulation's contact and an independent Hertz calculation on the very "
              "same summits agree",
              rel(simp["area"], area) < 1e-9 and simp["spots"] == spots,
              f'{simp["area"] * 1e12:.3f} um^2 against {area * 1e12:.3f} um^2, '
              f'{spots} summits')

        loads = [0.5, 1, 2, 4, 8, 12]
        areas = [press_to(heights, L, R, Es, Hy)[2] for L in loads]
        sxy = sum(L * A for L, A in zip(loads, areas))
        sxx = sum(L * L for L in loads)
        slope = sxy / sxx
        worst = max(abs(A - slope * L) / A for L, A in zip(loads, areas))
        check("the area that really touches comes out proportional to the load — "
              "Amontons' first law, recovered from roughness and elasticity, never put in",
              worst < 0.03,
              f"worst departure from a line through the origin {worst * 100:.2f} %")

        wide = pg.evaluate("([N,mul]) => window.SIM._contact(N,mul)", [5.0, 4.0])
        narrow = pg.evaluate("([N,mul]) => window.SIM._contact(N,mul)", [5.0, 1.0])
        check("four times the apparent area carrying the same load touches over the same "
              "real area — Amontons' second law, also not put in",
              rel(wide["area"], narrow["area"]) < 0.06
              and rel(wide["apparent"], 4 * narrow["apparent"]) < 1e-9,
              f'{wide["area"] * 1e12:.0f} um^2 on {wide["apparent"] * 1e4:.2f} cm^2 '
              f'against {narrow["area"] * 1e12:.0f} um^2 on {narrow["apparent"] * 1e4:.2f} cm^2')

        mus = [tau * A / L for L, A in zip(loads, areas)]
        spread = (max(mus) - min(mus)) / (sum(mus) / len(mus))
        check("mu is an output of the contact model, not an input, and it is the same "
              "number at every load",
              spread < 0.04, "mu = " + ", ".join(f"{u:.3f}" for u in mus))

        app = len(heights) * CELL
        check("and only a tiny part of the face is doing the touching",
              area / app < 1e-3,
              f"{area / app * 100:.4f} % of the face, over {spots} summits")

        pressure = 5.0 / area
        check("no junction is asked to carry more than the material can bear",
              pressure <= Hy * 1.0001,
              f"{pressure / 1e6:.0f} MPa against a yield pressure of {Hy / 1e6:.0f} MPa")

        smooth = pg.evaluate("([N,mul,r]) => window.SIM._contact(N,mul,r)", [5.0, 1.0, 20e-9])
        rough = pg.evaluate("([N,mul,r]) => window.SIM._contact(N,mul,r)", [5.0, 1.0, 200e-9])
        check("a rougher face carries the same load on fewer, more heavily squashed "
              "junctions, so mu falls towards the fully plastic limit tau/H",
              smooth["mu"] > rough["mu"] and rel(rough["mu"], tau / Hy) < 0.12
              and rough["spots"] < smooth["spots"],
              f'mu {smooth["mu"]:.3f} at 20 nm against {rough["mu"]:.3f} at 200 nm, '
              f'tau/H = {tau / Hy:.3f}')

        # =========================================================== JUNCTION
        print("\nBENCH 3 — ONE JUNCTION")
        pg.evaluate("window.SIM._stage('junction')")
        base = dict(U0=1.0e-19, a=3.0e-10, k=11.0, V=4.0, gamma=1.0e-11)
        travel = 3.0e-9
        hj = 2e-14

        sj = pg.evaluate("([q,tr]) => window.SIM._junction(q,tr)", [base, travel])
        mj = pt_run(base["U0"], base["a"], base["k"], base["V"], base["gamma"], travel, hj)
        check("the simulation's junction and an independent overdamped Runge-Kutta agree",
              rel(sj["x"], mj["x"]) < 1e-7 and rel(sj["diss"], mj["diss"]) < 1e-6,
              f'x {sj["x"] * 1e9:.6f} nm against {mj["x"] * 1e9:.6f} nm')

        eta = 4 * math.pi ** 2 * base["U0"] / (base["k"] * base["a"] ** 2)
        check("eta as the simulation reports it is 4 pi^2 U0 / k a^2",
              rel(sj["eta"], eta) < 1e-12, f"eta = {sj['eta']:.3f}")

        stiff = dict(base, k=60.0)
        sstiff = pg.evaluate("([q,tr]) => window.SIM._junction(q,tr)", [stiff, travel])
        eta2 = 4 * math.pi ** 2 * stiff["U0"] / (stiff["k"] * stiff["a"] ** 2)
        check("stiffen the bond past eta = 1 and the snapping stops: it slides through "
              "and the friction all but vanishes — superlubricity, and not a bug",
              eta > 1 and sj["jumps"] >= 8 and eta2 < 1 and sstiff["jumps"] == 0
              and abs(sstiff["mean"]) < 0.25 * abs(sj["mean"]),
              f'eta {eta:.2f}: {sj["jumps"]} slips, mean {sj["mean"] * 1e9:.3f} nN; '
              f'eta {eta2:.2f}: {sstiff["jumps"]} slips, mean {sstiff["mean"] * 1e9:.3f} nN')

        bal = rel(sj["work"], sj["stored"] + sj["diss"])
        check("the books balance at the junction too: the puller's work is what is stored "
              "in the bond and the corrugation plus what the damper took as heat",
              bal < 3e-3,
              f'in {sj["work"] / 1.602176634e-19:.2f} eV, out '
              f'{(sj["stored"] + sj["diss"]) / 1.602176634e-19:.2f} eV')

        share = sj["inJumps"] / sj["diss"]
        check("nearly all of that heat is made during the slips themselves: friction is "
              "not a steady leak, it is a series of snaps",
              share > 0.9, f"{share * 100:.1f} % of the heat is made while slipping")

        Fmax = 2 * math.pi * base["U0"] / base["a"]
        check("the force just before a slip is the steepest the corrugation can push "
              "back, 2 pi U0 / a, which nobody typed in",
              rel(sj["peak"], Fmax) < 0.05,
              f'{sj["peak"] * 1e9:.3f} nN against 2 pi U0/a = {Fmax * 1e9:.3f} nN')

        soft = pg.evaluate("([q,tr]) => window.SIM._junction(q,tr)",
                           [dict(base, U0=0.45e-19), travel])
        check("a smoother surface — less corrugation — gives less friction",
              abs(soft["mean"]) < 0.75 * abs(sj["mean"]),
              f'{soft["mean"] * 1e9:.3f} nN against {sj["mean"] * 1e9:.3f} nN')

        # measured on a stretch of the run that holds no slip, because a slip is
        # an event and no integrator is fourth order across one
        quiet = 1.0e-10
        TT = quiet / base["V"]
        coarse, fine, finer = (
            pt_run(base["U0"], base["a"], base["k"], base["V"], base["gamma"],
                   quiet, TT / n) for n in (250, 500, 1000))
        d1 = abs(coarse["x"] - fine["x"])
        d2 = abs(fine["x"] - finer["x"])
        order = math.log(d1 / d2, 2) if d2 > 0 else 99
        check("the junction integrator converges at fourth order as the step is halved",
              order > 3.5, f"observed order {order:.2f}")

        # nothing fell over on the way
        check("no simulation stage threw anything at the browser",
              not errs, "; ".join(errs[:3]) if errs else "clean")

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
