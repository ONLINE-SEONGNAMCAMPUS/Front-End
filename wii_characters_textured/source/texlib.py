#!/usr/bin/env python3
"""
UV-mapped parametric surfaces + texture baking helpers.

Idea: every body part is a CLEAN mesh with a UV layout (u = around, v = along).
All detail (eyes, stripes, buttons, emblem ...) is PAINTED as images and baked into the
part's baseColorTexture - no extra geometry.

Design images are drawn in a flat "view space" (x to the viewer's right, y up, metres) with
Pillow at 2x supersampling, then projected onto the surface (planar projection, front and back)
when the texture is baked.  Rotationally uniform detail (pleats, ribs ...) is painted directly in
unwrapped texture space.
"""
import math
import numpy as np
import trimesh
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates
from trimesh.visual.material import PBRMaterial


# ---------------------------------------------------------------------------- surface -> mesh
def grid_mesh(P, vv, wrap=True):
    """P: (nv, nu, 3) positions on a parametric grid (last column duplicates the first if wrap).
    vv: (nv,) v-values for the rows.  u = column / (nu-1).
    Returns (vertices, faces, normals, uv) with smooth analytic-ish normals and outward winding."""
    nv, nu, _ = P.shape
    # tangent along u (periodic if wrap)
    if wrap:
        core = P[:, :-1]
        du = np.roll(core, -1, axis=1) - np.roll(core, 1, axis=1)
        du = np.concatenate([du, du[:, :1]], axis=1)
    else:
        du = np.gradient(P, axis=1)
    dv = np.gradient(P, axis=0)
    n = np.cross(du, dv)
    ln = np.linalg.norm(n, axis=2, keepdims=True)
    bad = (ln[..., 0] < 1e-12)
    n = n / np.maximum(ln, 1e-12)
    # degenerate (pole) rows: borrow the mean normal of the nearest healthy row
    for j in range(nv):
        if bad[j].all():
            k = j + 1 if j == 0 else j - 1
            while bad[k].all() and 0 < k < nv - 1:
                k += 1 if j == 0 else -1
            m = n[k].mean(axis=0); m /= np.linalg.norm(m) + 1e-12
            n[j] = m
    # orientation: should point away from the ring centroid
    cen = P.mean(axis=1, keepdims=True)
    outward = ((n * (P - cen)).sum(axis=2))
    flip = outward.sum() < 0
    if flip:
        n = -n
    U = np.linspace(0, 1, nu)
    UV = np.stack([np.broadcast_to(U, (nv, nu)), np.broadcast_to(np.asarray(vv)[:, None], (nv, nu))], axis=2)
    F = []
    for j in range(nv - 1):
        a = j * nu + np.arange(nu - 1); b = a + 1; c = a + nu; d = c + 1
        if flip:
            F += [np.stack([a, c, b], 1), np.stack([b, c, d], 1)]
        else:
            F += [np.stack([a, b, c], 1), np.stack([b, d, c], 1)]
    F = np.concatenate(F)
    V = P.reshape(-1, 3)
    area = np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)
    F = F[area > 1e-10]
    return V, F, n.reshape(-1, 3), UV.reshape(-1, 2)


def make_mesh(V, F, N, UV, image=None, color=None, name='mat', rough=0.8):
    m = trimesh.Trimesh(vertices=V, faces=F, process=False)
    m.vertex_normals = N
    if image is not None:
        mat = PBRMaterial(name=name, baseColorTexture=image.convert('RGB'), baseColorFactor=[255, 255, 255, 255],
                          metallicFactor=0.0, roughnessFactor=rough)
    else:
        mat = PBRMaterial(name=name, baseColorFactor=list(color) + [255], metallicFactor=0.0, roughnessFactor=rough)
    m.visual = trimesh.visual.TextureVisuals(uv=UV, material=mat)
    return m


