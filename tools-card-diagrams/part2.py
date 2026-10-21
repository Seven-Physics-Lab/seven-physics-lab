"""Card pictures: optics, electricity and magnetism, fields, thermal, quantum."""
import math
from kit import *   # noqa

D = {}


def card(slug):
    def wrap(f):
        D[slug] = f
        return f
    return wrap


def clip(cid, x, y, w_, h_):
    return f'<defs><clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w_}" height="{h_}"/></clipPath></defs>'


# ----------------------------------------------------------- C.5 the Doppler
@card('doppler-effect')
def doppler():
    o = []
    sx, sy = 452, 172
    vT, cT = 26, 35
    for k in range(4, 0, -1):
        o.append(circ(sx - k * vT, sy, k * cT, 'none', TEAL, 2.2, op=1 - 0.14 * k))
    o.append(ln(sx - 4 * vT, sy, sx, sy, LINE, 1.6, dash='5 5'))
    o.append(dot(sx, sy, 9, DEEP))
    o.append(arrow(sx + 12, sy, sx + 66, sy, DEEP, 2.6, head='D'))
    o.append(txt(sx + 40, sy - 12, 'v', 15, DEEP, italic=True))
    # the two listeners: the fronts reach one crowded and the other spread out
    for x, lab in ((656, 'higher f'), (132, 'lower f')):
        o.append(rect(x - 13, sy - 16, 26, 32, WASH, TEAL, 2.2, r=7))
        o.append(dot(x, sy, 4, TEAL))
        o.append(txt(x, sy + 46, lab, 13, GREY, weight=700))
    return ''.join(o)


# ------------------------------------------------------------ C.3 ripple tank
@card('ripple-tank')
def ripple():
    o = [clip('rl', 46, 40, 332, 236), clip('rr', 384, 40, 330, 236)]
    bx, gy, gh = 380, 158, 34
    o.append(f'<g clip-path="url(#rl)">')
    for i in range(9):
        x = 62 + i * 36
        o.append(ln(x, 44, x, 272, TEAL, 2.6, op=0.9))
    o.append('</g>')
    o.append(f'<g clip-path="url(#rr)">')
    for k in range(1, 8):
        o.append(circ(bx, gy + gh / 2, k * 36, 'none', TEAL, 2.4, op=max(0.28, 1 - 0.1 * k)))
    o.append('</g>')
    o.append(rect(bx - 7, 40, 14, gy - 40, DEEP, None, 0, r=3))
    o.append(rect(bx - 7, gy + gh, 14, 276 - (gy + gh), DEEP, None, 0, r=3))
    o.append(barbell(bx - 24, gy, bx - 24, gy + gh))
    o.append(txt(bx - 36, gy + gh / 2 + 5, 'b', 15, GREY, anchor='end', italic=True))
    # a printed rule, because every length in this one is to scale
    o.append(ln(180, 302, 660, 302, INK, 2))
    for i in range(25):
        x = 180 + i * 20
        big = i % 5 == 0
        o.append(ln(x, 302, x, 302 - (11 if big else 6), INK, 1.6 if big else 1.2))
    o.append(txt(672, 307, 'mm', 13, GREY, anchor='start', weight=700))
    return ''.join(o)


