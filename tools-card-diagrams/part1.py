"""Card pictures: mechanics, oscillations and waves."""
import math
from kit import *   # noqa

D = {}


def card(slug):
    def wrap(f):
        D[slug] = f
        return f
    return wrap


# ---------------------------------------------------------------- A.1 graphs
@card('motion-graphs')
def motion_graphs():
    o = []
    # the object above, with its velocity arrow
    o.append(rect(96, 44, 54, 34, WASH, TEAL, 2.2, r=8))
    o.append(dot(123, 61, 4, TEAL))
    o.append(arrow(162, 61, 236, 61, TEAL, 2.4))
    o.append(txt(200, 44, 'v', 15, TEAL, italic=True))
    o.append(ln(84, 88, 676, 88, LINE, 2))

    panels = [(70, 's', lambda u: u * u), (300, 'v', lambda u: u), (530, 'a', lambda u: 1.0)]
    for px, name, f in panels:
        w_, h_ = 160, 140
        py = 130
        o.append(rect(px - 22, py - 24, w_ + 46, h_ + 44, MIST, LINE, 1.6, r=12))
        o.append(plot_frame(px, py, w_, h_, GREY, 't', name, TEAL, 15))
        pts = []
        for i in range(101):
            u = i / 100
            pts.append((px + u * w_, py + h_ - 0.92 * h_ * f(u)))
        o.append(curve(pts, TEAL, 3))
    return ''.join(o)


