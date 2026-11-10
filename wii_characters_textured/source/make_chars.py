#!/usr/bin/env python3
"""
Original chibi-style 3D characters (3 male / 3 female) -> GLB.
Soft toy-like look: big head, tiny body, flat simple face parts, smooth shading.
Hierarchy per character:  <ID> / Body, Head, ArmL, ArmR, LegL, LegR  (pivots at joints)
Units: meters, +Y up, character faces +Z, ground at y=0.
"""
import math, os, sys, json
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from scipy.interpolate import PchipInterpolator

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT_DIR, exist_ok=True)

# ------------------------------------------------------------------ colour utils
def hex_rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]

def mix(h1, h2, t):
    a = np.array(hex_rgb(h1)); b = np.array(hex_rgb(h2))
    c = (a * (1 - t) + b * t).round().astype(int)
    return '#%02X%02X%02X' % tuple(c)

def darker(h, k):
    return mix(h, '#000000', k)

# ------------------------------------------------------------------ geometry helpers
def clean(m):
    m.update_faces(m.nondegenerate_faces())
    m.remove_unreferenced_vertices()
    return m

def mk(V, F):
    m = trimesh.Trimesh(vertices=np.asarray(V, float), faces=np.asarray(F, int), process=True)
    return clean(m)

_ICO = {}
def _ico(sub):
    if sub not in _ICO:
        m = trimesh.creation.icosphere(subdivisions=sub, radius=1.0)
        _ICO[sub] = (m.vertices.copy(), m.faces.copy())
    return _ICO[sub]

def ellipsoid(c, r, rot=None, sub=3):
    if sub == 3:      # mobile-friendly: everything except the head / tiny puffs one level lower
        sub = 2
    V, F = _ico(sub)
    V = V * np.asarray(r, float)
    if rot is not None:
        V = V @ rot[:3, :3].T
    V = V + np.asarray(c, float)
    return mk(V, F)

def lathe(profile, seg=36, scale=(1, 1, 1), center=(0, 0, 0), rot=None):
    """Surface of revolution around Y. profile = [(r, y), ...]"""
    P = np.asarray(profile, float)
    if P[0, 1] < P[-1, 1]:
        P = P[::-1]
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    ca, sa = np.cos(ang), np.sin(ang)
    V = np.concatenate([np.stack([r * ca, np.full(seg, y), r * sa], 1) for r, y in P])
    F = []
    for i in range(len(P) - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            a = i * seg + j; b = i * seg + j2
            c = (i + 1) * seg + j; d = (i + 1) * seg + j2
            F.append([a, b, c]); F.append([b, d, c])
    V = V * np.asarray(scale, float)
    if rot is not None:
        V = V @ rot[:3, :3].T
    V = V + np.asarray(center, float)
    return mk(V, np.array(F))

def smooth(ctrl, n=30):
    C = np.asarray(ctrl, float)
    t = np.arange(len(C)); tt = np.linspace(0, len(C) - 1, n)
    return np.stack([PchipInterpolator(t, C[:, 0])(tt), PchipInterpolator(t, C[:, 1])(tt)], 1)

def tube(points, radius, sides=8, caps=True):
    P = np.asarray(points, float); n = len(P)
    rad = np.full(n, float(radius)) if np.ndim(radius) == 0 else np.asarray(radius, float)
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    ref = np.array([0, 0, 1.0])
    if abs(T[0] @ ref) > 0.9:
        ref = np.array([0, 1.0, 0])
    N = np.cross(T[0], ref); N /= np.linalg.norm(N)
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    rings = []
    for i in range(n):
        N = N - T[i] * (N @ T[i]); N /= np.linalg.norm(N)
        B = np.cross(T[i], N)
        rings.append(P[i] + rad[i] * (np.cos(ang)[:, None] * N + np.sin(ang)[:, None] * B))
    V = np.concatenate(rings)
    F = []
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            a = i * sides + k; b = (i + 1) * sides + k
            c = i * sides + k2; d = (i + 1) * sides + k2
            F += [[a, c, b], [b, c, d]]
    if caps:
        V = np.vstack([V, P[0], P[-1]])
        s = len(V) - 2; e = len(V) - 1
        last = (n - 1) * sides
        for k in range(sides):
            k2 = (k + 1) % sides
            F.append([s, k2, k])
            F.append([e, last + k, last + k2])
    return mk(V, F)

def ring_tube(R, y, r, scale_z=1.0, n=44, sides=8):
    a = np.linspace(0, 2 * np.pi, n)
    pts = np.stack([R * np.cos(a), np.full(n, y), R * np.sin(a) * scale_z], 1)
    return tube(pts, r, sides=sides, caps=False)

def rot_from_z(n, roll=0.0):
    n = np.asarray(n, float); n = n / np.linalg.norm(n)
    # minimal (twist-free) rotation taking +Z to n
    v = np.cross([0, 0, 1.0], n); c = float(n[2])
    R = np.eye(4)
    if np.linalg.norm(v) > 1e-9:
        vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        R[:3, :3] = np.eye(3) + vx + vx @ vx / (1 + c)
    if roll:
        R = R @ trimesh.transformations.rotation_matrix(roll, [0, 0, 1])
    return R

def capsule_profile(ra, rb, L, n=6):
    pts = []
    for a in np.linspace(np.pi / 2, 0, n):
        pts.append((ra * np.cos(a), ra * np.sin(a)))
    for a in np.linspace(0, -np.pi / 2, n):
        pts.append((rb * np.cos(a), -L + rb * np.sin(a)))
    return pts

def limb(p0, p1, ra, rb, seg=16):
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float)
    L = np.linalg.norm(p1 - p0); d = (p1 - p0) / L
    R = trimesh.geometry.align_vectors([0, -1, 0], d)
    return lathe(capsule_profile(ra, rb, L), seg=seg, rot=R, center=p0)