# -------------------------------------------------------- C.3 refraction, TIR
@card('refraction-and-tir')
def refraction():
    o = []
    iy = 172
    o.append(rect(48, iy, 664, 122, MIST, None, 0))
    o.append(ln(48, iy, 712, iy, INK, 2.6))
    o.append(txt(60, iy - 12, 'air', 13, GREY, anchor='start', weight=700))
    o.append(txt(60, iy + 24, 'glass', 13, TEAL, anchor='start', weight=700))

    # left: a ray crossing in, bending towards the normal
    ax = 236
    o.append(ln(ax, iy - 106, ax, iy + 106, GREY, 1.5, dash='6 6'))
    a1 = math.radians(52)
    o.append(arrow(ax - 118 * math.sin(a1), iy - 118 * math.cos(a1), ax, iy, TEAL, 2.8))
    a2 = math.radians(31)
    o.append(arrow(ax, iy, ax + 116 * math.sin(a2), iy + 116 * math.cos(a2), TEAL, 2.8))
    o.append(arrow(ax, iy, ax + 96 * math.sin(a1), iy - 96 * math.cos(a1), GREY, 1.8, head='G'))
    o.append(arc(ax, iy, 52, 90, 90 + math.degrees(a1), GREY, 1.6))
    o.append(arc(ax, iy, 52, 270, 270 - math.degrees(a2), GREY, 1.6))
    o.append(txt(ax - 44, iy - 46, '&#952;&#8321;', 14, GREY, italic=True))
    o.append(txt(ax + 26, iy + 62, '&#952;&#8322;', 14, GREY, italic=True))

    # right: past the critical angle nothing gets out
    cx = 556
    o.append(ln(cx, iy - 106, cx, iy + 106, GREY, 1.5, dash='6 6'))
    ac = math.radians(60)
    o.append(arrow(cx - 120 * math.sin(ac), iy + 120 * math.cos(ac), cx, iy, TEAL, 2.8))
    o.append(arrow(cx, iy, cx + 120 * math.sin(ac), iy + 120 * math.cos(ac), TEAL, 2.8))
    o.append(arrow(cx, iy, cx + 104, iy, GREY, 1.6, head='G', dash='6 5'))
    o.append(arc(cx, iy, 56, 270, 270 + math.degrees(ac), GREY, 1.6))
    o.append(txt(cx + 46, iy + 56, '&#952;c', 14, GREY, italic=True))
    return ''.join(o)


def _slits(o, gaps, bx=316, wave_from=58):
    """The shared picture: plane waves in, circular waves out of each gap."""
    o.append(clip('sl', wave_from - 6, 34, bx - wave_from, 272))
    o.append(clip('sr', bx + 6, 34, 380, 272))
    o.append('<g clip-path="url(#sl)">')
    for i in range(8):
        o.append(ln(wave_from + i * 34, 38, wave_from + i * 34, 302, TEAL, 2.4, op=0.85))
    o.append('</g>')
    o.append('<g clip-path="url(#sr)">')
    for gy in gaps:
        for k in range(1, 12):
            o.append(circ(bx, gy, k * 34, 'none', TEAL, 1.7, op=max(0.2, 0.8 - 0.05 * k)))
    o.append('</g>')
    edges = [34] + [y for g in gaps for y in (g - 9, g + 9)] + [306]
    for i in range(0, len(edges), 2):
        y0, y1 = edges[i], edges[i + 1]
        o.append(rect(bx - 7, y0, 14, y1 - y0, DEEP, None, 0, r=3))


def _screen(o, curvef, sx=672, y0=38, y1=302, amp=118):
    o.append(ln(sx, y0, sx, y1, INK, 3))
    pts = []
    for i in range(241):
        y = y0 + (y1 - y0) * i / 240
        pts.append((sx - amp * curvef((y - (y0 + y1) / 2) / ((y1 - y0) / 2)), y))
    o.append(curve(pts, DEEP, 2.8))
    o.append(curve(pts + [(sx, y1), (sx, y0)], DEEP, 0, fill=DEEP, op=0.10, close=True))


@card('double-slit')
def double_slit():
    o = []
    _slits(o, [140, 200])
    def f(u):
        return (math.cos(3.1 * u) ** 2) * (math.sin(2.6 * u + 1e-9) / (2.6 * u + 1e-9)) ** 2
    _screen(o, f)
    return ''.join(o)


@card('single-slit')
def single_slit():
    o = []
    _slits(o, [170])
    def f(u):
        x = 4.4 * u + 1e-9
        return (math.sin(x) / x) ** 2
    _screen(o, f)
    return ''.join(o)


