"""A small vector-drawing kit for the card pictures.

Every card is one 760x340 SVG, drawn in the brand's three colours: teal
carries the physics, black carries the labels, white is the ground. The
pictures are vector, so they stay sharp at any size and weigh a few
kilobytes each.
"""
import math

W, H = 760, 340

TEAL = '#005F6A'
DEEP = '#00434A'
SOFT = '#4E9AA3'          # teal lightened towards white, for second-rank lines
WASH = '#E9F1F2'
MIST = '#F4F9F9'
LINE = '#DDE7E8'
INK = '#000000'
GREY = '#5C6E72'          # a tint of the teal, not a fourth hue
FONT = "Quicksand, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif"

HEADS = {'T': TEAL, 'D': DEEP, 'K': INK, 'G': GREY, 'S': SOFT, 'W': '#FFFFFF'}


def head_defs():
    out = []
    for k, c in HEADS.items():
        out.append(
            f'<marker id="a{k}" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="9" '
            f'refX="11" refY="4.5" orient="auto"><path d="M0,0 L12,4.5 L0,9 L2.6,4.5 Z" fill="{c}"/></marker>')
        out.append(
            f'<marker id="b{k}" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="9" '
            f'refX="1" refY="4.5" orient="auto"><path d="M12,0 L0,4.5 L12,9 L9.4,4.5 Z" fill="{c}"/></marker>')
    return ''.join(out)


def svg(body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" '
            f'height="{H}" role="img"><defs>{head_defs()}{defs}</defs>'
            f'<rect width="{W}" height="{H}" fill="#fff"/>{body}</svg>')