def cone(base, direction, r, h, seg=14):
    d = np.asarray(direction, float); d /= np.linalg.norm(d)
    R = trimesh.geometry.align_vectors([0, 1, 0], d)
    prof = [(0, h), (r * 0.5, h * 0.55), (r, 0), (0, 0)]
    return lathe(prof, seg=seg, rot=R, center=base)

# ------------------------------------------------------------------ head surface
HR = np.array([0.27, 0.285, 0.26])      # head radii
HC = np.array([0.0, 0.82, 0.0])         # head centre (world)
NECK = np.array([0.0, 0.56, 0.0])       # head pivot

def hs(x, y, off=0.0):
    """point + normal on head surface at face coords (x,y) with outward offset"""
    q = max(1 - (x / HR[0]) ** 2 - (y / HR[1]) ** 2, 0.0)
    z = HR[2] * math.sqrt(q)
    n = np.array([x / HR[0] ** 2, y / HR[1] ** 2, z / HR[2] ** 2]); n /= np.linalg.norm(n)
    return HC + np.array([x, y, z]) + n * off, n

def surf(th, ph, off=1.0):
    """point + normal on (scaled) head ellipsoid, th from top, ph=0 front"""
    R = HR * off
    p = np.array([R[0] * math.sin(th) * math.sin(ph), R[1] * math.cos(th), R[2] * math.sin(th) * math.cos(ph)])
    n = np.array([p[0] / R[0] ** 2, p[1] / R[1] ** 2, p[2] / R[2] ** 2]); n /= np.linalg.norm(n)
    return HC + p, n