@card('diffraction-grating')
def grating():
    o = []
    bx = 300
    o.append(clip('gl', 52, 34, bx - 58, 272))
    o.append('<g clip-path="url(#gl)">')
    for i in range(7):
        o.append(ln(56 + i * 34, 38, 56 + i * 34, 302, TEAL, 2.4, op=0.85))
    o.append('</g>')
    gaps = [80 + i * 36 for i in range(7)]
    edges = [34] + [y for g in gaps for y in (g - 7, g + 7)] + [306]
    for i in range(0, len(edges), 2):
        o.append(rect(bx - 7, edges[i], 14, edges[i + 1] - edges[i], DEEP, None, 0, r=3))
    # the orders: where every slit agrees
    sx = 666
    for m, ang in ((-1, -19), (0, 0), (1, 19)):
        a = math.radians(ang)
        y_end = 170 + (sx - bx) * math.tan(a)
        o.append(arrow(bx + 10, 170, sx - 12, y_end, TEAL, 2.6))
        o.append(txt(bx + 210, 170 + 210 * math.tan(a) - 14, f'm = {m}', 13, GREY, weight=700))
    o.append(ln(sx, 34, sx, 306, INK, 3))
    for ang in (-19, 0, 19):
        y = 170 + (sx - bx) * math.tan(math.radians(ang))
        o.append(curve([(sx, y - 22), (sx - 6, y - 8), (sx - 54, y), (sx - 6, y + 8), (sx, y + 22)],
                       DEEP, 2.4, fill=DEEP, op=0.85))
    return ''.join(o)


# ------------------------------------------------------------- C.3 thin film
@card('thin-film')
def thin_film():
    grad = ('<defs><linearGradient id="spec" x1="0" x2="1">'
            '<stop offset="0" stop-color="#5A00A0"/><stop offset=".2" stop-color="#0038FF"/>'
            '<stop offset=".4" stop-color="#00C2A8"/><stop offset=".6" stop-color="#BFE000"/>'
            '<stop offset=".8" stop-color="#FF9A00"/><stop offset="1" stop-color="#E00000"/>'
            '</linearGradient></defs>')
    o = [grad]
    top, bot = 176, 214
    o.append(rect(60, top, 600, bot - top, WASH, None, 0))
    o.append(ln(60, top, 660, top, TEAL, 2.6))
    o.append(ln(60, bot, 660, bot, TEAL, 2.6))
    o.append(barbell(96, top, 96, bot))
    o.append(txt(82, (top + bot) / 2 + 5, 'd', 15, GREY, anchor='end', italic=True))
    a = math.radians(38)
    hx = 300
    o.append(arrow(hx - 150 * math.tan(a), top - 150, hx, top, DEEP, 2.8, head='D'))
    o.append(arrow(hx, top, hx + 150 * math.tan(a), top - 150, TEAL, 2.8))
    ar = math.radians(26)
    bx = hx + (bot - top) * math.tan(ar)
    o.append(ln(hx, top, bx, bot, SOFT, 2.2))
    o.append(ln(bx, bot, bx + (bot - top) * math.tan(ar), top, SOFT, 2.2))
    ex = bx + (bot - top) * math.tan(ar)
    o.append(arrow(ex, top, ex + 150 * math.tan(a), top - 150, TEAL, 2.8))
    # what the eye ends up seeing
    o.append(rect(452, 252, 208, 30, 'url(#spec)', LINE, 1.4, r=6))
    o.append(txt(556, 302, 'the colour that survives', 13, GREY, weight=600))
    o.append(txt(74, 272, 'two reflections, one path difference', 13, GREY,
                 anchor='start', weight=600))
    return ''.join(o)


