#!/usr/bin/env python3
"""Texture painters for the body parts (casual clothes, varsity jacket, legs, shoes, skirt ...).
Every painter returns a PIL RGB image that is baked / mapped onto a clean UV mesh."""
import math, os
import numpy as np
from PIL import Image
from texlib import Canvas, hexc, bake_planar, unwrap_canvas, SS
from facepaint import mixc

SC = os.path.dirname(os.path.abspath(__file__))
def _tex(name):
    return Image.open(os.path.join(SC, 'tex', name)).convert('RGBA')
IMG_EMBLEM, IMG_BACK, IMG_H, IMG_26 = _tex('emblem.png'), _tex('backtext.png'), _tex('hbadge.png'), _tex('num26.png')

JNAVY, JWHITE, JSNAP, JSEAM = '#03345D', '#F7F7FA', '#D5D9E2', '#02284A'
ARM_PATCH_T = 0.052        # patch centre: distance below the shoulder joint (m); patches sit on the outer side of the sleeve
TS = 1.0          # global texture scale (1.0 = hq, 0.5 = lite)

def sz(w, h):
    return max(int(w * TS), 16), max(int(h * TS), 16)

# jacket geometry (shared with the mesh builder)
JACKET_PROFILE = [(0.0, 0.614), (0.040, 0.6125), (0.080, 0.608), (0.106, 0.600), (0.130, 0.590), (0.148, 0.575),
                  (0.160, 0.556), (0.168, 0.532), (0.171, 0.505), (0.170, 0.478), (0.169, 0.45), (0.1685, 0.42),
                  (0.1695, 0.397), (0.1655, 0.370), (0.152, 0.3585), (0.0, 0.358)]
JZ = 0.78

def stripe_y(cv, y, w, col, x0=-0.3, x1=0.3):
    cv.rect(x0, y - w / 2, x1, y + w / 2, col)

# ------------------------------------------------------------------------------------- torso projection
def proj_xyz(P):
    return P[..., 0], P[..., 1], P[..., 2]

def proj_arm(p0, d, e1):
    def f(P):
        q = P - p0
        return q @ e1, -(q @ d), P[..., 2]
    return f

# ------------------------------------------------------------------------------------- shirt patterns
PATTERN = {'male_01_spiky': 'star', 'male_02_curly': 'stripes', 'male_03_moustache': 'polo',
           'female_01_longhair': 'dress_btn', 'female_02_twintails': 'bow', 'female_03_bun': 'dots'}

def star_pts(cx, cy, R, r=None, rot=math.pi / 2):
    r = r or R * 0.42
    return [(cx + (R if i % 2 == 0 else r) * math.cos(rot + i * math.pi / 5),
             cy + (R if i % 2 == 0 else r) * math.sin(rot + i * math.pi / 5)) for i in range(10)]

def peter_pan_collar(cv, col, edge, cy=0.585, w=0.20):
    """flat round collar painted on the chest (front view)"""
    ptsx = np.linspace(-w / 2, w / 2, 40)
    top = [(x, cy + 0.03) for x in ptsx]
    bot = [(x, cy - 0.045 * math.sqrt(max(1 - (x / (w / 2)) ** 2, 0)) - 0.004) for x in ptsx[::-1]]
    cv.poly(top + bot, col)
    cv.stroke([(x, y) for x, y in bot], 0.0035, edge)

def hex_dots(cv, col, x0, x1, y0, y1, pitch=0.034, r=0.0062):
    row = 0
    y = y0
    while y < y1:
        x = x0 + (pitch / 2 if row % 2 else 0)
        while x < x1:
            cv.ellipse(x, y, r, r, col)
            x += pitch
        y += pitch * 0.62; row += 1