# ---------------------------------------------------------------------------- surface definitions
class Lathe:
    """Surface of revolution about +Y: r(y) from profile points (top -> bottom), z scaled by zs.
    u = angle/2pi (a = 0 -> +x, a = pi/2 -> +z front), v = (y - ymin)/(ymax - ymin)."""
    def __init__(self, profile, zs=1.0, xs=1.0, seg=48):
        P = np.asarray(profile, float)
        if P[0, 1] < P[-1, 1]:
            P = P[::-1]
        self.r, self.y = P[:, 0], P[:, 1]
        self.ymin, self.ymax = float(self.y.min()), float(self.y.max())
        self.zs, self.xs, self.seg = zs, xs, seg

    def xyz(self, u, v):
        y = self.ymin + v * (self.ymax - self.ymin)
        r = np.interp(y, self.y[::-1], self.r[::-1])
        a = 2 * np.pi * u
        return np.stack([r * np.cos(a) * self.xs, y, r * np.sin(a) * self.zs], axis=-1)

    def mesh_data(self, offset=(0, 0, 0)):
        nu = self.seg + 1
        U = np.linspace(0, 1, nu)
        vv = (self.y - self.ymin) / (self.ymax - self.ymin)
        UU, VV = np.meshgrid(U, vv)
        P = self.xyz(UU, VV) - np.asarray(offset)
        return grid_mesh(P, vv)


class Tube:
    """Capsule-like tube along direction d from p0.  profile = [(t, r), ...] sorted by t (axial distance).
    e_side = lateral axis (perp. to d) used for the angle; front = +Z.
    v = (tmax - t)/(tmax - tmin): v=1 at the start (shoulder / hip), 0 at the end."""
    def __init__(self, p0, d, profile, seg=24, a0=0.0):
        self.a0 = a0
        self.p0 = np.asarray(p0, float); d = np.asarray(d, float); self.d = d / np.linalg.norm(d)
        z = np.array([0, 0, 1.0])
        e1 = np.array([1.0, 0, 0]); e1 = e1 - self.d * (e1 @ self.d); e1 /= np.linalg.norm(e1)
        self.e1, self.e2 = e1, z - self.d * (z @ self.d)
        self.e2 /= np.linalg.norm(self.e2)
        P = np.asarray(profile, float)
        self.t, self.r = P[:, 0], P[:, 1]
        self.tmin, self.tmax = float(self.t.min()), float(self.t.max())
        self.seg = seg

    def xyz(self, u, v):
        t = self.tmax - v * (self.tmax - self.tmin)
        r = np.interp(t, self.t, self.r)
        a = 2 * np.pi * u + self.a0
        c = (-np.cos(a))[..., None] * self.e1 + np.sin(a)[..., None] * self.e2   # a=pi/2 -> front, a increases to +x
        return self.p0 + t[..., None] * self.d + r[..., None] * c

    def mesh_data(self, offset=(0, 0, 0)):
        nu = self.seg + 1
        U = np.linspace(0, 1, nu)
        vv = (self.tmax - self.t) / (self.tmax - self.tmin)
        UU, VV = np.meshgrid(U, vv)
        P = self.xyz(UU, VV) - np.asarray(offset)
        return grid_mesh(P, vv)


def cap_profile(t0, t1, r0, r1, cap0=0.0, cap1=0.0, n=5, mid=()):
    """tube profile from t0..t1, radius r0 -> r1 (+ optional hemispherical-ish end caps of size cap0 / cap1).
    mid = extra [(t, r)] control points."""
    pts = []
    if cap0 > 0:
        for a in np.linspace(math.pi / 2, 0, n, endpoint=False):
            pts.append((t0 - cap0 * math.sin(a), r0 * math.cos(a) if a < math.pi / 2 - 1e-9 else 0.0))
    body = [(t0, r0)] + list(mid) + [(t1, r1)]
    pts += body
    if cap1 > 0:
        for a in np.linspace(0, math.pi / 2, n + 1)[1:]:
            pts.append((t1 + cap1 * math.sin(a), r1 * math.cos(a)))
    P = np.asarray(pts)
    # radius lerp for body between control points is handled by interp in Tube.xyz
    return P