# ------------------------------------------------- B.5 internal resistance
@card('internal-resistance')
def internal_resistance():
    o = []
    L, R, T, B = 130, 580, 92, 258
    o.append(poly([(L, T), (R, T), (R, B), (L, B)], INK, 2.6, close=True))
    # the cell, with its internal resistance inside the dashed box
    o.append(rect(L - 46, (T + B) / 2 - 58, 128, 116, '#fff', GREY, 1.6, dash='6 5', r=10))
    cy = (T + B) / 2
    o.append(rect(L - 84, cy, 0, 0))
    o.append(ln(L, T, L, cy - 40, INK, 2.6))
    o.append(ln(L - 20, cy - 40, L + 20, cy - 40, INK, 3.4))
    o.append(ln(L - 10, cy - 28, L + 10, cy - 28, INK, 2.2))
    o.append(txt(L - 30, cy - 34, '&#949;', 17, TEAL, anchor='end', italic=True))
    o.append(ln(L, cy - 28, L, cy + 4, INK, 2.6))
    o.append(rect(L - 17, cy + 4, 34, 40, WASH, TEAL, 2.4, r=4))
    o.append(txt(L + 30, cy + 30, 'r', 16, TEAL, anchor='start', italic=True))
    o.append(ln(L, cy + 44, L, B, INK, 2.6))
    # the ammeter in the loop and the external resistor
    o.append(circ(370, T, 21, '#fff', INK, 2.4))
    o.append(txt(370, T + 6, 'A', 15, TEAL))
    o.append(rect(R - 19, cy - 34, 38, 68, WASH, TEAL, 2.6, r=5))
    o.append(txt(R + 32, cy + 6, 'R', 16, TEAL, anchor='start', italic=True))
    # the voltmeter, in its own branch across the same two ends as R
    o.append(ln(R, cy - 34, R, T, INK, 2.6))
    o.append(ln(R, cy + 34, R, B, INK, 2.6))
    vx = 700
    o.append(ln(R, T, vx, T, INK, 2.2))
    o.append(ln(vx, T, vx, cy - 22, INK, 2.2))
    o.append(ln(vx, cy + 22, vx, B, INK, 2.2))
    o.append(ln(R, B, vx, B, INK, 2.2))
    o.append(circ(vx, cy, 22, '#fff', INK, 2.4))
    o.append(txt(vx, cy + 6, 'V', 15, TEAL))
    return ''.join(o)


# --------------------------------------------------------- D.4 Faraday bench
@card('faraday-bench')
def faraday():
    o = []
    cy = 152
    # the coil: one wire wound six times, seen from the side
    cx0, turns, pitch, ry = 392, 6, 30, 52
    hel = []
    for i in range(turns * 120 + 1):
        t = i / 120.0
        hel.append((cx0 + pitch * t + 13 * math.sin(2 * math.pi * t + math.pi / 2),
                    cy - ry * math.cos(2 * math.pi * t + math.pi / 2)))
    o.append(curve(hel, TEAL, 2.8))
    o.append(ln(cx0 - 26, cy + ry, cx0, cy + ry, TEAL, 2.8))
    # the magnet, moving in
    mx = 176
    o.append(rect(mx, cy - 26, 62, 52, TEAL, DEEP, 2.4, r=5))
    o.append(rect(mx + 62, cy - 26, 62, 52, '#fff', DEEP, 2.4, r=5))
    o.append(txt(mx + 31, cy + 7, 'N', 18, '#fff'))
    o.append(txt(mx + 93, cy + 7, 'S', 18, DEEP))
    o.append(arrow(mx + 134, cy, mx + 196, cy, DEEP, 2.8, head='D'))
    o.append(txt(mx + 165, cy - 12, 'v', 15, DEEP, italic=True))
    for s in (-1, 1):
        o.append(path(f'M{mx-36},{cy+s*34} Q{mx+62},{cy+s*72} {mx+160},{cy+s*34}',
                      SOFT, 1.6, dash='6 5'))
    # the meter, with a needle thrown off zero
    gx, gy = 560, 268
    o.append(ln(cx0 + turns * pitch, cy + ry, 646, cy + ry, TEAL, 2.4))
    o.append(ln(646, cy + ry, 646, gy - 26, TEAL, 2.4))
    o.append(ln(cx0 - 26, cy + ry, 474, cy + ry, TEAL, 2.4))
    o.append(ln(474, cy + ry, 474, gy - 26, TEAL, 2.4))
    o.append(rect(gx - 82, gy - 26, 164, 62, '#fff', INK, 2.4, r=10))
    o.append(arc(gx, gy + 22, 46, 152, 28, GREY, 1.6))
    for a in (152, 118, 90, 62, 28):
        r0 = math.radians(a)
        o.append(ln(gx + 40 * math.cos(r0), gy + 22 - 40 * math.sin(r0),
                    gx + 46 * math.cos(r0), gy + 22 - 46 * math.sin(r0), GREY, 1.4))
    na = math.radians(118)
    o.append(ln(gx, gy + 22, gx + 42 * math.cos(na), gy + 22 - 42 * math.sin(na), DEEP, 2.8))
    o.append(dot(gx, gy + 22, 4, DEEP))
    o.append(txt(gx, gy - 6, 'mV', 12, GREY, weight=700))
    return ''.join(o)