def paint_casual_torso(spec, colors, size=(1024, 256), ymin=0.395, ymax=0.612, zs=0.78, surf=None):
    pat = PATTERN[spec['id']]
    top = colors['top']; dk = mixc(top, '#000000', 0.16); lt = mixc(top, '#FFFFFF', 0.38)
    trim = colors['trim']
    ppm = size[0] / 0.88
    cvs = []
    for side in ('front', 'back'):
        cv = Canvas(-0.2, 0.2, ymin - 0.004, ymax + 0.004, ppm, top)
        # hem stitch
        stripe_y(cv, 0.405, 0.0025, dk)
        if pat == 'stripes':
            y = 0.418
            while y < 0.6:
                stripe_y(cv, y, 0.016, lt); y += 0.044
        if pat == 'star' and side == 'front':
            cv.poly(star_pts(0, 0.488, 0.048), '#FFFFFF')
        if pat == 'polo' and side == 'front':
            cv.rect(-0.012, 0.455, 0.012, 0.585, dk)                       # placket
            for y in (0.548, 0.512, 0.476):
                cv.ellipse(0, y, 0.0075, 0.0075, '#FFF4E6'); cv.ellipse(0, y, 0.0028, 0.0028, dk)
            cv.rect(0.040, 0.462, 0.092, 0.508, mixc(top, '#000000', 0.07))          # chest pocket
            cv.stroke([(0.040, 0.508), (0.092, 0.508), (0.092, 0.462), (0.040, 0.462), (0.040, 0.508)], 0.003, dk)
            cv.poly([(-0.07, 0.59), (-0.012, 0.585), (-0.012, 0.545)], dk)   # collar flaps
            cv.poly([(0.07, 0.59), (0.012, 0.585), (0.012, 0.545)], dk)
        if pat == 'dress_btn':
            stripe_y(cv, 0.406, 0.016, colors['trim'])                     # white waist ribbon
            if side == 'front':
                peter_pan_collar(cv, '#FFFFFF', mixc(top, '#000000', 0.12), cy=0.578, w=0.21)
                for y in (0.515, 0.478, 0.441):
                    cv.ellipse(0, y, 0.0085, 0.0085, '#FFFFFF'); cv.ellipse(0, y, 0.0032, 0.0032, mixc(top, '#000000', 0.2))
            else:
                cv.rect(-0.11, 0.573, 0.11, 0.6, '#FFFFFF')
        if pat == 'bow':
            if side == 'front':
                peter_pan_collar(cv, '#FFFFFF', mixc(top, '#000000', 0.1), cy=0.578, w=0.21)
                a = colors['accent']
                cv.poly([(0, 0.548), (-0.045, 0.572), (-0.045, 0.524)], a); cv.poly([(0, 0.548), (0.045, 0.572), (0.045, 0.524)], a)
                cv.ellipse(0, 0.548, 0.013, 0.013, mixc(a, '#000000', 0.15))
            else:
                cv.rect(-0.11, 0.573, 0.11, 0.6, '#FFFFFF')
        if pat == 'dots':
            hex_dots(cv, '#FFFFFF', -0.2, 0.2, 0.41, 0.56)
            stripe_y(cv, 0.406, 0.016, colors['trim'])
            if side == 'front':
                peter_pan_collar(cv, '#FFFFFF', mixc(top, '#000000', 0.12), cy=0.578, w=0.21)
                cv.ellipse(0, 0.527, 0.0095, 0.0095, colors['accent'])
            else:
                cv.rect(-0.11, 0.573, 0.11, 0.6, '#FFFFFF')
        cvs.append(cv)
    return bake_planar(size[0], size[1], surf, proj_xyz, cvs[0], cvs[1])