def hair_cap(front, side, back, off=1.07, nth=20, nph=56, extra=None, inner=0.985):
    def thmax(ph):
        s = np.abs(((ph + np.pi) % (2 * np.pi)) - np.pi)
        f = np.where(s < np.pi / 2,
                     front + (side - front) * np.sin(s) ** 2,
                     side + (back - side) * np.sin(s - np.pi / 2) ** 2)
        if extra is not None:
            f = f + extra(ph)
        return f
    phs = np.linspace(-np.pi, np.pi, nph, endpoint=False)
    tm = thmax(phs)
    def pt(th, ph, o):
        return np.stack([HR[0] * o * np.sin(th) * np.sin(ph),
                         HR[1] * o * np.cos(th),
                         HR[2] * o * np.sin(th) * np.cos(ph)], -1) + HC
    rows = [pt(t * tm, phs, off) for t in np.linspace(0, 1, nth + 1)]
    rows.append(pt(tm, phs, inner))
    V = np.concatenate(rows)
    F = []
    for i in range(nth):
        for j in range(nph):
            j2 = (j + 1) % nph
            a = i * nph + j; b = (i + 1) * nph + j; c = i * nph + j2; d = (i + 1) * nph + j2
            F += [[a, b, c], [b, d, c]]
    for j in range(nph):
        j2 = (j + 1) % nph
        O = nth * nph + j; O2 = nth * nph + j2
        I = (nth + 1) * nph + j; I2 = (nth + 1) * nph + j2
        F += [[O, I, O2], [O2, I, I2]]
    return mk(V, F)

# ------------------------------------------------------------------ rig / scene assembly
ROUGH = dict(skin=0.62, hair=0.5, eye=0.2, eye_hi=0.1, brow=0.6, mouth=0.5, mouth_in=0.5,
             teeth=0.4, nose=0.62, blush=0.7, glasses=0.35, top=0.85, bottom=0.85,
             trim=0.8, shoes=0.6, sock=0.9, accent=0.5, mustache=0.7)

class Rig:
    def __init__(self, scene, cid, origin, colors):
        self.scene, self.cid, self.colors = scene, cid, colors
        self.pivots, self.geo = {}, {}
        T = trimesh.transformations.translation_matrix(origin)
        scene.graph.update(frame_to=cid, frame_from=scene.graph.base_frame, matrix=T)

    def part(self, name, pivot):
        self.pivots[name] = np.asarray(pivot, float)
        self.geo[name] = {}
        T = trimesh.transformations.translation_matrix(pivot)
        self.scene.graph.update(frame_to=f"{self.cid}_{name}", frame_from=self.cid, matrix=T)

    def add(self, part, role, mesh):
        self.geo[part].setdefault(role, []).append(mesh)

    def flush(self):
        for part, roles in self.geo.items():
            for role, meshes in roles.items():
                M = trimesh.util.concatenate(meshes)
                M.apply_translation(-self.pivots[part])
                c = hex_rgb(self.colors[role])
                mat = PBRMaterial(name=f"{self.cid}_{role}", baseColorFactor=c + [255],
                                  metallicFactor=0.0, roughnessFactor=ROUGH.get(role, 0.6))
                M.visual = trimesh.visual.TextureVisuals(material=mat)
                name = f"{self.cid}_{part}_{role}"
                self.scene.add_geometry(M, node_name=name, geom_name=name,
                                        parent_node_name=f"{self.cid}_{part}")