class Ellipsoid:
    """Ellipsoid with the poles on the local Z axis (equirect UV) - used for shoes.
    u = angle around Z, v = latitude along Z (v=1 at +Z / toe)."""
    def __init__(self, c, radii, seg=32, rows=16):
        self.c, self.R, self.seg, self.rows = np.asarray(c, float), np.asarray(radii, float), seg, rows

    def xyz(self, u, v):
        lat = (v - 0.5) * math.pi
        a = 2 * np.pi * u
        return self.c + np.stack([self.R[0] * np.cos(lat) * np.cos(a), self.R[1] * np.cos(lat) * np.sin(a),
                                  self.R[2] * np.sin(lat)], axis=-1)

    def mesh_data(self, offset=(0, 0, 0)):
        nu = self.seg + 1
        U = np.linspace(0, 1, nu)
        vv = np.linspace(0, 1, self.rows + 1)
        UU, VV = np.meshgrid(U, vv)
        P = self.xyz(UU, VV) - np.asarray(offset)
        return grid_mesh(P, vv)


# ---------------------------------------------------------------------------- canvases
SS = 2   # drawing super-sampling

def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Canvas:
    """Flat design space.  x to the right, y up, in metres.  Pillow drawing at SS x supersampling."""
    def __init__(self, xmin, xmax, ymin, ymax, ppm, bg):
        self.xmin, self.ymax, self.ppm = xmin, ymax, ppm
        self.w = int(round((xmax - xmin) * ppm)); self.h = int(round((ymax - ymin) * ppm))
        self.img = Image.new('RGB', (self.w * SS, self.h * SS), hexc(bg)[:3] if isinstance(bg, str) else bg[:3])
        self.d = ImageDraw.Draw(self.img, 'RGBA')

    def px(self, x, y):
        return ((x - self.xmin) * self.ppm * SS, (self.ymax - y) * self.ppm * SS)

    def m(self, L):
        return L * self.ppm * SS

    def rect(self, x0, y0, x1, y1, col):
        a = self.px(x0, y1); b = self.px(x1, y0)
        self.d.rectangle([a[0], a[1], b[0], b[1]], fill=hexc(col) if isinstance(col, str) else col)

    def ellipse(self, cx, cy, rx, ry, col, outline=None, ow=0.0):
        a = self.px(cx - rx, cy + ry); b = self.px(cx + rx, cy - ry)
        self.d.ellipse([a[0], a[1], b[0], b[1]], fill=hexc(col) if isinstance(col, str) else col,
                       outline=(hexc(outline) if outline else None), width=int(self.m(ow)) if outline else 0)

    def poly(self, pts, col):
        self.d.polygon([self.px(x, y) for x, y in pts], fill=hexc(col) if isinstance(col, str) else col)

    def stroke(self, pts, w, col):
        """polyline with round caps; w scalar or per-point widths (metres)"""
        pts = np.asarray(pts, float)
        wv = np.full(len(pts), float(w)) if np.ndim(w) == 0 else np.asarray(w, float)
        col = hexc(col) if isinstance(col, str) else col
        # densify
        out = [pts[0]]; ow = [wv[0]]
        for i in range(1, len(pts)):
            seg = np.linalg.norm(pts[i] - pts[i - 1]); n = max(int(seg * self.ppm * SS / 1.0), 1)
            for k in range(1, n + 1):
                t = k / n
                out.append(pts[i - 1] * (1 - t) + pts[i] * t); ow.append(wv[i - 1] * (1 - t) + wv[i] * t)
        for p, wi in zip(out, ow):
            c = self.px(*p); r = max(self.m(wi) / 2, 0.5)
            self.d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=col)

    def soft(self, cx, cy, rx, ry, col, strength=0.6, power=1.6, rot=0.0):
        """soft radial gradient blob composited on the canvas (alpha falls off from the centre)"""
        x0, x1 = cx - rx * 1.2, cx + rx * 1.2; y0, y1 = cy - ry * 1.2, cy + ry * 1.2
        a = self.px(x0, y1); b = self.px(x1, y0)
        ix0, iy0, ix1, iy1 = int(a[0]), int(a[1]), int(b[0]), int(b[1])
        X, Y = np.meshgrid(np.arange(ix0, ix1) + 0.5, np.arange(iy0, iy1) + 0.5)
        wx = X / (self.ppm * SS) + self.xmin - cx; wy = self.ymax - Y / (self.ppm * SS) - cy
        if rot:
            c, s = math.cos(rot), math.sin(rot); wx, wy = c * wx + s * wy, -s * wx + c * wy
        dd = np.sqrt((wx / rx) ** 2 + (wy / ry) ** 2)
        al = np.clip(1 - dd, 0, 1) ** power * strength
        layer = np.zeros(al.shape + (4,), np.uint8)
        layer[..., :3] = hexc(col)[:3]; layer[..., 3] = (al * 255).astype(np.uint8)
        L = Image.fromarray(layer, 'RGBA')
        if ix0 >= 0 and iy0 >= 0:
            self.img.paste(L.convert('RGB'), (ix0, iy0), L.split()[3])

    def paste(self, im, cx, cy, width, rot=0.0):
        """alpha-composite an RGBA image centred at (cx, cy) with the given width in metres"""
        wpx = max(int(self.m(width)), 2); hpx = max(int(wpx * im.height / im.width), 2)
        s = im.convert('RGBA').resize((wpx, hpx), Image.LANCZOS)
        if rot:
            s = s.rotate(math.degrees(rot), resample=Image.BICUBIC, expand=True)
        a = self.px(cx, cy)
        self.img.paste(s.convert('RGB'), (int(a[0] - s.width / 2), int(a[1] - s.height / 2)), s.split()[3])

    def array(self):
        im = self.img.resize((self.w, self.h), Image.LANCZOS).convert('RGB')
        return np.asarray(im, np.float32)