def paint_jacket_torso(spec, colors, size=(2048, 512), ymin=0.358, ymax=0.614, surf=None):
    ppm = size[0] / 0.96
    cvs = []
    for side in ('front', 'back'):
        cv = Canvas(-0.2, 0.2, ymin - 0.004, ymax + 0.004, ppm, JNAVY)
        # knit ribs on the hem band + collar
        for x in np.arange(-0.2, 0.2, 0.0075):
            cv.rect(x, ymin - 0.004, x + 0.0016, 0.397, mixc(JNAVY, '#000000', 0.28))
            cv.rect(x, 0.588, x + 0.0016, ymax + 0.004, mixc(JNAVY, '#000000', 0.28))
        for y in (0.386, 0.376, 0.366):                                                 # hem band: half-height band, 3 thin white stripes
            stripe_y(cv, y, 0.0048, JWHITE)
        for y in (0.6005, 0.6105):                                                      # collar: 2 white stripes
            stripe_y(cv, y, 0.0062, JWHITE)
        cv.rect(-0.3, 0.397, 0.3, 0.399, mixc(JNAVY, '#000000', 0.25))                   # rib / body seam
        if side == 'front':
            cv.stroke([(0, 0.588), (0, 0.434)], 0.0055, JSEAM)                           # centre seam
            for sx in (-1, 1):                                                          # pocket slits (upper part of the lower half)
                cv.stroke([(sx * 0.126, 0.480), (sx * 0.117, 0.428)], 0.0072, JWHITE)
            for y in (0.534, 0.503, 0.472, 0.441, 0.410):                               # snaps (painted)
                cv.ellipse(0, y, 0.0125, 0.0125, '#8E96A8')
                cv.ellipse(0, y, 0.0105, 0.0105, JSNAP)
                cv.soft(-0.003, y + 0.003, 0.007, 0.007, '#FFFFFF', strength=0.9, power=0.8)
                cv.ellipse(0, y, 0.0045, 0.0045, '#B7BDCB')
            cv.paste(IMG_EMBLEM, 0.072, 0.514, 0.066)      # chest emblem: as high as the chin allows
        else:
            bw = 0.225; cv.paste(IMG_BACK, 0, 0.490, bw)
        cvs.append(cv)
    return bake_planar(size[0], size[1], surf, proj_xyz, cvs[0], cvs[1])


# ------------------------------------------------------------------------------------- sleeves
def arm_canvas(tmax, ppm, bg):
    return Canvas(-0.06, 0.06, -tmax - 0.01, 0.06, ppm, bg)

def paint_casual_arm(spec, colors, surf, p0, d, e1, size=(256, 256)):
    top, skin = colors['top'], colors['skin']
    long = spec.get('long_sleeve'); pat = PATTERN[spec['id']]
    dk = mixc(top, '#000000', 0.16); lt = mixc(top, '#FFFFFF', 0.38)
    ppm = size[0] / 0.27
    cvs = []
    for side in range(2):
        cv = arm_canvas(0.237, ppm, skin)
        if long:
            cv.rect(-0.1, -0.24, 0.1, 0.1, top)
            if pat == 'stripes':
                y = -0.012
                while y > -0.2:
                    cv.rect(-0.1, y - 0.008, 0.1, y + 0.008, lt); y -= 0.044
            cv.rect(-0.1, -0.226, 0.1, -0.2, mixc(top, '#000000', 0.14))              # knit cuff
            for x in np.arange(-0.1, 0.1, 0.007):
                cv.rect(x, -0.226, x + 0.0015, -0.2, mixc(top, '#000000', 0.32))
        else:
            cv.rect(-0.1, -0.1195, 0.1, 0.1, top)                                       # short sleeve
            cv.rect(-0.1, -0.1195, 0.1, -0.1075, dk)                                     # hem band
            if pat == 'polo':
                cv.rect(-0.1, -0.1195, 0.1, -0.1075, mixc(top, '#000000', 0.2))
        cvs.append(cv)
    return bake_planar(size[0], size[1], surf, proj_arm(p0, d, e1), cvs[0], cvs[1])


def paint_jacket_arm(spec, colors, surf, p0, d, e1, which, size=(512, 512)):
    """white sleeve + half-height navy cuff with 3 thin stripes (planar bake), then the patch is painted
    straight onto the OUTER SIDE of the arm in unwrapped texture space (u = 0.5 is the lateral side)."""
    ppm = size[0] / 0.27
    cvs = []
    for side in range(2):
        cv = arm_canvas(0.237, ppm, JWHITE)
        cv.rect(-0.1, -0.24, 0.1, -0.187, JNAVY)                                         # navy knit cuff (half height)
        for x in np.arange(-0.1, 0.1, 0.006):
            cv.rect(x, -0.24, x + 0.0014, -0.19, mixc(JNAVY, '#000000', 0.3))
        for t in (0.1945, 0.2045, 0.2145):
            cv.rect(-0.1, -t - 0.0024, 0.1, -t + 0.0024, JWHITE)
        cv.rect(-0.1, -0.1885, 0.1, -0.1860, mixc(JWHITE, '#000000', 0.12))
        cvs.append(cv)
    img = bake_planar(size[0], size[1], surf, proj_arm(p0, d, e1), cvs[0], cvs[1])
    W, H = size
    circ = 2 * math.pi * 0.0475
    if which == 'L':
        patch = IMG_26; pw = 0.080
    else:
        patch = IMG_H; pw = 0.072
    ph = pw * patch.height / patch.width
    tc = ARM_PATCH_T                                           # distance from the shoulder joint (m)
    cx = 0.5 * W
    cy = (tc - surf.tmin) / (surf.tmax - surf.tmin) * H       # row 0 = shoulder
    pxw = max(int(pw / circ * W), 2); pxh = max(int(ph / (surf.tmax - surf.tmin) * H), 2)
    p = patch.convert('RGBA').resize((pxw, pxh), Image.LANCZOS)
    img = img.convert('RGBA'); img.alpha_composite(p, (int(cx - pxw / 2), int(cy - pxh / 2)))
    return img.convert('RGB')