# ------------------------------------------------------------------ face
def build_face(add, spec):
    ex = 0.095; ey = spec.get('eye_y', -0.005)
    kind = spec['eyes']
    for sx in (-1, 1):
        x = sx * ex
        if kind in ('oval', 'dot'):
            p, n = hs(x, ey, off=-0.004); R = rot_from_z(n)
            radii = (0.026, 0.040, 0.016) if kind == 'oval' else (0.031, 0.034, 0.016)
            add('eye', ellipsoid(p, radii, rot=R))
            hi = p + R[:3, :3] @ np.array([0.009, 0.015, 0.012])
            add('eye_hi', ellipsoid(hi, (0.0085,) * 3, sub=2))
        else:  # happy arc
            pts = [hs(x + 0.045 * t, ey + 0.004 + 0.028 * (1 - t * t), off=0.003)[0]
                   for t in np.linspace(-1, 1, 9)]
            add('eye', tube(pts, 0.0095))
        if spec.get('lashes'):
            for dy, ang in ((0.02, 0.0), (0.005, -0.5)):
                x0 = x + sx * 0.026
                pts = [hs(x0 + sx * 0.022 * t, ey + 0.036 + dy * 0.0 + 0.020 * t + dy, off=0.004)[0]
                       for t in np.linspace(0, 1, 4)]
                add('eye', tube(pts, [0.008, 0.007, 0.005, 0.002], sides=6))
    # eyebrows
    by = ey + 0.062; tilt = spec.get('brow_tilt', 0.0); br = spec.get('brow_r', 0.0105)
    taper = np.array([.55, .85, 1, 1, 1, .85, .55])
    for sx in (-1, 1):
        x = sx * ex
        pts = [hs(x + 0.04 * t, by + 0.006 * (1 - t * t) + tilt * 0.02 * (t * sx), off=0.003)[0]
               for t in np.linspace(-1, 1, 7)]
        add('brow', tube(pts, br * taper))
    # nose
    p, n = hs(0, -0.062, off=0.002)
    add('nose', ellipsoid(p, (0.024, 0.02, 0.026), rot=rot_from_z(n), sub=3))
    # blush
    for sx in (-1, 1):
        p, n = hs(sx * 0.15, -0.088, off=-0.007)
        add('blush', ellipsoid(p, (0.05, 0.03, 0.012), rot=rot_from_z(n), sub=3))
    # mouth
    my = -0.125; ms = spec['mouth']
    if ms == 'smile':
        pts = [hs(0.075 * t, my + 0.03 * (t * t - 1) + 0.012, off=0.003)[0] for t in np.linspace(-1, 1, 11)]
        add('mouth', tube(pts, [0.006, 0.008, 0.009, 0.0095, 0.01, 0.01, 0.01, 0.0095, 0.009, 0.008, 0.006]))
    elif ms == 'smirk':
        pts = [hs(0.07 * t, my + 0.02 * (t * t - 1) + 0.018 * t + 0.006, off=0.003)[0] for t in np.linspace(-1, 1, 11)]
        add('mouth', tube(pts, 0.0095))
    elif ms == 'open':
        p, n = hs(0, my - 0.004, off=-0.006); R = rot_from_z(n)
        add('mouth_in', ellipsoid(p, (0.066, 0.042, 0.016), rot=R, sub=3))
        tp = p + R[:3, :3] @ np.array([0, 0.021, 0.004])
        add('teeth', ellipsoid(tp, (0.052, 0.015, 0.014), rot=R, sub=3))
    elif ms == 'o':
        p, n = hs(0, my - 0.005, off=-0.005)
        add('mouth_in', ellipsoid(p, (0.02, 0.026, 0.014), rot=rot_from_z(n), sub=3))
    # glasses
    if spec.get('glasses'):
        gz = 0.024; rr = 0.074
        a = np.linspace(0, 2 * np.pi, 40)
        for sx in (-1, 1):
            p, n = hs(sx * ex, ey, off=gz); R = rot_from_z(n)
            circ = np.stack([rr * np.cos(a), rr * np.sin(a), np.zeros_like(a)], 1) @ R[:3, :3].T + p
            add('glasses', tube(circ, 0.0075, sides=8, caps=False))
            # temple arm
            pts = [hs(sx * 0.167, ey + 0.005, off=gz)[0], hs(sx * 0.235, ey + 0.005, off=0.02)[0],
                   HC + np.array([sx * 0.27, ey, -0.015])]
            add('glasses', tube(pts, 0.0065, sides=6))
        bridge = [hs(-0.025, ey + 0.012, off=gz)[0], hs(0, ey + 0.03, off=gz + 0.003)[0], hs(0.025, ey + 0.012, off=gz)[0]]
        add('glasses', tube(bridge, 0.0065, sides=6))
    # moustache
    if spec.get('mustache'):
        for sx in (-1, 1):
            p, n = hs(sx * 0.036, -0.092, off=-0.002)
            R = rot_from_z(n, roll=sx * -0.28)
            add('mustache', ellipsoid(p, (0.046, 0.017, 0.02), rot=R, sub=3))
    # ears
    for sx in (-1, 1):
        add('skin', ellipsoid(HC + np.array([sx * 0.262, -0.012, -0.01]), (0.03, 0.05, 0.04)))

# ------------------------------------------------------------------ hairstyles
def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi

def hair_spiky(add):
    add('hair', hair_cap(0.92, 1.38, 1.95, off=1.065))
    for ph in np.linspace(-0.95, 0.95, 7):
        p, n = surf(0.93, ph, 1.055)
        d = n * 0.5 + np.array([0, -0.55, 0.45]); d /= np.linalg.norm(d)
        add('hair', cone(p - n * 0.012, d, 0.042, 0.095))
    for k in range(8):
        p, n = surf(0.58, 2 * np.pi * k / 8, 1.06)
        add('hair', cone(p - n * 0.012, n, 0.052, 0.10))
    for ph in (0.0, 2.0, -2.0):
        p, n = surf(0.22, ph, 1.06)
        add('hair', cone(p - n * 0.012, n, 0.05, 0.10))
    for ph in (2.6, -2.6, 3.14):
        p, n = surf(1.15, ph, 1.06)
        d = n + np.array([0, -0.2, -0.4]); d /= np.linalg.norm(d)
        add('hair', cone(p - n * 0.012, d, 0.05, 0.09))

def hair_curly(add):
    add('hair', hair_cap(1.0, 1.4, 2.0, off=1.09))
    rng = np.random.default_rng(7)
    def ring(th, n, skip=0.0, rr=0.062):
        for k in range(n):
            ph = wrap(2 * np.pi * k / n + 0.2)
            if abs(ph) < skip:
                continue
            p, nn = surf(th, ph, 1.085)
            add('hair', ellipsoid(p, (rr * rng.uniform(.92, 1.1),) * 3, sub=2))
    ring(0.0001, 1, rr=0.075)
    ring(0.32, 5, rr=0.075)
    ring(0.68, 9, rr=0.07)
    ring(1.0, 13, skip=0.45, rr=0.066)
    ring(1.32, 13, skip=1.2, rr=0.06)
    ring(1.62, 11, skip=1.6, rr=0.055)

def hair_gray(add):
    add('hair', hair_cap(0.66, 1.30, 1.85, off=1.05))
    for ph in (-1.05, 1.05):
        p, n = surf(1.12, ph, 1.04)
        add('hair', ellipsoid(p, (0.04, 0.06, 0.05), rot=rot_from_z(n), sub=2))

def hair_long(add):
    dip = lambda ph: 0.30 * np.exp(-((ph + 0.55) / 0.45) ** 2) + 0.12 * np.exp(-((ph - 0.7) / 0.5) ** 2)
    add('hair', hair_cap(0.88, 1.5, 2.2, off=1.07, extra=dip))
    add('hair', ellipsoid(HC + np.array([0, -0.30, -0.15]), (0.27, 0.32, 0.112), sub=4))

def hair_twintails(add, accent):
    add('hair', hair_cap(0.95, 1.32, 1.9, off=1.07))
    prof = smooth([(0.0, 0.0), (0.05, -0.012), (0.078, -0.09), (0.062, -0.2), (0.03, -0.30), (0.0, -0.345)], 24)
    for sx in (-1, 1):
        R = trimesh.transformations.rotation_matrix(sx * 0.30, [0, 0, 1])
        base = HC + np.array([sx * 0.262, 0.18, -0.03])
        add('hair', lathe(prof, seg=26, rot=R, center=base))
        add('accent', ellipsoid(base + np.array([sx * 0.0, 0.0, 0.0]), (0.05, 0.036, 0.05), sub=3))

def hair_bun(add, accent):
    add('hair', hair_cap(0.9, 1.4, 2.0, off=1.07))
    add('hair', ellipsoid(HC + np.array([0, HR[1] * 1.03 + 0.04, -0.07]), (0.098, 0.088, 0.098), sub=3))
    # flower
    p, n = surf(0.95, -1.15, 1.085)
    R = rot_from_z(n); u, v = R[:3, 0], R[:3, 1]
    for k in range(5):
        a = 2 * np.pi * k / 5
        add('accent', ellipsoid(p + (np.cos(a) * u + np.sin(a) * v) * 0.036 + n * 0.012, (0.03, 0.03, 0.022), rot=R, sub=2))
    add('accent_c', ellipsoid(p + n * 0.02, (0.022, 0.022, 0.02), rot=R, sub=2))

