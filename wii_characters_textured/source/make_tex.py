#!/usr/bin/env python3
"""
Texture-based version of the six chibi characters (Wii/Mii look).

Every body part is a clean UV-mapped mesh; ALL surface detail (face, shirt prints, jacket stripes, snaps,
emblem, back print, sleeve badges, belts, socks, shoe laces ...) is painted into baseColorTextures.
Only hair / ears / hands stay plain-colour shapes.

Node layout is unchanged:  <ID>_<Part> pivots, outfits as  <ID>_<Part>_Outfit_Casual / _Outfit_Jacket groups.
"""
import sys, os, math
SC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SC)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SC, 'out_tex')
LITE = '--lite' in sys.argv
sys.argv = [sys.argv[0], OUT]
from make_chars import *                       # helpers, CHARS, hair builders, HR/HC/NECK
from texlib import *
import paint_body as PB
if LITE:
    PB.TS = 0.5
from facepaint import face_texture, head_uv, FACE_PX

ROUGH.update(cloth=0.85, skinmat=0.62)

def colors2(spec):
    c = colors_for(spec)
    c['sock'] = '#FFFFFF'
    return c

# ------------------------------------------------------------------------------------------------ rig
class Rig3:
    def __init__(self, scene, cid, origin, colors, outfits):
        self.scene, self.cid, self.colors, self.outfits = scene, cid, colors, set(outfits)
        self.pivots, self.flats, self.texs, self._made = {}, {}, [], set()
        scene.graph.update(frame_to=cid, frame_from=scene.graph.base_frame,
                           matrix=trimesh.transformations.translation_matrix(origin))

    def part(self, name, pivot):
        self.pivots[name] = np.asarray(pivot, float)
        self.scene.graph.update(frame_to=f"{self.cid}_{name}", frame_from=self.cid,
                                matrix=trimesh.transformations.translation_matrix(pivot))

    def on(self, group):
        return group == 'Base' or group in self.outfits

    def flat(self, part, role, mesh, group='Base'):
        if self.on(group):
            self.flats.setdefault((part, group, role), []).append(mesh)

    def tex(self, part, name, mesh, group='Base'):
        if self.on(group):
            self.texs.append((part, group, name, mesh))

    def _parent(self, part, group):
        if group == 'Base':
            return f"{self.cid}_{part}"
        node = f"{self.cid}_{part}_Outfit_{group}"
        if node not in self._made:
            self.scene.graph.update(frame_to=node, frame_from=f"{self.cid}_{part}", matrix=np.eye(4))
            self._made.add(node)
        return node

    def flush(self):
        for (part, group, role), meshes in self.flats.items():
            M = trimesh.util.concatenate(meshes)
            M.apply_translation(-self.pivots[part])
            mat = PBRMaterial(name=f"{self.cid}_{role}", baseColorFactor=hex_rgb(self.colors[role]) + [255],
                              metallicFactor=0.0, roughnessFactor=ROUGH.get(role, 0.6))
            M.visual = trimesh.visual.TextureVisuals(material=mat)
            nm = f"{self.cid}_{part}_{group}_{role}"
            self.scene.add_geometry(M, node_name=nm, geom_name=nm, parent_node_name=self._parent(part, group))
        for part, group, name, M in self.texs:
            nm = f"{self.cid}_{part}_{group}_{name}"
            self.scene.add_geometry(M, node_name=nm, geom_name=nm, parent_node_name=self._parent(part, group))

