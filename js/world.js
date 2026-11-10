// 3D 월드: 하늘에 떠 있는 잔디 섬 + 중앙 Top 3 시상대 팻말 + 방명록 작성자 캐릭터들

import * as THREE from 'three';
import { CONFIG, gradeOf } from './config.js';
import { rankEntries } from './store.js';
import { createAvatar, animateAvatar } from './avatars.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const R = 26;          // 섬 반지름
const AV = 1.5;        // 캐릭터 확대 비율 (GLB 원본 키 ≈ 1.2)
const SPAWN = new THREE.Vector3(0, 0, 17);
const PODIUM = { x: 0, z: -0.2, r: 4.7 };
const ARCH_Z = 11.2;

const DISPLAY = 'Jua, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const BODY = '"Gowun Dodum", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const MEDAL = { 1: ['#ffd24a', '#d99a00'], 2: ['#d9e2eb', '#8fa1b4'], 3: ['#f3b184', '#c0703a'] };

/* ----------------------------------------------------------------- utils */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}
function toTexture(canvas, { repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function heart(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.8, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.8, cy - s * 1.1, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9);
  ctx.closePath();
}
function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ch === ' ' && line === '') continue;
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line.trimEnd()); line = ch === ' ' ? '' : ch; }
      else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

// 한글 웹폰트는 글자 조각(subset)별로 내려오므로, 캔버스에 그리기 전에 해당 글자를 미리 로드해야 합니다.
function ensureFonts(text) {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load('48px Jua', text),
    document.fonts.load('40px "Gowun Dodum"', text),
  ]).catch(() => {});
}

/* -------------------------------------------------------- textures: sign */

const SIGN_W = 768;
const SIGN_H = 576;

function drawSign(ctx, rank, entry) {
  const W = SIGN_W, H = SIGN_H;
  const [c1, c2] = entry ? MEDAL[rank] : ['#dfe7ee', '#b6c3cf'];
  ctx.clearRect(0, 0, W, H);

  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  rr(ctx, 0, 0, W, H, 52); ctx.fillStyle = g; ctx.fill();

  g = ctx.createLinearGradient(0, 20, 0, H - 20);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#eaf3f9');
  rr(ctx, 20, 20, W - 40, H - 40, 36); ctx.fillStyle = g; ctx.fill();

  ctx.save();
  rr(ctx, 20, 20, W - 40, H - 40, 36); ctx.clip();
  ctx.fillStyle = '#def2fd'; ctx.fillRect(20, 20, W - 40, 150);
  ctx.fillStyle = '#c4e5f6'; ctx.fillRect(20, 168, W - 40, 3);
  ctx.restore();

  // 메달
  const mg = ctx.createLinearGradient(0, 40, 0, 150);
  mg.addColorStop(0, c1); mg.addColorStop(1, c2);
  ctx.beginPath(); ctx.arc(104, 96, 56, 0, TAU); ctx.fillStyle = mg; ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `64px ${DISPLAY}`;
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillText(String(rank), 104, 100);
  ctx.shadowColor = 'transparent';

  if (!entry) {
    ctx.fillStyle = '#8a98a5'; ctx.font = `58px ${DISPLAY}`; ctx.textAlign = 'center';
    ctx.fillText('아직 비어 있어요', W / 2 + 40, 96);
    ctx.fillStyle = '#7c8996'; ctx.font = `38px ${BODY}`;
    ctx.fillText('하트를 받으면', W / 2, 290);
    ctx.fillText('이 팻말의 주인이 돼요', W / 2, 346);
    ctx.fillStyle = '#ff9fb2'; heart(ctx, W / 2, 450, 34); ctx.fill();
    return;
  }

  const grade = gradeOf(entry.grade);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `34px ${DISPLAY}`;
  const cw = ctx.measureText(grade.label).width + 34;
  rr(ctx, 184, 44, cw, 46, 23); ctx.fillStyle = grade.color; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(grade.label, 184 + cw / 2, 68);

  ctx.fillStyle = '#3d4954'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `58px ${DISPLAY}`;
  ctx.fillText(entry.name, 184, 150, W - 184 - 50);

  ctx.fillStyle = '#4a5662';
  let size = 46, lines = [];
  for (; size >= 28; size -= 4) {
    ctx.font = `${size}px ${BODY}`;
    lines = wrapText(ctx, entry.message, W - 120);
    if (lines.length * size * 1.36 <= 270) break;
  }
  const lh = size * 1.36;
  const maxLines = Math.floor(270 / lh);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'; }
  lines.forEach((l, i) => ctx.fillText(l, 60, 228 + size + i * lh - size * 0.2));

  ctx.fillStyle = '#ff5d7a'; heart(ctx, 84, 508, 24); ctx.fill();
  ctx.font = `54px ${DISPLAY}`; ctx.fillStyle = '#ff5d7a'; ctx.textAlign = 'left';
  ctx.fillText(String(entry.likes), 122, 528);
  ctx.textAlign = 'right'; ctx.fillStyle = c2; ctx.font = `40px ${DISPLAY}`;
  ctx.fillText(`TOP ${rank}`, W - 60, 526);
}