# ------------------------------------------------------------ A.1 projectile
@card('projectile-launcher')
def projectile():
    o = []
    gy, x0, y0 = 292, 92, 286
    o.append(ln(46, gy, 716, gy, INK, 2.4))
    for i in range(24):
        x = 50 + i * 28
        o.append(ln(x, gy, x - 9, gy + 10, GREY, 1.3))

    ang, g = math.radians(50), 300.0
    v = math.sqrt(560 * g / math.sin(2 * ang))

    def fly(k):
        vx, vy = v * math.cos(ang), v * math.sin(ang)
        x, y, dt, pts = x0, y0, 0.0012, [(x0, y0)]
        while True:
            sp = math.hypot(vx, vy)
            vx += -k * sp * vx * dt
            vy += (-g - k * sp * vy) * dt
            x += vx * dt; y -= vy * dt
            if y > y0:
                break
            pts.append((x, y))
        return pts

    vac = fly(0.0)
    lo, hi = 0.0, 0.05
    for _ in range(40):            # the drag path, tuned to land at two thirds of the range
        mid = (lo + hi) / 2
        if fly(mid)[-1][0] > x0 + 0.68 * (vac[-1][0] - x0):
            lo = mid
        else:
            hi = mid
    drag = fly((lo + hi) / 2)
    o.append(curve(vac, GREY, 2, dash='7 6'))
    o.append(curve(drag, TEAL, 3.4))
    o.append(dot(drag[len(drag) // 2][0], drag[len(drag) // 2][1], 6, TEAL))
    o.append(txt(vac[-1][0] - 6, y0 - 36, 'no drag', 13, GREY, anchor='end', weight=600))

    # the launcher and the launch velocity
    o.append(f'<g transform="translate({x0},{y0}) rotate({-math.degrees(ang)})">'
             + rect(-14, -13, 62, 26, TEAL, DEEP, 2, r=6) + '</g>')
    o.append(circ(x0, y0, 13, '#fff', DEEP, 2.4))
    o.append(arrow(x0, y0, x0 + 96 * math.cos(ang), y0 - 96 * math.sin(ang), DEEP, 2.6, head='D'))
    o.append(arc(x0, y0, 52, 0, math.degrees(ang), GREY, 1.6))
    o.append(txt(x0 + 64, y0 - 20, '&#952;', 16, GREY, italic=True))
    o.append(txt(x0 + 96 * math.cos(ang) - 22, y0 - 96 * math.sin(ang) - 8, 'u', 16, DEEP, italic=True))
    return ''.join(o)


# ------------------------------------------------------------ A.2 collisions
@card('collisions')
def collisions():
    o = []
    o.append(ln(380, 44, 380, 296, LINE, 2, dash='6 7'))
    o.append(txt(196, 40, 'before', 13, GREY, weight=700, ls='1.4'))
    o.append(txt(566, 40, 'after', 13, GREY, weight=700, ls='1.4'))

    for cy in (128, 236):
        o.append(ln(58, cy + 46, 344, cy + 46, LINE, 2))
        o.append(ln(416, cy + 46, 702, cy + 46, LINE, 2))

    # before: a fast light ball into a slow heavy one
    o.append(circ(150, 128, 26, WASH, TEAL, 2.6)); o.append(txt(150, 134, 'm', 15, TEAL, italic=True))
    o.append(arrow(184, 128, 250, 128, TEAL, 2.6))
    o.append(circ(300, 128, 38, '#fff', DEEP, 2.6)); o.append(txt(300, 135, 'M', 16, DEEP, italic=True))
    # after: the light one bounces back, the heavy one moves off
    o.append(circ(470, 128, 26, WASH, TEAL, 2.6)); o.append(txt(470, 134, 'm', 15, TEAL, italic=True))
    o.append(arrow(436, 128, 412, 128, TEAL, 2.6))
    o.append(circ(600, 128, 38, '#fff', DEEP, 2.6)); o.append(txt(600, 135, 'M', 16, DEEP, italic=True))
    o.append(arrow(646, 128, 692, 128, DEEP, 2.6, head='D'))

    # underneath, the contact force against time: two equal and opposite pushes
    px, py, pw, ph = 150, 250, 250, 44
    o.append(arrow(px - 16, py, px + pw + 16, py, GREY, 1.6, head='G'))
    o.append(arrow(px, py + ph + 10, px, py - ph - 10, GREY, 1.6, head='G'))
    o.append(txt(px + pw + 24, py + 5, 't', 13, GREY, anchor='start', italic=True))
    o.append(txt(px - 10, py - ph - 8, 'F', 13, GREY, anchor='end', italic=True))
    top = [(px + 30 + 180 * i / 100, py - ph * math.sin(math.pi * i / 100) ** 2) for i in range(101)]
    o.append(curve(top + [(px + 210, py), (px + 30, py)], TEAL, 2.6, fill=TEAL, op=.9, close=True))
    bot = [(x, 2 * py - y) for x, y in top]
    o.append(curve(bot + [(px + 210, py), (px + 30, py)], DEEP, 2.4, fill='#fff', close=True))
    o.append(txt(px + 300, py - 16, 'equal and opposite,', 13, GREY, anchor='start', weight=600))
    o.append(txt(px + 300, py + 4, 'for exactly as long', 13, GREY, anchor='start', weight=600))
    return ''.join(o)


# ------------------------------------------------------------ A.3 skate park
@card('skate-park')
def skate_park():
    o = []

    def ty(x):
        t = (x - 300) / 230.0
        return 262 - 130 * t * t - 30 * math.exp(-((x - 470) / 38) ** 2)

    pts = [(x, ty(x)) for x in range(64, 529, 4)]
    o.append(curve(pts + [(528, 296), (64, 296)], WASH, 0, fill=WASH, close=True, op=0.75))
    o.append(curve(pts, TEAL, 3.4))
    o.append(ln(52, 296, 536, 296, LINE, 2))

    sx = 168
    sy = ty(sx)
    slope = math.atan2(ty(sx + 2) - ty(sx - 2), 4)
    o.append(f'<g transform="translate({n(sx)},{n(sy)}) rotate({n(math.degrees(slope))})">'
             + circ(0, -22, 13, '#fff', DEEP, 2.4) + ln(0, -9, 0, 4, DEEP, 2.4)
             + ln(0, 0, -11, -6, DEEP, 2.2) + ln(0, 0, 11, -6, DEEP, 2.2)
             + ln(-13, 4, 13, 4, DEEP, 3) + circ(-8, 8, 4, '#fff', DEEP, 1.8)
             + circ(8, 8, 4, '#fff', DEEP, 1.8) + '</g>')

    # the three energy bars, with the total as a fixed dashed line
    bx, base, top = 592, 286, 86
    o.append(ln(bx - 10, top, bx + 136, top, DEEP, 2, dash='7 6'))
    o.append(txt(bx + 62, top - 12, 'total', 13, DEEP, weight=700))
    for i, (h, c, lab) in enumerate([(122, TEAL, 'K'), (78, SOFT, 'P'), (200, DEEP, 'K+P')]):
        x = bx + i * 44
        o.append(rect(x, base - 200, 30, 200, MIST, LINE, 1.4, r=5))
        o.append(rect(x, base - h, 30, h, c, None, 0, r=5))
        o.append(txt(x + 15, base + 18, lab, 13, GREY, weight=700))
    return ''.join(o)


# ----------------------------------------------------------- C.1 mass-spring
@card('mass-on-a-spring')
def mass_spring():
    o = []
    cx = 226
    o.append(hatch(cx - 68, 52, 136, TEAL, 11, 11))
    o.append(curve(spring(cx, 52, cx, 166, coils=7, amp=17), TEAL, 2.6))
    o.append(rect(cx - 46, 166, 92, 62, WASH, TEAL, 2.8, r=9))
    o.append(txt(cx, 204, 'm', 17, TEAL, italic=True))
    o.append(ln(cx - 96, 150, cx + 96, 150, GREY, 1.6, dash='7 6'))
    o.append(txt(cx + 104, 155, '0', 14, GREY, anchor='start'))
    o.append(barbell(cx + 74, 150, cx + 74, 197))
    o.append(txt(cx + 88, 180, 'x', 15, GREY, anchor='start', italic=True))
    o.append(arrow(cx, 240, cx, 288, DEEP, 2.6, head='D'))
    o.append(txt(cx + 14, 274, 'a', 15, DEEP, anchor='start', italic=True))

    # a against x: one straight line through the origin, and that is SHM
    ox, oy, s = 560, 176, 104
    o.append(rect(ox - 148, oy - 122, 296, 244, MIST, LINE, 1.6, r=12))
    o.append(arrow(ox, oy + s + 8, ox, oy - s - 8, GREY, 1.8, head='G'))
    o.append(arrow(ox - s - 8, oy, ox + s + 8, oy, GREY, 1.8, head='G'))
    o.append(txt(ox + 12, oy - s - 6, 'a', 15, GREY, anchor='start', italic=True))
    o.append(txt(ox + s + 4, oy + 22, 'x', 15, GREY, anchor='start', italic=True))
    o.append(ln(ox - 92, oy - 84, ox + 92, oy + 84, TEAL, 3))
    o.append(dot(ox, oy, 4.5, DEEP))
    return ''.join(o)


# -------------------------------------------------------------- C.1 pendulum
@card('simple-pendulum')
def pendulum():
    o = []
    px, py, L = 380, 62, 194
    o.append(hatch(px - 70, py, 140, TEAL, 11, 11))
    o.append(ln(px, py, px, py + L + 12, GREY, 1.6, dash='7 6'))
    for a, c, w, op, fill in ((-32, SOFT, 2.2, .8, '#fff'), (32, TEAL, 3.2, 1, TEAL)):
        r = math.radians(a)
        bx, by = px + L * math.sin(r), py + L * math.cos(r)
        o.append(ln(px, py, bx, by, c, w, op=op))
        o.append(circ(bx, by, 22, fill, c, 2.8, op=op))
    o.append(arc(px, py, 118, -90, -58, GREY, 1.8))
    o.append(txt(px + 34, py + 108, '&#952;', 16, GREY, italic=True))
    # the swept arc the bob actually travels
    r = math.radians(32)
    o.append(arc(px, py, L, -90 - 32, -90 + 32, GREY, 1.6, dash='6 6'))
    bx, by = px + L * math.sin(r), py + L * math.cos(r)
    o.append(arrow(bx - 6, by + 30, bx - 62, by + 14, DEEP, 2.4, head='D'))
    o.append(txt(bx - 34, by + 52, 'v', 15, DEEP, italic=True))
    o.append(dot(px, py, 5, TEAL))
    return ''.join(o)


# --------------------------------------------------------- C.1 resonance
@card('damping-and-resonance')
def resonance():
    o = []
    x0, y0, w_, h_ = 96, 60, 440, 218
    o.append(rect(x0 - 34, y0 - 26, w_ + 96, h_ + 74, MIST, LINE, 1.6, r=12))
    o.append(plot_frame(x0, y0, w_, h_, GREY, 'f', 'A', GREY, 15))
    f0 = 0.42
    for b, c, w, dash in ((0.030, TEAL, 3.2, None), (0.070, SOFT, 2.6, None),
                          (0.150, GREY, 2.2, '7 6')):
        pts = []
        for i in range(241):
            u = i / 240
            amp = 1.0 / math.sqrt((1 - (u / f0) ** 2) ** 2 + (2 * b * u / f0) ** 2)
            pts.append((x0 + u * w_, y0 + h_ - min(h_ * 0.96, amp * h_ * 0.075)))
        o.append(curve(pts, c, w, dash=dash))
    o.append(ln(x0 + f0 * w_, y0 + 6, x0 + f0 * w_, y0 + h_, DEEP, 1.6, dash='6 6'))
    o.append(txt(x0 + f0 * w_, y0 + h_ + 22, 'f&#8320;', 14, DEEP, weight=700))

    # the driven oscillator itself
    dx = 640
    o.append(hatch(dx - 44, 74, 88, TEAL, 8, 9))
    o.append(curve(spring(dx, 74, dx, 168, coils=6, amp=14), TEAL, 2.4))
    o.append(rect(dx - 30, 168, 60, 44, WASH, TEAL, 2.6, r=8))
    o.append(arrow(dx, 226, dx, 262, DEEP, 2.4, head='D', both=True))
    return ''.join(o)


# ----------------------------------------------------------- C.2 wave anatomy
@card('wave-anatomy')
def wave_anatomy():
    o = []
    y0, amp, wl = 178, 66, 246
    o.append(ln(56, y0, 706, y0, LINE, 2, dash='7 6'))
    o.append(curve(sine(64, 700, y0, amp, wl), TEAL, 3.4))
    c1, c2 = 64 + wl * 0.25, 64 + wl * 1.25
    o.append(ln(c1, y0 - amp - 6, c1, 74, GREY, 1.3, dash='5 5'))
    o.append(ln(c2, y0 - amp - 6, c2, 74, GREY, 1.3, dash='5 5'))
    o.append(barbell(c1, 84, c2, 84))
    o.append(txt((c1 + c2) / 2, 74, '&#955;', 17, GREY, italic=True))
    ax = 64 + wl * 0.75
    o.append(barbell(ax, y0, ax, y0 + amp))
    o.append(txt(ax + 14, y0 + 34, 'A', 15, GREY, anchor='start', italic=True))
    # the one particle that is tracked
    m = 64 + wl * 1.75
    o.append(ln(m, y0 - amp, m, y0 + amp, DEEP, 1.6, dash='5 5'))
    o.append(arrow(m, y0 + 30, m, y0 + amp + 6, DEEP, 2.2, head='D', both=True))
    o.append(dot(m, y0 + amp, 8, DEEP))
    o.append(txt(m + 16, y0 + amp + 26, 'one particle', 13, GREY, anchor='start', weight=600))
    return ''.join(o)


# ------------------------------------------------- C.2 wave speed on a string
@card('wave-speed-on-a-string')
def string_speed():
    o = []
    y0 = 162
    o.append(rect(56, y0 - 34, 46, 68, WASH, TEAL, 2.4, r=8))
    o.append(ln(66, y0 - 16, 92, y0 - 16, TEAL, 2))
    o.append(ln(66, y0, 92, y0, TEAL, 2))
    o.append(ln(66, y0 + 16, 92, y0 + 16, TEAL, 2))
    px, pr = 560, 22
    # three loops between the vibrator and the pulley
    L = px - 102
    for s, c, w in ((1, TEAL, 3.2), (-1, SOFT, 2.4)):
        pts = [(102 + L * i / 300, y0 - s * 34 * math.sin(3 * math.pi * i / 300))
               for i in range(301)]
        o.append(curve(pts, c, w))
    for k in range(4):
        o.append(dot(102 + L * k / 3, y0, 4.5, DEEP))
    o.append(circ(px, y0, pr, '#fff', TEAL, 2.8))
    o.append(dot(px, y0, 4, TEAL))
    o.append(arc(px, y0, pr, 90, 0, TEAL, 3))
    o.append(ln(px + pr, y0, px + pr, 244, TEAL, 2.4))
    o.append(rect(px + pr - 26, 244, 52, 46, WASH, TEAL, 2.6, r=6))
    o.append(txt(px + pr, 274, 'm', 16, TEAL, italic=True))
    o.append(arrow(px + pr + 44, 244, px + pr + 44, 292, DEEP, 2.2, head='D'))
    o.append(txt(px + pr + 58, 272, 'W', 14, DEEP, anchor='start', italic=True))
    o.append(barbell(102, 246, px - pr, 246))
    o.append(txt((102 + px) / 2, 268, 'L', 15, GREY, italic=True))
    return ''.join(o)


# ------------------------------------------------------- C.4 standing waves
@card('standing-waves')
def standing():
    o = []
    y0, amp, wl = 170, 64, 282
    o.append(ln(60, y0, 700, y0, LINE, 2, dash='7 6'))
    o.append(curve(sine(66, 696, y0, amp * 0.5, wl, 0.9), GREY, 1.8, op=0.55))
    o.append(curve(sine(66, 696, y0, amp * 0.5, wl, -0.9), GREY, 1.8, op=0.55, dash='6 5'))
    env = [(66 + (696 - 66) * i / 300,
            amp * math.sin(2 * math.pi * (630 * i / 300) / wl)) for i in range(301)]
    o.append(curve([(x, y0 - e) for x, e in env], TEAL, 3.4))
    o.append(curve([(x, y0 + e) for x, e in env], SOFT, 2.2, dash='7 6'))
    for k in range(int(630 / (wl / 2)) + 1):
        x = 66 + k * wl / 2
        if x <= 700:
            o.append(dot(x, y0, 6, DEEP))
            o.append(txt(x, y0 + 26, 'N', 13, DEEP, weight=700))
    for k in range(int(630 / (wl / 2))):
        x = 66 + (k + 0.5) * wl / 2
        o.append(txt(x, y0 - amp - 14, 'A', 13, GREY, weight=700))
    return ''.join(o)


# ---------------------------------------------------- C.4 harmonics and pipes
@card('harmonics-and-pipes')
def pipes():
    o = []
    for k, (x0, closed, lab) in enumerate([(70, False, 'open'), (420, True, 'closed')]):
        w_, y0, h_ = 270, 78, 58
        for i, (c, w, op) in enumerate([(TEAL, 3, 1), (SOFT, 2.4, .9), (GREY, 2, .75)]):
            yy = y0 + i * 74
            o.append(ln(x0, yy - 28, x0 + w_, yy - 28, INK, 2.6))
            o.append(ln(x0, yy + 28, x0 + w_, yy + 28, INK, 2.6))
            if closed:
                o.append(ln(x0, yy - 28, x0, yy + 28, INK, 2.6))
                for j in range(5):
                    o.append(ln(x0, yy - 24 + j * 12, x0 - 9, yy - 18 + j * 12, GREY, 1.3))
            nmode = (i + 1) if not closed else (2 * i + 1)
            k_ = nmode * math.pi / (2 * w_) * (2 if not closed else 1)
            pts, pts2 = [], []
            for t in range(121):
                x = x0 + w_ * t / 120
                if closed:
                    a = 24 * math.sin(k_ * (x - x0))
                else:
                    a = 24 * math.cos(nmode * math.pi * (x - x0) / w_)
                pts.append((x, yy - a)); pts2.append((x, yy + a))
            o.append(curve(pts, c, w, op=op))
            o.append(curve(pts2, c, w * 0.8, op=op * 0.55, dash='6 5'))
        o.append(txt(x0 + w_ / 2, 300, lab + ' pipe', 14, GREY, weight=700, ls='0.6'))
    return ''.join(o)


# -------------------------------------------------------- C.4 resonance tube
@card('resonance-tube')
def resonance_tube():
    o = []
    tx, tw, top, bot = 330, 104, 72, 300
    water = 236
    o.append(rect(tx, water, tw, bot - water, WASH, None, 0))
    o.append(ln(tx, top, tx, bot, INK, 2.6))
    o.append(ln(tx + tw, top, tx + tw, bot, INK, 2.6))
    o.append(ln(tx, bot, tx + tw, bot, INK, 2.6))
    o.append(curve([(tx + i * tw / 40, water + 3 * math.sin(i / 40 * 4 * math.pi))
                    for i in range(41)], TEAL, 2.4))
    # the quarter wave standing in the air column
    pts, pts2 = [], []
    for i in range(121):
        y = top + (water - top) * i / 120
        a = 40 * math.sin(math.pi / 2 * (water - y) / (water - top))
        pts.append((tx + tw / 2 - a, y)); pts2.append((tx + tw / 2 + a, y))
    o.append(curve(pts, TEAL, 3))
    o.append(curve(pts2, SOFT, 2.2, dash='6 5'))
    o.append(dot(tx + tw / 2, water, 6, DEEP))
    o.append(barbell(tx - 26, top, tx - 26, water))
    o.append(txt(tx - 40, (top + water) / 2 + 5, 'L', 16, GREY, anchor='end', italic=True))
    # the fork above the mouth
    fx, fy = tx + tw / 2, 38
    o.append(ln(fx, fy + 16, fx, fy + 32, DEEP, 4))
    o.append(path(f'M{fx-14},{fy-22} L{fx-14},{fy+6} Q{fx-14},{fy+16} {fx},{fy+16} '
                  f'Q{fx+14},{fy+16} {fx+14},{fy+6} L{fx+14},{fy-22}', DEEP, 3.4))
    o.append(txt(fx + 104, fy + 8, 'f', 15, GREY, italic=True))
    o.append(arc(fx + 34, fy, 18, -60, 60, GREY, 1.4))
    o.append(arc(fx + 34, fy, 28, -50, 50, GREY, 1.4, op=.7))
    o.append(arc(fx + 34, fy, 38, -42, 42, GREY, 1.4, op=.5))
    return ''.join(o)


# ---------------------------------------------------- A.2 the friction bench
@card('friction')
def friction():
    """The block on the bench, the interface under a lens, and the sawtooth the
    balance draws — the three scales of the simulation in one picture."""
    o = []
    random_h = [0.42, 0.18, 0.95, 0.30, 0.62, 0.22, 0.78, 0.35, 0.50, 0.26,
                0.88, 0.20, 0.44, 0.33, 0.70]

    # ----------------------------------------------------------- the bench
    bench = 276
    o.append(hatch(40, bench, 360, GREY, 22, 11))
    bx, by, bw, bh = 132, 214, 118, 62
    o.append(rect(bx, by, bw, bh, WASH, TEAL, 2.4, r=7))
    o.append(txt(bx + bw / 2, by + 38, 'm', 19, TEAL, italic=True))
    # the friction on the block, against the way it is going
    o.append(arrow(bx + 6, bench - 9, bx - 52, bench - 9, DEEP, 2.6, head='D'))
    o.append(txt(bx - 28, bench - 18, 'f', 15, DEEP, italic=True))
    # the spring balance and the steady hand
    o.append(curve(spring(bx + bw, by + bh / 2, 344, by + bh / 2, coils=7, amp=11), INK, 2.2))
    o.append(rect(344, by + bh / 2 - 15, 14, 30, TEAL, TEAL, 0, r=4))
    o.append(arrow(366, by + bh / 2, 404, by + bh / 2, TEAL, 2.4))
    o.append(txt(388, by + bh / 2 - 12, 'v', 15, TEAL, italic=True))

    # ------------------------------------------------ the interface, magnified
    lx, ly, lr = 104, 108, 62
    o.append(f'<defs><clipPath id="frlens"><circle cx="{lx}" cy="{ly}" r="{lr - 1}"/>'
             f'</clipPath></defs>')
    g = [f'<g clip-path="url(#frlens)">']
    base = ly + 40
    plane = ly + 6
    pts = []
    for i, hh in enumerate(random_h):
        x = lx - lr + (2 * lr) * i / (len(random_h) - 1)
        pts.append((x, base - hh * 46))
    # a rough profile: up to each summit and back down
    prof = [(lx - lr, base)]
    for (x, y) in pts:
        prof += [(x - 6.0, base), (x - 1.2, y), (x + 1.2, y), (x + 6.0, base)]
    prof.append((lx + lr, base))
    g.append(curve(prof, INK, 1.8, fill=MIST))
    g.append(rect(lx - lr, plane - 40, 2 * lr, 40, WASH, None, 0))
    g.append(ln(lx - lr, plane, lx + lr, plane, INK, 1.8))
    for (x, y) in pts:                      # the summits that reach the plane
        if y < plane:
            g.append(rect(x - 5, plane - 3, 10, 6, TEAL, None, 0))
    g.append('</g>')
    o.append(''.join(g))
    o.append(circ(lx, ly, lr, 'none', TEAL, 2.6))
    o.append(ln(lx + lr * 0.70, ly + lr * 0.70, bx + 26, by + bh - 2, TEAL, 1.6, dash='4 5'))
    o.append(txt(lx, ly - lr - 14, 'only the summits touch', 13, GREY, weight=700))

    # ------------------------------------------------------------ the record
    px, py, pw, ph = 470, 84, 232, 150
    o.append(plot_frame(px, py, pw, ph, GREY, xlab='t', ylab='F'))
    hi, lo = py + 26, py + 104
    o.append(ln(px, hi, px + pw, hi, GREY, 1.4, dash='7 6'))
    o.append(ln(px, lo, px + pw, lo, GREY, 1.4, dash='5 6'))
    o.append(txt(px + pw + 10, hi + 5, '&#956;', 14, GREY, anchor='start', italic=True))
    o.append(txt(px + pw + 20, hi + 9, 's', 11, GREY, anchor='start'))
    o.append(txt(px + pw + 27, hi + 5, 'N', 14, GREY, anchor='start', italic=True))
    o.append(txt(px + pw + 10, lo + 5, '&#956;', 14, GREY, anchor='start', italic=True))
    o.append(txt(px + pw + 20, lo + 9, 'k', 11, GREY, anchor='start'))
    o.append(txt(px + pw + 27, lo + 5, 'N', 14, GREY, anchor='start', italic=True))
    saw = [(px, py + ph)]
    x = px
    rise = 42
    while x < px + pw - 2:
        top = min(px + pw, x + rise)
        saw.append((top, hi))
        drop = min(px + pw, top + 11)
        saw.append((drop, lo + 22))
        x = drop
    o.append(curve(saw, TEAL, 2.6))
    o.append(txt(px + pw / 2, py + ph + 34, 'it grips, lets go, grips again', 13, GREY,
                 weight=700))
    return ''.join(o)


# -------------------------------------------------- A.2 the inclined plane
@card('incline')
def incline():
    """The wedge with the weight resolved on it, and the crossing that decides
    whether the block stays: the demand rising, the ceiling falling."""
    o = []
    th = math.radians(29)

    # ------------------------------------------------------------- the wedge
    gnd = 286
    fx, fy = 404, gnd                               # the foot of the slope, on the ground
    Lp = 296
    tx, ty = fx - Lp * math.cos(th), fy - Lp * math.sin(th)
    o.append(hatch(28, gnd, 390, GREY, 22, 10))
    o.append(poly([(tx, ty), (fx, fy), (tx, gnd)], TEAL, 2.4, fill=WASH, close=True))

    # the angle, against a horizontal to read it from
    o.append(ln(fx, fy, fx - 112, fy, TEAL, 1.4, dash='5 5', op=.55))
    o.append(arc(fx, fy, 78, 180 - math.degrees(th), 180, TEAL, 1.8))
    o.append(txt(fx - 96, fy - 22, '&#952;', 17, TEAL, italic=True))

    # the block, a third of the way down
    s = 0.30 * Lp
    ux, uy = math.cos(th), math.sin(th)             # down the slope, screen
    nx, ny = math.sin(th), -math.cos(th)            # out of the surface
    bx, by = tx + ux * s, ty + uy * s
    cx, cy = bx + nx * 17, by + ny * 17
    deg = math.degrees(th)
    o.append(f'<g transform="translate({n(cx)},{n(cy)}) rotate({n(deg)})">'
             + rect(-30, -17, 60, 34, TEAL, DEEP, 2, r=5) + '</g>')

    # the weight, and the two parts it splits into
    WL = 86
    o.append(ln(cx, cy, cx + ux * WL * math.sin(th), cy + uy * WL * math.sin(th),
                GREY, 1.4, dash='4 4'))
    o.append(ln(cx, cy, cx - nx * WL * math.cos(th), cy - ny * WL * math.cos(th),
                GREY, 1.4, dash='4 4'))
    o.append(ln(cx + ux * WL * math.sin(th), cy + uy * WL * math.sin(th), cx, cy + WL,
                GREY, 1.2, dash='3 4'))
    o.append(ln(cx - nx * WL * math.cos(th), cy - ny * WL * math.cos(th), cx, cy + WL,
                GREY, 1.2, dash='3 4'))
    o.append(arrow(cx, cy, cx, cy + WL, INK, 2.6, head='K'))
    o.append(txt(cx + 13, cy + WL + 2, 'W', 15, INK, italic=True, anchor='start'))
    # the surface pushing back
    o.append(arrow(bx, by, bx + nx * WL * math.cos(th), by + ny * WL * math.cos(th),
                   INK, 2.4, head='K'))
    o.append(txt(bx + nx * WL * math.cos(th) + 12, by + ny * WL * math.cos(th) - 2,
                 'N', 15, INK, italic=True, anchor='start'))
    o.append(arrow(bx, by, bx - ux * WL * math.sin(th), by - uy * WL * math.sin(th),
                   TEAL, 2.8, head='T'))
    o.append(txt(bx - ux * WL * math.sin(th) - 14, by - uy * WL * math.sin(th) - 6,
                 'f', 16, TEAL, italic=True))

    # ------------------------------------------------- the crossing, on the right
    px, py, pw, ph = 476, 62, 236, 170
    o.append(plot_frame(px, py, pw, ph, GREY, xlab='&#952;', ylab='F'))
    N = 90
    dem = [(px + pw * i / N, py + ph - ph * 0.92 * math.sin(math.radians(50 * i / N)) / math.sin(math.radians(50)))
           for i in range(N + 1)]
    cei = [(px + pw * i / N, py + ph - ph * 0.80 * math.cos(math.radians(50 * i / N)))
           for i in range(N + 1)]
    kin = [(px + pw * i / N, py + ph - ph * 0.50 * math.cos(math.radians(50 * i / N)))
           for i in range(N + 1)]
    # where the demand meets the ceiling
    xc = min(range(N + 1), key=lambda i: abs(dem[i][1] - cei[i][1]))
    o.append(curve(cei, INK, 1.8, dash='7 5'))
    o.append(curve(kin, GREY, 1.6, dash='3 4'))
    o.append(curve(dem, INK, 1.6))
    act = dem[:xc + 1] + [(kin[xc][0], kin[xc][1])] + kin[xc:]
    o.append(curve(act, TEAL, 3))
    o.append(ln(dem[xc][0], py, dem[xc][0], py + ph, TEAL, 1.3, dash='3 4'))
    o.append(dot(dem[xc][0], dem[xc][1], 5, TEAL))
    o.append(txt(dem[xc][0] - 8, py + ph - 10, 'it goes here', 12, TEAL, anchor='end',
                 weight=700))
    o.append(txt(px + 12, py + 14, 'ceiling', 12, INK, anchor='start', weight=700))
    o.append(txt(px + pw - 6, py + 26, 'demand', 12, INK, anchor='end', weight=700))
    o.append(txt(px + 6, py + ph + 30, 'the demand rises, the grip falls', 12.5, GREY,
                 anchor='start', weight=700))
    return ''.join(o)


# ------------------------------------------------------- A.3 work as an area
@card('work')
def work():
    """The F-x graph with the area shaded and the chord cutting off the wrong
    triangle, beside a block on a rope held at an angle."""
    o = []

    # ------------------------------------------- the graph, on the left
    px, py, pw, ph = 70, 58, 268, 196
    o.append(plot_frame(px, py, pw, ph, GREY, xlab='x', ylab='F'))
    N = 90
    xm = 0.86
    def f(u):                      # a band that stiffens as it is drawn out
        return u * (1 + 2.6 * u * u)
    fmax = f(xm)
    pts = [(px + pw * xm * i / N, py + ph - ph * 0.92 * f(xm * i / N) / fmax)
           for i in range(N + 1)]
    # the area under it is the work
    o.append(path('M' + f'{n(px)},{n(py + ph)} L'
                  + ' L'.join(f'{n(x)},{n(y)}' for x, y in pts)
                  + f' L{n(pts[-1][0])},{n(py + ph)} Z', TEAL, 0, fill=WASH))
    o.append(curve(pts, INK, 2.6))
    # the chord, whose triangle is the wrong answer
    o.append(ln(px, py + ph, pts[-1][0], pts[-1][1], TEAL, 1.8, dash='6 5'))
    o.append(dot(pts[-1][0], pts[-1][1], 5, INK))
    o.append(txt(px + 186, py + ph - 40, 'the area', 13, DEEP, weight=700))
    o.append(txt(px + 186, py + ph - 24, 'is the work', 13, DEEP, weight=700))
    o.append(txt(px + 150, py + 34, '&#189;Fx is', 12.5, GREY, weight=700))
    o.append(txt(px + 150, py + 50, 'too big here', 12.5, GREY, weight=700))

    # ------------------------------------- the block on a rope, on the right
    gnd = 266
    bx, bw, bh = 452, 78, 50
    o.append(hatch(398, gnd, 322, GREY, 20, 10))
    o.append(rect(bx, gnd - bh, bw, bh, TEAL, DEEP, 2.2, r=6))
    th = math.radians(28)
    tie = (bx + bw - 8, gnd - bh + 10)
    FL = 104
    o.append(arrow(tie[0], tie[1], tie[0] + FL * math.cos(th), tie[1] - FL * math.sin(th),
                   TEAL, 2.8, head='T'))
    o.append(txt(tie[0] + FL * math.cos(th) + 14, tie[1] - FL * math.sin(th) + 2,
                 'F', 16, TEAL, italic=True, anchor='start'))
    # the part of it that lies along the motion
    o.append(ln(tie[0], tie[1], tie[0] + 86, tie[1], GREY, 1.2, dash='4 4'))
    o.append(arc(tie[0], tie[1], 46, 0, math.degrees(th), TEAL, 1.6))
    o.append(txt(tie[0] + 56, tie[1] - 12, '&#952;', 15, TEAL, italic=True))
    o.append(arrow(bx + bw, gnd - bh / 2, bx + bw + FL * math.cos(th) * math.cos(th),
                   gnd - bh / 2, INK, 2, head='K', dash='5 4'))
    o.append(txt(bx + bw + 46, gnd - bh / 2 + 20, 'F cos &#952;', 13, GREY, weight=700))
    # the block is going this way
    o.append(arrow(bx - 18, gnd - bh - 18, bx + 54, gnd - bh - 18, DEEP, 2, head='D'))
    o.append(txt(bx + 18, gnd - bh - 26, 'it moves this way', 12, GREY, weight=700))
    o.append(txt(560, 300, 'only the part along the motion works', 13, GREY, weight=700))
    return ''.join(o)


# --------------------------------------------------- A.2 the circular motion rig
@card('circular-motion')
def circular_motion():
    """A conical pendulum beside a vertical loop: two of the three benches, and
    between them the whole idea of being pulled towards a centre."""
    o = []

    # ------------------------------------------- the conical pendulum, left
    px, py = 168, 54
    L, ph = 176, math.radians(34)
    R = L * math.sin(ph)
    drop = L * math.cos(ph)
    el = math.radians(40)
    ringy = py + drop * math.cos(el)
    o.append(hatch(px - 74, py - 16, 148, GREY, 11, 11))
    o.append(ln(px - 74, py - 16, px + 74, py - 16, INK, 2.4))
    o.append(ln(px, py - 16, px, py, INK, 2))
    o.append(ln(px, py, px, ringy + 30, GREY, 1.3, dash='5 5'))
    # the circle the bob traces, as an ellipse
    o.append(f'<ellipse cx="{n(px)}" cy="{n(ringy)}" rx="{n(R)}" ry="{n(R * math.sin(el))}" '
             f'fill="none" stroke="{TEAL}" stroke-width="1.8" stroke-dasharray="7 6" '
             f'opacity="0.75"/>')
    # the cone it sweeps
    o.append(ln(px - R, ringy, px, py, SOFT, 1.4))
    o.append(ln(px + R, ringy, px, py, SOFT, 1.4))
    # the bob, out at the left of the ring
    a = math.radians(203)
    bx, by = px + R * math.cos(a), ringy - R * math.sin(el) * math.sin(a)
    o.append(ln(px, py, bx, by, INK, 2.2))
    o.append(circ(bx, by, 13, DEEP, INK, 1.8))
    o.append(arrow(bx, by, bx + (px - bx) * 0.40, by + (py - by) * 0.40, INK, 2.2, head='K'))
    o.append(txt(bx + 52, by - 40, 'T', 15, INK, italic=True))
    o.append(arrow(bx, by, bx, by + 54, INK, 2.2, head='K'))
    o.append(txt(bx + 13, by + 56, 'W', 15, INK, italic=True, anchor='start'))
    o.append(arrow(bx, by, bx + 58, by, TEAL, 2.8, head='T'))
    o.append(txt(bx + 30, by + 20, 'net', 12.5, TEAL, weight=700))


    # ----------------------------------------------- the vertical loop, right
    cx, cy, r = 556, 168, 112
    o.append(circ(cx, cy, r + 9, 'none', INK, 2))
    o.append(circ(cx, cy, r - 9, 'none', INK, 2))
    o.append(circ(cx, cy, r, WASH, 'none', 0))
    # the gauge: how hard the hold works, right round
    for i in range(0, 72):
        ang = i / 72 * 2 * math.pi
        # longest at the bottom, shortest at the top
        val = 0.26 + 0.74 * (1 + math.cos(ang)) / 2
        bx2, by2 = cx + math.sin(ang) * r, cy + math.cos(ang) * r
        o.append(ln(bx2, by2, bx2 - math.sin(ang) * 34 * val,
                    by2 - math.cos(ang) * 34 * val, SOFT, 2.2))
    # the ball, at the top
    o.append(circ(cx, cy - r, 13, DEEP, INK, 1.8))
    o.append(arrow(cx, cy - r, cx, cy - r + 44, TEAL, 2.8, head='T'))
    o.append(txt(cx + 15, cy - r + 30, 'N + W', 13, TEAL, weight=700, anchor='start'))
    o.append(txt(W / 2, 324, 'a string, a banked road, a loop', 14, GREY, weight=700))
    return ''.join(o)