# ------------------------------------------------------------------------------------------------ head
def head_mesh(face_img, offset, name, nth=28, nph=56):
    th = np.linspace(0, np.pi, nth + 1); ph = np.linspace(-np.pi, np.pi, nph + 1)
    TH, PH = np.meshgrid(th, ph, indexing='ij')
    P = np.stack([HR[0] * np.sin(TH) * np.sin(PH), HR[1] * np.cos(TH), HR[2] * np.sin(TH) * np.cos(PH)], -1)
    N = P / (HR ** 2); N /= np.linalg.norm(N, axis=-1, keepdims=True)
    nu = nph + 1
    Pf = P.reshape(-1, 3); Nf = N.reshape(-1, 3)
    n = len(Pf)
    uf, vf = head_uv(Pf[:, 0], Pf[:, 1])
    UVf = np.stack([uf, vf], 1)
    UVb = np.full((n, 2), 0.012)                                         # back of the head: a plain skin texel
    F = []
    for i in range(nth):
        for j in range(nph):
            a = i * nu + j; b = a + 1; c = a + nu; d = c + 1
            front = math.cos((ph[j] + ph[j + 1]) / 2) > 0
            o = 0 if front else n
            F += [[a + o, c + o, b + o], [b + o, c + o, d + o]]
    F = np.array(F)
    V2 = np.concatenate([Pf, Pf]); N2 = np.concatenate([Nf, Nf]); UV2 = np.concatenate([UVf, UVb])
    # winding check (outward)
    fn = np.cross(V2[F[:, 1]] - V2[F[:, 0]], V2[F[:, 2]] - V2[F[:, 0]])
    if (fn * N2[F[:, 0]]).sum() < 0:
        F = F[:, ::-1]
    area = np.linalg.norm(fn, axis=1); F = F[area > 1e-10]
    used = np.unique(F); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used))
    V = V2[used] + HC - np.asarray(offset)
    return make_mesh(V, remap[F], N2[used], UV2[used], face_img, name=name, rough=0.62)

# ------------------------------------------------------------------------------------------------ profiles
CASUAL_TORSO = list(smooth([(0.0, 0.610), (0.075, 0.604), (0.125, 0.585), (0.152, 0.55), (0.158, 0.50),
                            (0.150, 0.44), (0.146, 0.395)], 18)) + [(0.141, 0.3942), (0.0, 0.3935)]
DRESS_SKIRT = list(smooth([(0.13, 0.41), (0.15, 0.38), (0.185, 0.31), (0.225, 0.24)], 12)) + [(0.205, 0.2320), (0.0, 0.2310)]
FLARE_SKIRT = list(smooth([(0.13, 0.41), (0.16, 0.36), (0.205, 0.30)], 10)) + [(0.19, 0.2925), (0.0, 0.2920)]
HIP = [(0.141, 0.40), (0.139, 0.36), (0.128, 0.325), (0.0, 0.318)]

def part_mesh(surf, img, offset, name, rough=0.85):
    V, F, N, UV = surf.mesh_data(offset)
    return make_mesh(V, F, N, UV, img, name=name, rough=rough)