# ------------------------------------------------------ D.1 gravitational
@card('gravitational-fields')
def gravity():
    o = []
    m1 = (262, 176, 1.0)
    m2 = (508, 176, 0.42)

    def pot(x, y):
        v = 0
        for mx, my, m in (m1, m2):
            v -= m / math.sqrt((x - mx) ** 2 + (y - my) ** 2 + 260)
        return v

    vals = sorted(pot(x, y) for x in range(44, 724, 12) for y in range(30, 314, 12))
    levels = [vals[int(q * (len(vals) - 1))] for q in
              (0.006, 0.02, 0.05, 0.10, 0.18, 0.28, 0.40, 0.54, 0.70, 0.86)]
    segs = contours(pot, 40, 724, 26, 314, levels, step=6)
    d = ''.join(f'M{n(a[0])},{n(a[1])} L{n(b[0])},{n(b[1])} ' for a, b in segs)
    o.append(path(d, SOFT, 1.5, op=0.85))
    # the saddle between them, where the two pulls cancel
    sx = (m1[0] + m2[0] * math.sqrt(m1[2] / m2[2])) / (1 + math.sqrt(m1[2] / m2[2]))
    o.append(circ(sx, 176, 9, '#fff', DEEP, 2.2, dash='4 4'))
    # an orbit round the heavy one, with the body on it
    o.append(f'<ellipse cx="{m1[0]+26}" cy="176" rx="128" ry="86" fill="none" stroke="{DEEP}" '
             f'stroke-width="2.2" stroke-dasharray="7 6"/>')
    bx, by = m1[0] + 26 + 128 * math.cos(math.radians(-46)), 176 + 86 * math.sin(math.radians(-46))
    o.append(dot(bx, by, 7, DEEP))
    o.append(arrow(bx + 6, by - 12, bx + 44, by - 40, DEEP, 2.2, head='D'))
    for mx, my, m in (m1, m2):
        o.append(circ(mx, my, 30 * m ** 0.5 + 6, TEAL, DEEP, 2.4))
    o.append(txt(m1[0], m1[1] + 7, 'M', 17, '#fff'))
    o.append(txt(m2[0], m2[1] + 6, 'm', 15, '#fff'))
    return ''.join(o)


# --------------------------------------------------------------- B.3 the gas
@card('ideal-gas')
def ideal_gas():
    import random
    rnd = random.Random(7)
    o = []
    x0, y0, x1, y1 = 74, 74, 470, 268
    o.append(rect(x0, y0, x1 - x0, y1 - y0, MIST, None, 0))
    o.append(poly([(x1, y0), (x0, y0), (x0, y1), (x1, y1)], INK, 3))
    # the molecules, each with the direction it happens to be going
    for _ in range(26):
        x = rnd.uniform(x0 + 14, x1 - 26)
        y = rnd.uniform(y0 + 14, y1 - 14)
        a = rnd.uniform(0, 2 * math.pi)
        L = rnd.uniform(14, 26)
        o.append(arrow(x, y, x + L * math.cos(a), y + L * math.sin(a), SOFT, 1.5, head='S'))
        o.append(dot(x, y, 4.5, TEAL))
    # the piston, with its handle
    o.append(rect(x1 - 6, y0 - 6, 16, y1 - y0 + 12, TEAL, DEEP, 2.4, r=4))
    o.append(rect(x1 + 10, 162, 74, 14, WASH, DEEP, 2.2, r=7))
    o.append(circ(x1 + 100, 169, 17, '#fff', DEEP, 2.6))
    o.append(arrow(x1 + 30, 134, x1 + 84, 134, DEEP, 2.4, head='D', both=True))
    # what the three quantities are doing
    bx, base, top = 612, 276, 88
    for i, (h, lab) in enumerate([(128, 'p'), (92, 'V'), (152, 'T')]):
        x = bx + i * 44
        o.append(rect(x, top, 30, base - top, MIST, LINE, 1.4, r=5))
        o.append(rect(x, base - h, 30, h, TEAL, None, 0, r=5))
        o.append(txt(x + 15, base + 20, lab, 14, GREY, weight=700, italic=True))
    return ''.join(o)