# ------------------------------------------------------------------------------------- legs, pants, skirt, shoes
def paint_leg(spec, colors, surf, p0, d, e1, size=(256, 256)):
    st = spec['style']; skin = colors['skin']
    base = colors['bottom'] if st == 'pants' else skin
    ppm = size[0] / 0.27
    cvs = []
    for side in range(2):
        cv = Canvas(-0.06, 0.06, -0.235, 0.06, ppm, base)
        if st == 'pants':
            dk = mixc(base, '#000000', 0.18)
            cv.rect(-0.1, -0.19, 0.1, -0.17, mixc(base, '#000000', 0.10))             # turn-up cuff
            cv.stroke([(-0.1, -0.17), (0.1, -0.17)], 0.0028, dk)
            cv.stroke([(0, 0.0), (0, -0.17)], 0.0022, mixc(base, '#FFFFFF', 0.12))      # front crease
            if side == 0 and spec.get('id') == 'male_02_curly':
                pass
        if spec.get('socks'):
            sock = '#FFFFFF'; acc = colors['accent']
            cv.rect(-0.1, -0.215, 0.1, -0.138, sock)
            cv.rect(-0.1, -0.152, 0.1, -0.138, acc)
            cv.rect(-0.1, -0.1685, 0.1, -0.162, acc)
            for x in np.arange(-0.1, 0.1, 0.0065):
                cv.rect(x, -0.215, x + 0.0013, -0.17, mixc('#FFFFFF', '#000000', 0.10))
        cvs.append(cv)
    return bake_planar(size[0], size[1], surf, proj_arm(p0, d, e1), cvs[0], cvs[1])


def paint_hip(spec, colors, surf, size=(1024, 128)):
    base = colors['bottom']; trim = colors['trim']; dk = mixc(base, '#000000', 0.2)
    ppm = size[0] / 0.86
    cvs = []
    for side in ('front', 'back'):
        cv = Canvas(-0.2, 0.2, 0.31, 0.41, ppm, base)
        cv.rect(-0.3, 0.360, 0.3, 0.397, trim)                                           # belt
        cv.stroke([(-0.3, 0.3605), (0.3, 0.3605)], 0.0022, mixc(trim, '#000000', 0.25))
        cv.stroke([(-0.3, 0.3965), (0.3, 0.3965)], 0.0022, mixc(trim, '#FFFFFF', 0.12))
        for sx in (-1, 1):
            for x in (0.055, 0.115):
                cv.rect(sx * x - 0.006, 0.357, sx * x + 0.006, 0.400, mixc(trim, '#000000', 0.18))   # belt loops
        if side == 'front':
            cv.rect(-0.017, 0.3635, 0.017, 0.3935, '#C9CED8'); cv.rect(-0.011, 0.368, 0.011, 0.389, mixc(trim, '#000000', 0.3))
            cv.rect(-0.0015, 0.372, 0.0015, 0.385, '#C9CED8')
            cv.stroke([(0, 0.358), (0, 0.32)], 0.0025, dk)                                # fly seam
            for sx in (-1, 1):
                cv.stroke([(sx * 0.062, 0.358), (sx * 0.082, 0.338), (sx * 0.096, 0.318)], 0.0025, dk)   # pockets
        cvs.append(cv)
    return bake_planar(size[0], size[1], surf, proj_xyz, cvs[0], cvs[1])