# ------------------------------------------------------------------------------------------------ character
def build_character3(scene, spec, origin=(0, 0, 0), outfits=('Casual', 'Jacket')):
    cid = spec['id']; col = colors2(spec); st = spec['style']
    rig = Rig3(scene, cid, origin, col, outfits)
    pv = dict(Body=(0, 0, 0), Head=NECK, ArmL=(0.152, 0.555, 0), ArmR=(-0.152, 0.555, 0),
              LegL=(0.075, 0.30, 0), LegR=(-0.075, 0.30, 0))
    for k, v in pv.items():
        rig.part(k, v)
    T = lambda part, name, surf, img, group='Base', rough=0.85: rig.tex(
        part, name, part_mesh(surf, img, pv[part], f"{cid}_{name}", rough), group)

    # ---------------- head: clean ellipsoid + painted face
    face = face_texture(spec, col)
    if PB.TS != 1.0:
        face = face.resize((int(face.width * PB.TS), int(face.height * PB.TS)), Image.LANCZOS)
    rig.tex('Head', 'face', head_mesh(face, pv['Head'], f"{cid}_face"))
    for sx in (-1, 1):                                                           # ears (plain skin shapes)
        rig.flat('Head', 'skin', ellipsoid(HC + np.array([sx * 0.262, -0.012, -0.01]), (0.03, 0.05, 0.04)))
    hadd = lambda role, m: rig.flat('Head', role, m)
    {'spiky': lambda: hair_spiky(hadd), 'curly': lambda: hair_curly(hadd), 'gray': lambda: hair_gray(hadd),
     'long': lambda: hair_long(hadd), 'twintails': lambda: hair_twintails(hadd, spec.get('accent')),
     'bun': lambda: hair_bun(hadd, spec.get('accent'))}[spec['hairstyle']]()

    # ---------------- torso: casual shirt / dress top   |   varsity jacket
    if 'Casual' in outfits:
        s = Lathe(CASUAL_TORSO, zs=0.78, seg=48)
        sz_ = PB.sz(1024, 256)
        T('Body', 'shirt', s, PB.paint_casual_torso(spec, col, sz_, ymin=s.ymin, ymax=s.ymax, surf=s), 'Casual')
    if 'Jacket' in outfits:
        s = Lathe(PB.JACKET_PROFILE, zs=PB.JZ, seg=64)
        T('Body', 'jacket', s, PB.paint_jacket_torso(spec, col, PB.sz(2048, 512), ymin=s.ymin, ymax=s.ymax, surf=s), 'Jacket')

    # ---------------- lower body (always visible)
    if st == 'dress':
        s = Lathe(DRESS_SKIRT, zs=0.86, seg=48)
        T('Body', 'skirt', s, PB.paint_skirt(spec, col, PB.sz(1024, 256), ymin=s.ymin, ymax=s.ymax, dress=True))
    elif st == 'skirt':
        s = Lathe(FLARE_SKIRT, zs=0.86, seg=48)
        T('Body', 'skirt', s, PB.paint_skirt(spec, col, PB.sz(1024, 256), ymin=s.ymin, ymax=s.ymax, dress=False))
    else:
        s = Lathe(HIP, zs=0.80, seg=48)
        T('Body', 'hip', s, PB.paint_hip(spec, col, s, PB.sz(1024, 128)))

    # ---------------- arms
    for sx, nm, which in ((1, 'ArmL', 'L'), (-1, 'ArmR', 'R')):
        Sp = np.array([sx * 0.152, 0.555, 0.0]); d = np.array([sx * math.sin(0.32), -math.cos(0.32), 0.0])
        if 'Casual' in outfits:
            prof = cap_profile(0.0, 0.225, 0.043, 0.036, cap0=0.043, cap1=0.012, mid=[(0.115, 0.0405), (0.120, 0.0385)])
            tb = Tube(Sp, d, prof, seg=24)
            T(nm, 'sleeve', tb, PB.paint_casual_arm(spec, col, tb, tb.p0, tb.d, tb.e1, PB.sz(256, 256)), 'Casual')
        if 'Jacket' in outfits:
            prof = cap_profile(0.0, 0.225, 0.0475, 0.0456, cap0=0.0475, cap1=0.012, mid=[(0.18, 0.0442), (0.19, 0.0456)])
            tb = Tube(Sp, d, prof, seg=24, a0=(0.0 if sx > 0 else -math.pi))
            T(nm, 'sleeve', tb, PB.paint_jacket_arm(spec, col, tb, tb.p0, tb.d, tb.e1, which, PB.sz(512, 512)), 'Jacket')
        rig.flat(nm, 'skin', ellipsoid(Sp + d * 0.255, (0.05, 0.052, 0.048), sub=3))          # hand

    # ---------------- legs + shoes
    for sx, nm in ((1, 'LegL'), (-1, 'LegR')):
        x = sx * 0.075
        tb = Tube(np.array([x, 0.30, 0.0]), np.array([0, -1.0, 0]), cap_profile(0.0, 0.20, 0.044, 0.041, cap0=0.044, cap1=0.03), seg=24)
        T(nm, 'leg', tb, PB.paint_leg(spec, col, tb, tb.p0, tb.d, tb.e1, PB.sz(256, 256)))
        sh = Ellipsoid([x, 0.045, 0.022], (0.057, 0.047, 0.088), seg=32, rows=16)
        T(nm, 'shoe', sh, PB.paint_shoe(spec, col, sh, PB.sz(512, 256)), rough=0.6)
    rig.flush()
    return rig


def export(scene, path):
    scene.export(path, file_type='glb', include_normals=True)
    tris = sum(len(g.faces) for g in scene.geometry.values())
    print(f"{os.path.basename(path):40s} tris={tris:6d} {os.path.getsize(path)/1024:7.0f}KB")


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = [a for a in sys.argv[1:] if a.startswith('only=')]
    variants = {'outfits': ('Casual', 'Jacket'), 'casual': ('Casual',), 'jacket': ('Jacket',)}
    for spec in CHARS:
        for tag, of in variants.items():
            sc = trimesh.Scene(); build_character3(sc, spec, outfits=of)
            export(sc, os.path.join(OUT, f"{spec['id']}_{tag}.glb"))
    for tag in ('casual', 'jacket'):
        sc = trimesh.Scene()
        for i, spec in enumerate(CHARS):
            build_character3(sc, spec, origin=((i - 2.5) * 0.78, 0, 0), outfits=(tag.capitalize(),))
        export(sc, os.path.join(OUT, f"lineup_{tag}.glb"))