# ---------------------------------------------------------------------------- baking
def _sample(arr, X, Y):
    """bilinear sample (X = col, Y = row) of an (H, W, 3) array with edge clamping"""
    out = np.empty(X.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = map_coordinates(arr[..., c], [Y - 0.5, X - 0.5], order=1, mode='nearest')
    return out


def bake_planar(W, H, surf, proj, front, back):
    """Bake planar-projected designs into an unwrapped W x H texture.
    surf.xyz(u,v) -> 3D point.   proj(P) -> (vx, vy, facing)  view-space coords + z-facing (>0 = front side).
    front/back: Canvas objects (back is drawn as seen from behind, i.e. x to the viewer's right)."""
    u = (np.arange(W) + 0.5) / W
    v = 1.0 - (np.arange(H) + 0.5) / H
    UU, VV = np.meshgrid(u, v)
    P = surf.xyz(UU, VV)
    vx, vy, fz = proj(P)
    out = np.zeros((H, W, 3), np.float32)
    for cv, mask, sgn in ((front, fz >= 0, 1.0), (back, fz < 0, -1.0)):
        if cv is None or not mask.any():
            continue
        arr = cv.array()
        X = (sgn * vx - cv.xmin) * cv.ppm
        Y = (cv.ymax - vy) * cv.ppm
        S = _sample(arr, X, Y)
        out[mask] = S[mask]
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGB')


def unwrap_canvas(W, H, bg):
    """a canvas drawn directly in texture space: x = u * W px, y = v (bottom=0) * H px  (ppm = 1 unit per px)"""
    return Canvas(0, W, 0, H, 1, bg)