# ----------------------------------------------------- E.2 photoelectric
@card('photoelectric-effect')
def photoelectric():
    o = []
    ex, cx_, top, bot = 214, 520, 80, 250
    o.append(rect(ex - 9, top, 18, bot - top, TEAL, DEEP, 2.2, r=4))
    o.append(rect(cx_ - 9, top, 18, bot - top, '#fff', DEEP, 2.4, r=4))
    o.append(txt(ex, top - 14, 'emitter', 13, TEAL, weight=700))
    o.append(txt(cx_, top - 14, 'collector', 13, GREY, weight=700))
    # photons in
    for k, y in enumerate((112, 158, 204)):
        o.append(wavy(70, y - 40, ex - 14, y, 20, 6.5, TEAL, 2.2))
    # electrons across the gap
    for y, L in ((124, 150), (170, 190), (216, 120)):
        o.append(arrow(ex + 20, y, ex + 20 + L, y - 8, DEEP, 2, head='D'))
        o.append(circ(ex + 20, y, 7, '#fff', DEEP, 2))
        o.append(txt(ex + 20, y + 5, '&#8722;', 13, DEEP))
    # one loop: the battery sets the voltage, the meter counts what arrives
    wy = 298
    o.append(ln(ex, bot, ex, wy, INK, 2.4))
    o.append(ln(ex, wy, 312, wy, INK, 2.4))
    o.append(ln(352, wy, 430, wy, INK, 2.4))
    o.append(ln(470, wy, cx_, wy, INK, 2.4))
    o.append(ln(cx_, wy, cx_, bot, INK, 2.4))
    o.append(ln(312, wy - 15, 312, wy + 15, INK, 3.6))
    o.append(ln(330, wy - 9, 330, wy + 9, INK, 2.2))
    o.append(ln(330, wy, 352, wy, INK, 2.4))
    o.append(txt(321, wy - 24, 'V', 14, TEAL, italic=True))
    o.append(circ(450, wy, 20, '#fff', INK, 2.4))
    o.append(txt(450, wy + 6, '&#956;A', 13, TEAL))
    return ''.join(o)


# --------------------------------------------------------- E.2 Compton
@card('compton-scattering')
def compton():
    o = []
    hx, hy = 372, 176
    o.append(ln(hx, hy, 690, hy, LINE, 1.6, dash='6 6'))
    o.append(wavy(64, hy, hx - 16, hy, 30, 9, TEAL, 2.8))
    a = math.radians(38)
    o.append(wavy(hx + 14, hy, hx + 14 + 240 * math.cos(a), hy - 240 * math.sin(a),
                  50, 9, TEAL, 2.8))
    b = math.radians(-27)
    o.append(arrow(hx + 16, hy + 8, hx + 16 + 170 * math.cos(b), hy - 170 * math.sin(b),
                   DEEP, 2.6, head='D'))
    o.append(arc(hx + 14, hy, 74, 0, math.degrees(a), GREY, 1.6))
    o.append(txt(hx + 102, hy - 22, '&#952;', 16, GREY, italic=True))
    o.append(circ(hx, hy, 13, '#fff', DEEP, 2.4))
    o.append(txt(hx, hy + 5, '&#8722;', 15, DEEP))
    o.append(txt(196, hy - 30, '&#955;', 18, TEAL, italic=True))
    o.append(txt(hx + 236, hy - 92, '&#955;&#8242; &gt; &#955;', 18, TEAL,
                 anchor='start', italic=True))
    o.append(txt(hx + 196, hy + 112, 'recoil electron', 13, DEEP, weight=700))
    return ''.join(o)