function drawBanner(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#5dd0ff'); g.addColorStop(1, '#1aa0e6');
  rr(ctx, 0, 0, W, H, 54); ctx.fillStyle = g; ctx.fill();
  rr(ctx, 14, 14, W - 28, H - 28, 42); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  rr(ctx, 56, 52, 148, 56, 28); ctx.fillStyle = '#1aa0e6'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `38px ${DISPLAY}`; ctx.textAlign = 'center';
  ctx.fillText(CONFIG.eventYear, 130, 82);
  ctx.textAlign = 'left'; ctx.fillStyle = '#1aa0e6'; ctx.font = `104px ${DISPLAY}`;
  ctx.fillText(CONFIG.eventTitle, 56, 156);
  ctx.fillStyle = '#7b8895'; ctx.font = `34px ${BODY}`;
  ctx.fillText('광장 한가운데에서 Top 3 팻말을 찾아보세요', 58, 218);
}

/* ------------------------------------------------------ textures: ground */

function lawnTexture() {
  const { canvas, ctx } = makeCanvas(1024, 1024);
  ctx.fillStyle = '#93e07a'; ctx.fillRect(0, 0, 1024, 1024);
  const rand = rng(7);
  for (let i = 0; i < 12; i++) {
    ctx.beginPath(); ctx.arc(512, 512, 512 - i * 42, 0, TAU);
    ctx.fillStyle = i % 2 ? '#9be584' : '#8ad870'; ctx.fill();
  }
  for (let i = 0; i < 500; i++) {
    const a = rand() * TAU, r = Math.sqrt(rand()) * 500;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(60,140,60,.14)';
    ctx.beginPath(); ctx.arc(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 3 + rand() * 4, 0, TAU); ctx.fill();
  }
  return toTexture(canvas, { aniso: 8 });
}

function tileLines(ctx, x, y, w, h, n) {
  ctx.strokeStyle = '#d9eaf5'; ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(x + (w / n) * i, y); ctx.lineTo(x + (w / n) * i, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + (h / n) * i); ctx.lineTo(x + w, y + (h / n) * i); ctx.stroke();
  }
}

function plazaTexture() {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, TAU); ctx.clip();
  tileLines(ctx, 0, 0, S, S, 14);
  ctx.restore();
  ctx.lineWidth = 22; ctx.strokeStyle = '#35b8ec';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 14, 0, TAU); ctx.stroke();
  ctx.lineWidth = 8; ctx.strokeStyle = '#bfe8fb';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 62, 0, TAU); ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.fillStyle = i % 2 ? '#35b8ec' : '#bfe8fb';
    ctx.beginPath(); ctx.arc(S / 2 + Math.cos(a) * (S / 2 - 100), S / 2 + Math.sin(a) * (S / 2 - 100), 9, 0, TAU); ctx.fill();
  }
  return toTexture(canvas, { aniso: 8 });
}

function pathTexture() {
  const { canvas, ctx } = makeCanvas(256, 512);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 512);
  tileLines(ctx, 0, 0, 256, 512, 4);
  ctx.strokeStyle = '#35b8ec'; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 512); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.stroke();
  return toTexture(canvas, { repeat: true, aniso: 8 });
}