def n(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def ln(x1, y1, x2, y2, c=TEAL, w=2.2, dash=None, cap='round', op=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op is not None else ''
    return (f'<line x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}" stroke="{c}" '
            f'stroke-width="{w}" stroke-linecap="{cap}"{d}{o}/>')


def arrow(x1, y1, x2, y2, c=TEAL, w=2.2, head='T', dash=None, both=False, op=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op is not None else ''
    start = f' marker-start="url(#b{head})"' if both else ''
    return (f'<line x1="{n(x1)}" y1="{n(y1)}" x2="{n(x2)}" y2="{n(y2)}" stroke="{c}" '
            f'stroke-width="{w}" stroke-linecap="round" marker-end="url(#a{head})"{start}{d}{o}/>')


def path(d, c=TEAL, w=2.2, fill='none', dash=None, cap='round', join='round', op=None, head=None,
         start_head=None):
    da = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op is not None else ''
    m = f' marker-end="url(#a{head})"' if head else ''
    ms = f' marker-start="url(#b{start_head})"' if start_head else ''
    return (f'<path d="{d}" fill="{fill}" stroke="{c}" stroke-width="{w}" stroke-linecap="{cap}" '
            f'stroke-linejoin="{join}"{da}{o}{m}{ms}/>')


def poly(pts, c=TEAL, w=2.2, fill='none', dash=None, op=None, head=None, close=False):
    d = 'M' + ' L'.join(f'{n(x)},{n(y)}' for x, y in pts) + (' Z' if close else '')
    return path(d, c, w, fill, dash, op=op, head=head)


def circ(x, y, r, fill='none', c=TEAL, w=2.2, dash=None, op=None):
    da = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op is not None else ''
    return (f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(r)}" fill="{fill}" stroke="{c}" '
            f'stroke-width="{w}"{da}{o}/>')


def dot(x, y, r=5, c=TEAL):
    return f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(r)}" fill="{c}"/>'


def rect(x, y, w_, h_, fill='none', c=TEAL, sw=2.2, r=0, dash=None, op=None):
    da = f' stroke-dasharray="{dash}"' if dash else ''
    o = f' opacity="{op}"' if op is not None else ''
    rr = f' rx="{r}"' if r else ''
    st = f' stroke="{c}" stroke-width="{sw}"' if c else ''
    return (f'<rect x="{n(x)}" y="{n(y)}" width="{n(w_)}" height="{n(h_)}" fill="{fill}"{st}{rr}{da}{o}/>')


def txt(x, y, s, size=15, c=INK, anchor='middle', weight=600, italic=False, op=None, ls=None):
    it = ' font-style="italic"' if italic else ''
    o = f' opacity="{op}"' if op is not None else ''
    l = f' letter-spacing="{ls}"' if ls else ''
    return (f'<text x="{n(x)}" y="{n(y)}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{c}" text-anchor="{anchor}"{it}{o}{l}>{s}</text>')


def arc(cx, cy, r, a0, a1, c=TEAL, w=1.8, dash=None, op=None, head=None):
    """a0, a1 in degrees, measured anticlockwise from east, screen y down."""
    x0, y0 = cx + r * math.cos(math.radians(a0)), cy - r * math.sin(math.radians(a0))
    x1, y1 = cx + r * math.cos(math.radians(a1)), cy - r * math.sin(math.radians(a1))
    large = 1 if abs(a1 - a0) > 180 else 0
    sweep = 0 if a1 > a0 else 1
    return path(f'M{n(x0)},{n(y0)} A{n(r)},{n(r)} 0 {large} {sweep} {n(x1)},{n(y1)}',
                c, w, dash=dash, op=op, head=head)


def curve(pts, c=TEAL, w=2.4, dash=None, op=None, fill='none', head=None, close=False):
    """A polyline through sampled points — the curves here are computed, not eyeballed."""
    d = 'M' + ' L'.join(f'{n(x)},{n(y)}' for x, y in pts)
    if close:
        d += ' Z'
    return path(d, c, w, fill, dash, op=op, head=head)


def sine(x0, x1, y0, amp, wl, phase=0.0, steps=260):
    return [(x0 + (x1 - x0) * i / steps,
             y0 - amp * math.sin(2 * math.pi * (x0 + (x1 - x0) * i / steps - x0) / wl + phase))
            for i in range(steps + 1)]


def spring(x0, y0, x1, y1, coils=8, amp=15, lead=12):
    """A coil spring from (x0,y0) to (x1,y1), with a straight lead at each end."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    px, py = -uy, ux
    pts = [(x0, y0)]
    span = L - 2 * lead
    steps = coils * 24
    for i in range(steps + 1):
        s = lead + span * i / steps
        a = amp * math.sin(2 * math.pi * coils * i / steps)
        pts.append((x0 + ux * s + px * a, y0 + uy * s + py * a))
    pts.append((x1, y1))
    return pts


def hatch(x, y, w_, c=TEAL, n_=11, h_=10, sw=1.6):
    """A hatched support bar: the line, then the little strokes under it."""
    out = [ln(x, y, x + w_, y, c, 2.6)]
    for i in range(n_):
        xx = x + 4 + (w_ - 8) * i / max(1, n_ - 1)
        out.append(ln(xx, y, xx - h_ * 0.6, y + h_, c, 1.5))
    return ''.join(out)


def wavy(x0, y0, x1, y1, wl=22, amp=7, c=TEAL, w=2.2, head='T', steps=200):
    """A photon: a sine wave laid along a straight line, with an arrow head."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    px, py = -uy, ux
    tip = 11.0
    pts = []
    for i in range(steps + 1):
        s = (L - tip) * i / steps
        a = amp * math.sin(2 * math.pi * s / wl)
        pts.append((x0 + ux * s + px * a, y0 + uy * s + py * a))
    return curve(pts, c, w, head=head)


def barbell(x0, y0, x1, y1, c=GREY, w=1.6):
    """A double-headed measuring arrow."""
    return arrow(x0, y0, x1, y1, c, w, head='G', both=True)


def plot_frame(x, y, w_, h_, c=GREY, xlab=None, ylab=None, lab_c=GREY, size=14):
    """Axes drawn as an L, with the two axis names at their ends."""
    out = [arrow(x, y + h_, x, y - 6, c, 1.8, head='G'),
           arrow(x, y + h_, x + w_ + 6, y + h_, c, 1.8, head='G')]
    if ylab:
        out.append(txt(x - 6, y + 4, ylab, size, lab_c, anchor='end', italic=True))
    if xlab:
        out.append(txt(x + w_ + 12, y + h_ + 5, xlab, size, lab_c, anchor='start', italic=True))
    return ''.join(out)


def contours(pot, x0, x1, y0, y1, levels, step=7):
    """Marching squares on a scalar field: the contours are where the field
    puts them, exactly as in the simulations."""
    segs = []
    x = x0
    while x < x1:
        y = y0
        while y < y1:
            v = [pot(x, y), pot(x + step, y), pot(x + step, y + step), pot(x, y + step)]
            c = [(x, y), (x + step, y), (x + step, y + step), (x, y + step)]
            for L in levels:
                cut = []
                for e in range(4):
                    p0, p1 = v[e] - L, v[(e + 1) % 4] - L
                    if (p0 < 0) != (p1 < 0):
                        f = p0 / (p0 - p1)
                        cut.append((c[e][0] + f * (c[(e + 1) % 4][0] - c[e][0]),
                                    c[e][1] + f * (c[(e + 1) % 4][1] - c[e][1])))
                for k in range(0, len(cut) - 1, 2):
                    segs.append((cut[k], cut[k + 1]))
            y += step
        x += step
    return segs