# ------------------------------------------------------------------ body
def build_body(rig, spec):
    add = lambda part, role, m: rig.add(part, role, m)
    # torso
    prof = list(smooth([(0.0, 0.610), (0.075, 0.604), (0.125, 0.585), (0.152, 0.55), (0.158, 0.50),
                        (0.150, 0.44), (0.146, 0.395)], 18)) + [(0.0, 0.395)]
    add('Body', 'top', lathe(prof, seg=32, scale=(1, 1, 0.78)))
    st = spec['style']
    if st == 'dress':
        sk = list(smooth([(0.13, 0.41), (0.15, 0.38), (0.185, 0.31), (0.225, 0.24)], 12)) + [(0.205, 0.232), (0.0, 0.232)]
        add('Body', 'top', lathe(sk, seg=32, scale=(1, 1, 0.86)))
        add('Body', 'trim', ring_tube(0.151, 0.405, 0.0145, 0.78))
    elif st == 'skirt':
        sk = list(smooth([(0.13, 0.41), (0.16, 0.36), (0.205, 0.30)], 10)) + [(0.19, 0.292), (0.0, 0.292)]
        add('Body', 'bottom', lathe(sk, seg=32, scale=(1, 1, 0.86)))
    else:  # pants
        hip = [(0.0, 0.40), (0.141, 0.40), (0.139, 0.36), (0.128, 0.325), (0.0, 0.318)]
        add('Body', 'bottom', lathe(hip, seg=36, scale=(1, 1, 0.82)))
        add('Body', 'trim', ring_tube(0.149, 0.397, 0.012, 0.78))
    if spec.get('collar'):
        add('Body', 'trim', ring_tube(0.095, 0.598, 0.02, 0.78))
    # arms
    for sx, nm in ((1, 'ArmL'), (-1, 'ArmR')):
        S = np.array([sx * 0.152, 0.555, 0.0])
        d = np.array([sx * math.sin(0.32), -math.cos(0.32), 0.0])
        add(nm, 'top', limb(S, S + d * 0.12, 0.043, 0.040))
        fore = 'top' if spec.get('long_sleeve') else 'skin'
        add(nm, fore, limb(S + d * 0.115, S + d * 0.225, 0.038, 0.036))
        add(nm, 'skin', ellipsoid(S + d * 0.255, (0.05, 0.052, 0.048), sub=3))
    # legs + shoes
    for sx, nm in ((1, 'LegL'), (-1, 'LegR')):
        x = sx * 0.075
        lcol = 'bottom' if st == 'pants' else 'skin'
        add(nm, lcol, limb([x, 0.30, 0], [x, 0.10, 0], 0.044, 0.041))
        if spec.get('socks'):
            add(nm, 'sock', limb([x, 0.165, 0], [x, 0.085, 0], 0.0475, 0.0475))
        add(nm, 'shoes', ellipsoid([x, 0.045, 0.022], (0.057, 0.047, 0.088), sub=3))

# ------------------------------------------------------------------ characters
CHARS = [
    dict(id='male_01_spiky', skin='#F4C9A3', hair='#2A2220', top='#2F80ED', bottom='#3A3F4B', shoes='#F5F5F5',
         trim='#1F2937', style='pants', hairstyle='spiky', eyes='dot', mouth='open', brow_r=0.0125, brow_tilt=-0.1),
    dict(id='male_02_curly', skin='#A66B43', hair='#4B2E1E', top='#4CAF50', bottom='#C8A66B', shoes='#7B4B2A',
         trim='#8B6B3E', style='pants', hairstyle='curly', eyes='oval', mouth='smile', glasses=True,
         long_sleeve=True, brow_r=0.011, glasses_col='#1F2937'),
    dict(id='male_03_moustache', skin='#E0AC82', hair='#C9C9D1', top='#F2994A', bottom='#2D3A5F', shoes='#3B2F2F',
         trim='#3B2F2F', style='pants', hairstyle='gray', eyes='oval', mouth='smirk', mustache=True,
         brow_r=0.013, brow_tilt=-0.2, eye_y=-0.01),
    dict(id='female_01_longhair', skin='#F8D5B8', hair='#1B1B1F', top='#E53935', bottom='#E53935', shoes='#7A1F1F',
         trim='#FFFFFF', style='dress', hairstyle='long', eyes='oval', mouth='smile', lashes=True,
         brow_r=0.0085, sock_col='#FFFFFF'),
    dict(id='female_02_twintails', skin='#F2C2A0', hair='#C58B4B', top='#FF8FB8', bottom='#7E57C2', shoes='#FFFFFF',
         trim='#FFFFFF', style='skirt', hairstyle='twintails', eyes='arc', mouth='open', socks=True,
         brow_r=0.0085, accent='#FF4081'),
    dict(id='female_03_bun', skin='#8D5A3A', hair='#F2D16B', top='#26A69A', bottom='#26A69A', shoes='#8D6E63',
         trim='#FFFFFF', style='dress', hairstyle='bun', eyes='dot', mouth='smile', collar=True, socks=True,
         brow_r=0.0085, accent='#FF6F91'),
]