const shadowTexture = (() => {
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(20,50,80,.34)'); g.addColorStop(1, 'rgba(20,50,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return toTexture(canvas, { aniso: 1 });
})();
const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });

/* ------------------------------------------------------------- name tag */

function buildTagTexture(name, gradeId, me) {
  const grade = gradeOf(gradeId);
  const m = document.createElement('canvas').getContext('2d');
  m.font = `44px ${DISPLAY}`;
  const tagW = Math.ceil(m.measureText(grade.label).width) + 36;
  const nameW = Math.ceil(m.measureText(name).width) + 44;
  const pad = 14, h = 64;
  const W = tagW + nameW + pad * 2, H = h + pad * 2 + 8;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.font = `44px ${DISPLAY}`;
  ctx.textBaseline = 'middle';

  ctx.save();
  ctx.shadowColor = 'rgba(20,70,110,.28)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 4;
  rr(ctx, pad, pad, tagW + nameW, h, h / 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();

  ctx.save();
  rr(ctx, pad, pad, tagW + nameW, h, h / 2); ctx.clip();
  ctx.fillStyle = grade.color; ctx.fillRect(pad, pad, tagW, h);
  ctx.restore();

  rr(ctx, pad, pad, tagW + nameW, h, h / 2);
  ctx.lineWidth = me ? 6 : 2.5; ctx.strokeStyle = me ? '#1fb0ee' : '#d4dde6'; ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.fillText(grade.label, pad + tagW / 2, pad + h / 2 + 2);
  ctx.fillStyle = '#3d4954'; ctx.fillText(name, pad + tagW + nameW / 2, pad + h / 2 + 2);
  return { tex: toTexture(canvas, { aniso: 2 }), w: W, h: H };
}

/* ---------------------------------------------------------------- entity */

class Entity {
  constructor({ charId, jacket, name, grade, me = false }) {
    this.holder = new THREE.Group();
    this.av = createAvatar(charId, jacket);
    this.av.root.scale.setScalar(AV);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.position.y = 0.03;
    this.shadow.scale.setScalar(1.15);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    this.tag.renderOrder = 10;
    this.tag.position.y = 2.62;
    this.holder.add(this.shadow, this.av.root, this.tag);
    this.facing = 0;
    this.vy = 0;
    this.setTag(name, grade, me);
  }
  get pos() { return this.holder.position; }
  setTag(name, grade, me) {
    this._tagArgs = [name, grade, me];
    const apply = () => {
      const old = this.tag.material.map;
      const { tex, w, h } = buildTagTexture(name, grade, me);
      this.tag.material.map = tex;
      this.tag.material.needsUpdate = true;
      this.tag.scale.set(w * 0.0058, h * 0.0058, 1);
      old?.dispose();
    };
    apply();
    ensureFonts(name + gradeOf(grade).label).then(() => {
      if (this._tagArgs[0] === name && this.tag.material) apply();
    });
  }
  face(dt, angle, k = 14) {
    this.facing = lerpAngle(this.facing, angle, damp(k, dt));
    this.av.root.rotation.y = this.facing;
  }
  dispose() {
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
    this.holder.removeFromParent();
  }
}

/* ------------------------------------------------------------------ sign */

class Sign {
  constructor(scene, rank, x, z, topY, bw) {
    this.rank = rank;
    this.entry = null;
    this.pos = new THREE.Vector3(x, 0, z);
    this._sig = '';
    const bh = (bw * SIGN_H) / SIGN_W;

    const group = new THREE.Group();
    group.position.set(x, topY, z);
    scene.add(group);
    this.group = group;

    const wood = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2 + bh, 10), wood);
      post.position.set(sx * (bw / 2 - 0.25), (1.2 + bh) / 2 - 0.1, -0.02);
      group.add(post);
    }
    const centerY = 0.95 + bh / 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(bw + 0.1, bh + 0.1, 0.16),
      new THREE.MeshLambertMaterial({ color: rank === 1 ? 0xffd24a : rank === 2 ? 0xd9e2eb : 0xf3b184 }),
    );
    frame.position.y = centerY;
    group.add(frame);

    this.sheet = makeCanvas(SIGN_W, SIGN_H);
    this.tex = toTexture(this.sheet.canvas, { aniso: 8 });
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    const geo = new THREE.PlaneGeometry(bw, bh);
    this.front = new THREE.Mesh(geo, mat);
    this.front.position.set(0, centerY, 0.085);
    this.back = new THREE.Mesh(geo, mat);
    this.back.position.set(0, centerY, -0.085);
    this.back.rotation.y = Math.PI;
    group.add(this.front, this.back);
    this.pickMeshes = [this.front, this.back, frame];

    if (rank === 1) {
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + Math.PI / 2;
        const r = i % 2 ? 0.32 : 0.7;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i ? star.lineTo(px, py) : star.moveTo(px, py);
      }
      star.closePath();
      const geoS = new THREE.ExtrudeGeometry(star, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
      geoS.translate(0, 0, -0.09);
      this.star = new THREE.Mesh(geoS, new THREE.MeshLambertMaterial({ color: 0xffd24a, emissive: 0x6b4a00 }));
      this.star.position.y = centerY + bh / 2 + 0.95;
      this.starBase = this.star.position.y;
      group.add(this.star);
    }
    this.setEntry(null);
  }

  setEntry(entry) {
    const sig = entry ? `${entry.id}|${entry.likes}|${entry.name}|${entry.grade}|${entry.message}` : 'empty';
    if (sig === this._sig) return;
    this._sig = sig;
    this.entry = entry;
    const paint = () => { drawSign(this.sheet.ctx, this.rank, entry); this.tex.needsUpdate = true; };
    paint();
    if (entry) ensureFonts(entry.name + entry.message + gradeOf(entry.grade).label).then(() => { if (this._sig === sig) paint(); });
  }

  update(t) {
    if (this.star) {
      this.star.rotation.y = t * 1.4;
      this.star.position.y = this.starBase + Math.sin(t * 2) * 0.12;
      this.star.visible = !!this.entry;
    }
  }
}

