#!/usr/bin/env python3
"""Paint the Mii-style face as an image (planar front view of the head, metres relative to the head centre)."""
import math
import numpy as np
from PIL import Image
from texlib import Canvas, hexc, SS

FACE_PX = 1024
FACE_PPM = 1750.0                                  # pixels per metre  -> 1024 px = 0.585 m
FACE_HALF = FACE_PX / FACE_PPM / 2


def mixc(a, b, t):
    A = np.array(hexc(a)[:3], float); B = np.array(hexc(b)[:3], float)
    c = (A * (1 - t) + B * t).round().astype(int)
    return '#%02X%02X%02X' % tuple(c)


def paint_face(spec, colors):
    skin = colors['skin']
    cv = Canvas(-FACE_HALF, FACE_HALF, -FACE_HALF, FACE_HALF, FACE_PPM, skin)
    ex = 0.095; ey = spec.get('eye_y', -0.005)
    ink = colors['eye']; kind = spec['eyes']

    # --- soft shading first (under everything else) -------------------------------------------------
    cv.soft(0, 0.215, 0.20, 0.07, mixc(skin, '#7A4B35', 0.5), strength=0.30)          # forehead under the hairline
    cv.soft(0, -0.255, 0.16, 0.06, mixc(skin, '#7A4B35', 0.5), strength=0.28)         # under the chin
    for sx in (-1, 1):
        cv.soft(sx * 0.15, -0.088, 0.058, 0.034, colors['blush'], strength=0.85, power=1.1)   # blush
        cv.soft(sx * 0.15, -0.088, 0.032, 0.018, mixc(colors['blush'], '#FF5E7A', 0.4), strength=0.35, power=1.2)

    # --- eyes ------------------------------------------------------------------------------------------
    for sx in (-1, 1):
        x = sx * ex
        if kind in ('oval', 'dot'):
            rx, ry = (0.026, 0.040) if kind == 'oval' else (0.031, 0.034)
            cv.ellipse(x, ey, rx, ry, ink)
            cv.soft(x, ey - ry * 0.45, rx * 0.95, ry * 0.55, '#3A4A7A', strength=0.45, power=1.2)   # lower iris glow
            cv.ellipse(x + 0.0095, ey + 0.0155, 0.0088, 0.0088, '#FFFFFF')
            cv.ellipse(x - 0.0075, ey - 0.0165, 0.0042, 0.0042, '#FFFFFF')
        else:   # happy ^ ^ arc
            pts = [(x + 0.045 * t, ey + 0.004 + 0.028 * (1 - t * t)) for t in np.linspace(-1, 1, 14)]
            cv.stroke(pts, [0.012, 0.016, 0.019, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.019, 0.016, 0.012, 0.009][:len(pts)], ink)
        if spec.get('lashes'):
            cv.stroke([(x + sx * 0.020, ey + 0.032), (x + sx * 0.038, ey + 0.044), (x + sx * 0.058, ey + 0.047)],
                      [0.016, 0.011, 0.004], ink)
            cv.stroke([(x + sx * 0.025, ey + 0.012), (x + sx * 0.043, ey + 0.017), (x + sx * 0.060, ey + 0.012)],
                      [0.013, 0.009, 0.004], ink)

    # --- eyebrows -----------------------------------------------------------------------------------------
    by = ey + 0.062; tilt = spec.get('brow_tilt', 0.0); br = spec.get('brow_r', 0.0105)
    taper = np.array([.55, .85, 1, 1, 1, .85, .55])
    for sx in (-1, 1):
        x = sx * ex
        pts = [(x + 0.04 * t, by + 0.006 * (1 - t * t) + tilt * 0.02 * (t * sx)) for t in np.linspace(-1, 1, 7)]
        cv.stroke(pts, 2 * br * taper, colors['brow'])

    # --- nose (painted shading, no geometry) -----------------------------------------------------------------
    cv.soft(0, -0.058, 0.026, 0.022, colors['nose'], strength=0.9, power=0.9)
    cv.soft(-0.004, -0.050, 0.010, 0.008, mixc(skin, '#FFFFFF', 0.55), strength=0.7, power=1.0)   # nose-tip highlight

    # --- mouth -------------------------------------------------------------------------------------------------
    my = -0.125; ms = spec['mouth']
    if ms == 'smile':
        pts = [(0.075 * t, my + 0.03 * (t * t - 1) + 0.012) for t in np.linspace(-1, 1, 11)]
        cv.stroke(pts, [0.012, 0.016, 0.018, 0.019, 0.02, 0.02, 0.02, 0.019, 0.018, 0.016, 0.012], colors['mouth'])
    elif ms == 'smirk':
        pts = [(0.07 * t, my - 0.012 + 0.02 * (t * t - 1) + 0.018 * t + 0.006) for t in np.linspace(-1, 1, 11)]
        cv.stroke(pts, 0.019, colors['mouth'])
    elif ms == 'open':
        cx, cy, rx, ry = 0, my - 0.004, 0.066, 0.042
        cv.ellipse(cx, cy, rx, ry, colors['mouth_in'])
        cv.soft(0, cy - 0.020, 0.034, 0.016, '#E8707F', strength=0.95, power=0.7)               # tongue
        # teeth: a white band hugging the top edge of the mouth
        ys = np.linspace(cy + 0.006, cy + 0.037, 12)
        for yy in ys:
            hw = rx * math.sqrt(max(1 - ((yy - cy) / ry) ** 2, 0)) * 0.82
            cv.rect(-hw, yy, hw, yy + 0.003, '#FFFFFF')
        cv.ellipse(cx, cy, rx, ry, (0, 0, 0, 0), outline=colors['mouth'], ow=0.004)
    elif ms == 'o':
        cv.ellipse(0, my - 0.005, 0.02, 0.026, colors['mouth_in'])

    # --- glasses -------------------------------------------------------------------------------------------------
    if spec.get('glasses'):
        gc = colors['glasses']; rr = 0.074; a = np.linspace(0, 2 * np.pi, 60)
        for sx in (-1, 1):
            cx = sx * ex
            cv.ellipse(cx, ey, rr, rr, (255, 255, 255, 34))                                      # faint lens
            cv.stroke([(cx + rr * math.cos(t), ey + rr * math.sin(t)) for t in a], 0.015, gc)
            cv.stroke([(cx + rr * 0.78 * math.cos(t), ey + rr * 0.78 * math.sin(t)) for t in np.linspace(2.0, 2.8, 8)],
                      0.006, (255, 255, 255, 150))                                               # lens glint
            cv.stroke([(sx * 0.169, ey + 0.005), (sx * 0.20, ey + 0.006), (sx * 0.236, ey + 0.005)], 0.013, gc)
        cv.stroke([(-0.022, ey + 0.012), (0, ey + 0.028), (0.022, ey + 0.012)], 0.013, gc)

    # --- moustache -----------------------------------------------------------------------------------------------
    if spec.get('mustache'):
        mc = colors['mustache']; dark = mixc(mc, '#000000', 0.3)
        w = np.array([0.020, 0.034, 0.040, 0.034, 0.022, 0.009])
        for sx in (-1, 1):
            pts = [(sx * 0.0, -0.082), (sx * 0.020, -0.088), (sx * 0.045, -0.096), (sx * 0.068, -0.101),
                   (sx * 0.086, -0.099), (sx * 0.096, -0.091)]
            cv.stroke(pts, w + 0.006, dark)
        for sx in (-1, 1):
            pts = [(sx * 0.0, -0.082), (sx * 0.020, -0.088), (sx * 0.045, -0.096), (sx * 0.068, -0.101),
                   (sx * 0.086, -0.099), (sx * 0.096, -0.091)]
            cv.stroke(pts, w, mc)
            cv.stroke([(sx * 0.012, -0.079), (sx * 0.04, -0.088), (sx * 0.065, -0.094)], 0.006, mixc(mc, '#FFFFFF', 0.45))
    return cv.array()


def face_texture(spec, colors):
    arr = paint_face(spec, colors)
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), 'RGB')


def head_uv(x, y):
    """planar front UV for face-plane coords (metres from the head centre)"""
    return 0.5 + x * FACE_PPM / FACE_PX, 0.5 + y * FACE_PPM / FACE_PX