def colors_for(spec):
    skin = spec['skin']; hair = spec['hair']
    return dict(
        skin=skin, hair=hair, brow=darker(hair, 0.25) if spec['id'] != 'male_03_moustache' else '#8E8E96',
        eye='#1A1A22', eye_hi='#FFFFFF', mouth='#8B3A3A', mouth_in='#5A1E26', teeth='#FFFFFF',
        nose=mix(skin, '#B5654A', 0.25), blush=mix(skin, '#FF7F8F', 0.45),
        glasses=spec.get('glasses_col', '#1F2937'), top=spec['top'], bottom=spec['bottom'],
        trim=spec['trim'], shoes=spec['shoes'], sock='#FFFFFF', accent=spec.get('accent', '#FF4081'),
        accent_c='#FFD54F', mustache='#A8A8B0',
    )

def build_character(scene, spec, origin=(0, 0, 0)):
    cid = spec['id']
    rig = Rig(scene, cid, origin, colors_for(spec))
    rig.part('Body', (0, 0, 0))
    rig.part('Head', NECK)
    rig.part('ArmL', (0.152, 0.555, 0)); rig.part('ArmR', (-0.152, 0.555, 0))
    rig.part('LegL', (0.075, 0.30, 0)); rig.part('LegR', (-0.075, 0.30, 0))
    build_body(rig, spec)
    hadd = lambda role, m: rig.add('Head', role, m)
    hadd('skin', ellipsoid(HC, HR, sub=4))
    build_face(hadd, spec)
    hs_ = spec['hairstyle']
    if hs_ == 'spiky': hair_spiky(hadd)
    elif hs_ == 'curly': hair_curly(hadd)
    elif hs_ == 'gray': hair_gray(hadd)
    elif hs_ == 'long': hair_long(hadd)
    elif hs_ == 'twintails': hair_twintails(hadd, spec.get('accent'))
    elif hs_ == 'bun': hair_bun(hadd, spec.get('accent'))
    rig.flush()
    return rig

def sanity(scene):
    bad = []
    tris = 0
    for name, g in scene.geometry.items():
        tris += len(g.faces)
        if g.is_watertight and g.volume < 0:
            bad.append(name)
    return tris, bad

if __name__ == '__main__':
    for spec in CHARS:
        sc = trimesh.Scene()
        build_character(sc, spec)
        tris, bad = sanity(sc)
        path = os.path.join(OUT_DIR, spec['id'] + '.glb')
        sc.export(path, file_type='glb', include_normals=True)
        print(f"{spec['id']:24s} tris={tris:6d}  inverted={bad}  size={os.path.getsize(path)/1024:.0f}KB")
    # lineup
    sc = trimesh.Scene()
    for i, spec in enumerate(CHARS):
        build_character(sc, spec, origin=((i - 2.5) * 0.78, 0, 0))
    path = os.path.join(OUT_DIR, 'lineup_all.glb')
    sc.export(path, file_type='glb', include_normals=True)
    print('lineup', os.path.getsize(path) / 1024, 'KB')