/* ------------------------------------------------------------------- npc */

class Npc extends Entity {
  constructor(entry, slot) {
    super({ charId: entry.char, jacket: entry.jacket, name: entry.name, grade: entry.grade });
    this.entry = entry;
    this.slot = slot;
    const a = slot * 2.39996 + 0.5;
    const r = Math.min(20, 9.4 + Math.sqrt(slot) * 3.0);
    this.home = new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
    this.pos.set(this.home.x, 0, this.home.y);
    this.target = null;
    this.wait = Math.random() * 3;
    this.facing = Math.random() * TAU;
  }
}

/* ----------------------------------------------------------------- world */

export class World {
  constructor({ canvas, controls, onNear, onTap }) {
    this.canvas = canvas;
    this.controls = controls;
    this.onNear = onNear;
    this.onTap = onTap;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.raycaster = new THREE.Raycaster();

    this.colliders = [];
    this.signs = [];
    this.npcs = new Map();
    this.usedSlots = new Set();
    this.entries = [];
    this.me = null;
    this.player = null;
    this.nearId = null;
    this.nearTimer = 0;

    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 8.5;
    this.camTarget = new THREE.Vector3();
    this.intro = null;
    this.running = false;
    this.t = 0;

    this._build();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    this.resize();

    controls.onTap = (x, y) => this._tap(x, y);
  }

  /* ------------------------------------------------------------ build */