def paint_skirt(spec, colors, size=(1024, 256), ymin=0.232, ymax=0.41, dress=False):
    """rotationally uniform detail -> painted straight into unwrapped texture space"""
    base = colors['top'] if dress else colors['bottom']
    W, H = size
    cv = unwrap_canvas(W, H, base)
    def Y(y):   # metres -> pixel (from the bottom)
        return (y - ymin) / (ymax - ymin) * H
    dk = mixc(base, '#000000', 0.16); lt = mixc(base, '#FFFFFF', 0.16)
    n = 28
    for k in range(n):
        x = (k + 0.0) / n * W
        cv.rect(x - 1.5, 0, x + 1.5, H, dk)                                              # pleat folds
        cv.rect(x + 1.5, 0, x + W / n * 0.32, H, mixc(base, '#FFFFFF', 0.07))
    pat = PATTERN[spec['id']]
    if pat == 'dots':
        pitch = W / 40
        for row in range(0, 14):
            y = 14 + row * pitch * 0.62
            for i in range(40):
                x = (i + (0.5 if row % 2 else 0)) * pitch
                cv.ellipse(x, y, W / 180, W / 180, '#FFFFFF')
    hem = '#FFFFFF' if spec['id'] != 'female_03_bun' else '#FFFFFF'
    cv.rect(0, 0, W, Y(ymin + 0.014), hem)
    if pat == 'bow':
        cv.rect(0, Y(ymin + 0.014), W, Y(ymin + 0.019), colors['accent'])
        cv.rect(0, 0, W, Y(ymin + 0.004), '#FFFFFF')
    return cv.img.resize((W, H), Image.LANCZOS)


def lum(h):
    r, g, b = hexc(h)[:3]
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def paint_shoe(spec, colors, surf, size=(512, 256)):
    W, H = size
    u = (np.arange(W) + 0.5) / W
    v = 1.0 - (np.arange(H) + 0.5) / H
    UU, VV = np.meshgrid(u, v)
    P = surf.xyz(UU, VV)
    n = (P - surf.c) / surf.R                      # unit-sphere coords: n_x side, n_y up, n_z toe
    base = np.array(hexc(colors['shoes'])[:3], float)
    light = lum(colors['shoes']) > 0.8
    sole = np.array(hexc('#CDD2DB' if light else '#F4F1EA')[:3], float)
    lace = np.array(hexc('#B9BEC8' if light else '#FFFFFF')[:3], float)
    dark = base * 0.82
    out = np.broadcast_to(base, (H, W, 3)).copy()
    def sm(x, a, b):
        return np.clip((x - a) / (b - a), 0, 1)
    ny, nx, nz = n[..., 1], n[..., 0], n[..., 2]
    toe = sm(nz, 0.50, 0.53)[..., None] * sm(ny, -0.5, -0.47)[..., None]
    out = out * (1 - toe) + dark * toe
    line = np.exp(-((nz - 0.51) / 0.012) ** 2)[..., None] * (ny > -0.5)[..., None]
    out = out * (1 - 0.5 * line) + base * 0.55 * 0.5 * line
    sol = sm(-ny, 0.50, 0.53)[..., None]
    out = out * (1 - sol) + sole * sol
    edge = np.exp(-((ny + 0.50) / 0.012) ** 2)[..., None]
    out = out * (1 - 0.35 * edge) + (base * 0.5) * 0.35 * edge
    on_top = sm(ny, 0.35, 0.40) * (1 - sm(np.abs(nx), 0.30, 0.34))
    for z0 in (-0.22, -0.02, 0.18):
        bar = np.exp(-((nz - z0) / 0.032) ** 4) * on_top
        out = out * (1 - bar[..., None]) + lace * bar[..., None]
    gap = np.exp(-(((nz + 0.55)) / 0.14) ** 2) * sm(ny, 0.05, 0.3)                      # opening / collar at the back
    out = out * (1 - 0.35 * gap[..., None]) + (base * 0.45) * 0.35 * gap[..., None]
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGB')