  _build() {
    const { scene } = this;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdebc2, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(12, 20, 9);
    scene.add(sun);

    // 섬
    const lawn = new THREE.MeshLambertMaterial({ map: lawnTexture() });
    const soil = new THREE.MeshLambertMaterial({ color: 0xe6c791 });
    const island = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.8, 72), [soil, lawn, soil]);
    island.position.y = -0.4;
    scene.add(island);
    const under = new THREE.Mesh(new THREE.ConeGeometry(R - 0.3, 17, 48, 1, true), new THREE.MeshLambertMaterial({ color: 0xd9b57f, side: THREE.DoubleSide }));
    under.rotation.x = Math.PI;
    under.position.y = -0.8 - 8.5;
    scene.add(under);
    const curb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.2, 10, 120), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    curb.rotation.x = Math.PI / 2;
    curb.position.y = 0.02;
    scene.add(curb);

    // 광장 + 진입로
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(8.6, 72), new THREE.MeshLambertMaterial({ map: plazaTexture() }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    scene.add(plaza);
    const pt = pathTexture();
    pt.repeat.set(1.5, 4);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 14), new THREE.MeshLambertMaterial({ map: pt }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.015, 15.4);
    scene.add(path);

    this._buildPodium();
    this._buildArch();
    this._buildFence();
    this._buildNature();
    this._buildClouds();
  }

  _buildPodium() {
    const { scene } = this;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.7, 0.22, 48), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    base.position.set(PODIUM.x, 0.11, PODIUM.z);
    scene.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.08, 8, 72), new THREE.MeshBasicMaterial({ color: 0x35b8ec }));
    rim.rotation.x = Math.PI / 2; rim.position.set(PODIUM.x, 0.23, PODIUM.z);
    scene.add(rim);
    this.colliders.push({ x: PODIUM.x, z: PODIUM.z, r: PODIUM.r });

    const steps = [
      { rank: 1, x: 0, z: -1.0, h: 0.78, color: 0xffd24a, bw: 3.3 },
      { rank: 2, x: -3.0, z: 0.5, h: 0.52, color: 0xdbe4ed, bw: 2.5 },
      { rank: 3, x: 3.0, z: 0.5, h: 0.36, color: 0xf3b184, bw: 2.5 },
    ];
    for (const s of steps) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, s.h, 36), new THREE.MeshLambertMaterial({ color: s.color }));
      m.position.set(s.x, 0.22 + s.h / 2, s.z);
      scene.add(m);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.05, 36), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      top.position.set(s.x, 0.22 + s.h + 0.02, s.z);
      scene.add(top);
      const sign = new Sign(scene, s.rank, s.x, s.z, 0.22 + s.h, s.bw);
      this.signs.push(sign);
    }
  }

  _buildArch() {
    const { scene } = this;
    const z = ARCH_Z;
    const blue = new THREE.MeshLambertMaterial({ color: 0x35b8ec, transparent: true });
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true });
    this.archMats = [blue, white];
    this.archOpacity = 1;
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 4.9, 14), blue);
      p.position.set(sx * 4.05, 2.45, z);
      scene.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), white);
      cap.position.set(sx * 4.05, 5, z);
      scene.add(cap);
      this.colliders.push({ x: sx * 4.05, z, r: 0.4 });
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.22, 0.3), blue);
    bar.position.set(0, 4.82, z);
    scene.add(bar);

    const sheet = makeCanvas(1024, 256);
    const tex = toTexture(sheet.canvas, { aniso: 8 });
    const draw = () => { drawBanner(sheet.ctx, 1024, 256); tex.needsUpdate = true; };
    draw();
    ensureFonts(CONFIG.eventTitle + CONFIG.eventYear + '광장 한가운데에서 Top 3 팻말을 찾아보세요').then(draw);
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
    this.archMats.push(mat);
    const geo = new THREE.PlaneGeometry(7.4, 1.85);
    const f = new THREE.Mesh(geo, mat); f.position.set(0, 3.7, z + 0.02);
    const b = new THREE.Mesh(geo, mat); b.position.set(0, 3.7, z - 0.02); b.rotation.y = Math.PI;
    scene.add(f, b);
  }

  _buildFence() {
    const { scene } = this;
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const fr = R - 0.7;
    const n = 64;
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 8), white, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      m.makeTranslation(Math.cos(a) * fr, 0.5, Math.sin(a) * fr);
      posts.setMatrixAt(i, m);
    }
    scene.add(posts);
    for (const y of [0.45, 0.85]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(fr, 0.045, 6, 128), new THREE.MeshLambertMaterial({ color: 0xbfe8fb }));
      rail.rotation.x = Math.PI / 2; rail.position.y = y;
      scene.add(rail);
    }
  }

  _buildNature() {
    const { scene } = this;
    const rand = rng(42);
    const trunk = new THREE.MeshLambertMaterial({ color: 0xbb8650 });
    const leafs = [0x6fd36a, 0x7fe27a, 0x5fc65f].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const trees = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + (rand() - 0.5) * 0.2;
      const r = 17.5 + rand() * 5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 5.4 && z > 5) continue;
      const s = 0.85 + rand() * 0.6;
      const g = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 1.5 * s, 8), trunk);
      tr.position.y = 0.75 * s;
      g.add(tr);
      [[0, 2.1, 0, 1.15], [0.65, 1.65, 0.25, 0.8], [-0.6, 1.7, -0.15, 0.85], [0.1, 1.6, -0.7, 0.7]].forEach(([px, py, pz, pr], k) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(pr * s, 14, 10), leafs[k % 3]);
        b.position.set(px * s, py * s, pz * s);
        g.add(b);
      });
      g.position.set(x, 0, z);
      scene.add(g);
      this.colliders.push({ x, z, r: 0.6 * s });
      trees.push({ x, z });
    }

    // 꽃 (InstancedMesh)
    const count = 240;
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial(), count);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4), new THREE.MeshLambertMaterial({ color: 0x4fb35a }), count);
    const palette = [0xff8fb0, 0xffe066, 0xffffff, 0xc3a6ff, 0x8fd8ff].map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    let placed = 0;
    while (placed < count) {
      const a = rand() * TAU, r = 9.6 + rand() * 15;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 3.2 && z > 5) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.3)) continue;
      m.makeTranslation(x, 0.24, z); heads.setMatrixAt(placed, m); heads.setColorAt(placed, palette[Math.floor(rand() * palette.length)]);
      m.makeTranslation(x, 0.11, z); stems.setMatrixAt(placed, m);
      placed++;
    }
    scene.add(heads, stems);
  }

  _buildClouds() {
    const rand = rng(11);
    this.clouds = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb8c8, emissiveIntensity: 0.45 });
    const geo = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const parts = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < parts; k++) {
        const p = new THREE.Mesh(geo, mat);
        p.scale.set(2.4 + rand() * 1.6, 1.4 + rand() * 0.9, 1.8 + rand());
        p.position.set((k - parts / 2) * 2.4, rand() * 0.6, rand() - 0.5);
        g.add(p);
      }
      const a = rand() * TAU, r = 38 + rand() * 55;
      const low = i % 3 === 0;
      g.position.set(Math.cos(a) * r, low ? -9 - rand() * 8 : 2 + rand() * 20, Math.sin(a) * r);
      g.rotation.y = rand() * TAU;
      this.clouds.add(g);
    }
    this.scene.add(this.clouds);
  }

  /* ------------------------------------------------------------- state */

  setPlayer(profile) {
    this.me = profile;
    const keep = this.player ? this.player.pos.clone() : SPAWN.clone();
    const facing = this.player ? this.player.facing : Math.PI;
    if (this.player) this.player.dispose();
    this.player = new Entity({ charId: profile.char, jacket: profile.jacket, name: profile.name, grade: profile.grade, me: true });
    this.player.pos.copy(keep);
    this.player.facing = facing;
    this.player.av.root.rotation.y = facing;
    this.scene.add(this.player.holder);
    this._syncNpcs();
  }

  setEntries(entries) {
    this.entries = entries;
    const top = rankEntries(entries);
    this.signs.forEach((s, i) => s.setEntry(top[i] || null));
    this._syncNpcs();
  }

  _syncNpcs() {
    const want = this.entries
      .filter((e) => e.id !== this.me?.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, CONFIG.maxNpcs);
    const ids = new Set(want.map((e) => e.id));
    for (const [id, npc] of this.npcs) {
      if (!ids.has(id)) { this.usedSlots.delete(npc.slot); npc.dispose(); this.npcs.delete(id); }
    }
    for (const e of want) {
      const cur = this.npcs.get(e.id);
      if (cur) {
        const changed = cur.entry.char !== e.char || cur.entry.jacket !== e.jacket || cur.entry.name !== e.name || cur.entry.grade !== e.grade;
        cur.entry = e;
        if (changed) {
          // 정보가 바뀐 경우(내 정보 수정 등) 새로 만든다
          this.usedSlots.delete(cur.slot); cur.dispose(); this.npcs.delete(e.id);
        } else continue;
      }
      let slot = 0;
      while (this.usedSlots.has(slot)) slot++;
      this.usedSlots.add(slot);
      const npc = new Npc(e, slot);
      this.npcs.set(e.id, npc);
      this.scene.add(npc.holder);
    }
  }

  /* ---------------------------------------------------------- movement */

  _resolve(p, radius) {
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min) {
        const k = d < 1e-4 ? 0 : min / d;
        if (k) { p.x = c.x + dx * k; p.z = c.z + dz * k; } else p.x += min;
      }
    }
    const d = Math.hypot(p.x, p.z);
    const max = R - 1.5;
    if (d > max) { p.x *= max / d; p.z *= max / d; }
  }

  _updatePlayer(dt) {
    const pl = this.player;
    if (!pl) return;
    const mv = this.controls.move;
    const mag = Math.min(1, Math.hypot(mv.x, mv.y));
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const dx = c * mv.x + s * mv.y;
    const dz = -s * mv.x + c * mv.y;

    if (mag > 0.06) {
      const speed = 5.4 * mag;
      pl.pos.x += (dx / Math.hypot(dx, dz)) * speed * dt;
      pl.pos.z += (dz / Math.hypot(dx, dz)) * speed * dt;
      pl.face(dt, Math.atan2(dx, dz));
    }
    this._resolve(pl.pos, 0.45);

    // 점프
    if (this.controls.consumeJump() && pl.pos.y <= 0.001) { pl.vy = 8.2; sfx.jump(); }
    pl.vy -= 24 * dt;
    pl.pos.y = Math.max(0, pl.pos.y + pl.vy * dt);
    if (pl.pos.y === 0 && pl.vy < 0) pl.vy = 0;
    const air = pl.pos.y > 0.02;
    pl.shadow.scale.setScalar(1.15 * (1 - Math.min(0.5, pl.pos.y * 0.12)));
    pl.shadow.position.y = 0.03 - pl.pos.y;

    animateAvatar(pl.av, dt, mag > 0.06 ? mag : 0, this.t, air);
  }

  _updateNpcs(dt) {
    const player = this.player?.pos;
    for (const n of this.npcs.values()) {
      let moving = false;
      if (n.target) {
        const dx = n.target.x - n.pos.x, dz = n.target.y - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) { n.target = null; n.wait = 1.5 + Math.random() * 4; }
        else {
          n.pos.x += (dx / d) * 1.35 * dt;
          n.pos.z += (dz / d) * 1.35 * dt;
          n.face(dt, Math.atan2(dx, dz), 9);
          moving = true;
        }
      } else {
        n.wait -= dt;
        if (player && Math.hypot(player.x - n.pos.x, player.z - n.pos.z) < 5.5) {
          n.face(dt, Math.atan2(player.x - n.pos.x, player.z - n.pos.z), 5);
        }
        if (n.wait <= 0) {
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * TAU, r = 1 + Math.random() * 3.2;
            const tx = n.home.x + Math.cos(a) * r, tz = n.home.y + Math.sin(a) * r;
            if (Math.hypot(tx, tz) < R - 2.2 && Math.hypot(tx - PODIUM.x, tz - PODIUM.z) > PODIUM.r + 0.8) { n.target = new THREE.Vector2(tx, tz); break; }
          }
          n.wait = 1 + Math.random() * 2;
        }
      }
      this._resolve(n.pos, 0.4);
      animateAvatar(n.av, dt, moving ? 0.5 : 0, this.t);
    }
  }

  _updateNear(dt) {
    this.nearTimer -= dt;
    if (this.nearTimer > 0 || !this.player) return;
    this.nearTimer = 0.12;
    const p = this.player.pos;
    let best = null, bestD = Infinity;
    for (const s of this.signs) {
      if (!s.entry) continue;
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d < 6.2 && d - 1.5 < bestD) { best = s.entry.id; bestD = d - 1.5; }
    }
    for (const n of this.npcs.values()) {
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d < 3.4 && d < bestD) { best = n.entry.id; bestD = d; }
    }
    if (best !== this.nearId) { this.nearId = best; this.onNear?.(best); }
  }

  _updateCamera(dt) {
    const look = this.controls.consumeLook();
    if (!this.intro) {
      this.yaw += look.yaw;
      this.pitch = clamp(this.pitch + look.pitch, 0.1, 1.2);
    }
    let dist = this.dist, pitch = this.pitch, yaw = this.yaw;
    if (this.intro) {
      this.intro.t += dt;
      const k = easeOut(clamp(this.intro.t / this.intro.dur, 0, 1));
      dist = lerp(26, this.dist, k);
      pitch = lerp(0.95, this.pitch, k);
      yaw = this.yaw + lerp(1.4, 0, k);
      if (this.intro.t >= this.intro.dur) this.intro = null;
    }
    const pp = this.player?.pos || SPAWN;
    const target = new THREE.Vector3(pp.x, 1.3 + pp.y * 0.5, pp.z);
    if (this.intro || this._snapCam) { this.camTarget.copy(target); this._snapCam = false; }
    else this.camTarget.lerp(target, damp(10, dt));
    const cp = Math.cos(pitch);
    this.camera.position.set(
      this.camTarget.x + Math.sin(yaw) * cp * dist,
      Math.max(0.5, this.camTarget.y + Math.sin(pitch) * dist),
      this.camTarget.z + Math.cos(yaw) * cp * dist,
    );
    this.camera.lookAt(this.camTarget);
  }

  /* -------------------------------------------------------- interaction */

  _tap(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), this.camera);
    let best = null, bestD = Infinity;
    const ray = this.raycaster.ray;
    const sphere = new THREE.Sphere();
    const hit = new THREE.Vector3();
    for (const n of this.npcs.values()) {
      sphere.set(new THREE.Vector3(n.pos.x, 1.0, n.pos.z), 1.1);
      if (ray.intersectSphere(sphere, hit)) {
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) { best = n.entry.id; bestD = d; }
      }
    }
    for (const s of this.signs) {
      if (!s.entry) continue;
      const h = this.raycaster.intersectObjects(s.pickMeshes, false)[0];
      if (h && h.distance < bestD) { best = s.entry.id; bestD = h.distance; }
    }
    if (best) this.onTap?.(best);
  }

  teleportToEntry(id) {
    const pl = this.player;
    if (!pl) return false;
    const sign = this.signs.find((s) => s.entry?.id === id);
    const npc = this.npcs.get(id);
    if (sign) pl.pos.set(sign.pos.x * 1.25, 0, 6.3);
    else if (npc) pl.pos.set(npc.pos.x * 0.92 + 0.4, 0, npc.pos.z * 0.92 + 1.8);
    else return false;
    this._resolve(pl.pos, 0.45);
    this.yaw = 0;
    this._snapCam = true;
    this.nearTimer = 0;
    return true;
  }

  goToPlaza() {
    if (!this.player) return;
    this.player.pos.set(0, 0, 7.2);
    this.yaw = 0;
    this._snapCam = true;
  }

  /* ------------------------------------------------------------- loop */

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.dist = w / h < 0.8 ? 11.6 : 8.4;
    this.camera.fov = w / h < 0.8 ? 52 : 46;
    this.camera.updateProjectionMatrix();
  }

  start({ intro = true } = {}) {
    if (this.running) return;
    this.running = true;
    this.resize();
    if (intro) this.intro = { t: 0, dur: 2.4 };
    this._snapCam = true;
    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      this._updatePlayer(dt);
      this._updateNpcs(dt);
      this.signs.forEach((s) => s.update(this.t));
      this.clouds.rotation.y += dt * 0.006;
      this._updateNear(dt);
      this._updateCamera(dt);

      // 아치가 카메라와 캐릭터 사이를 가리면 투명하게
      const pz = this.player?.pos.z ?? SPAWN.z;
      const blocking = this.camera.position.z > ARCH_Z - 0.5 && pz < ARCH_Z + 2.5;
      this.archOpacity += ((blocking ? 0 : 1) - this.archOpacity) * damp(9, dt);
      for (const m of this.archMats) { m.opacity = this.archOpacity; m.visible = this.archOpacity > 0.03; }

      // 먼 이름표는 흐리게
      const cam = this.camera.position;
      const fade = (e) => { e.tag.material.opacity = clamp((34 - e.pos.distanceTo(cam)) / 10, 0, 1); };
      this.npcs.forEach(fade);

      this.renderer.render(this.scene, this.camera);
    });
  }

  pause() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.controls.reset();
  }
}
