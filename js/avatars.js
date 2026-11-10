// GLB 캐릭터 로드 / 복제 / 걷기 애니메이션 / 썸네일 / 입력 화면 미리보기

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTERS } from './config.js';

const loader = new GLTFLoader();
const templates = new Map();

export async function loadCharacters(onProgress) {
  let done = 0;
  await Promise.all(
    CHARACTERS.map(async (c) => {
      const gltf = await loader.loadAsync(`assets/models/${c.id}_outfits.glb`);
      templates.set(c.id, gltf.scene);
      onProgress?.(++done / CHARACTERS.length);
    }),
  );
}

/**
 * 캐릭터 1명 생성. GLB 는 Head/ArmL/ArmR/LegL/LegR 가 이미 관절 위치에 피벗이 잡혀 있어서
 * rotation.x 만 돌려도 걷기 모션이 됩니다. 앞쪽은 +Z.
 */
export function createAvatar(charId, jacket = false) {
  const tpl = templates.get(charId) || templates.get(CHARACTERS[0].id);
  const model = tpl.clone(true); // 지오메트리/머티리얼은 공유
  const parts = {};
  const casual = [];
  const jackets = [];
  model.traverse((o) => {
    for (const k of ['Head', 'ArmL', 'ArmR', 'LegL', 'LegR']) if (o.name.endsWith(`_${k}`)) parts[k] = o;
    if (o.name.includes('_Outfit_Casual')) casual.push(o);
    if (o.name.includes('_Outfit_Jacket')) jackets.push(o);
  });
  const root = new THREE.Group();
  root.add(model);
  const av = {
    root, model, parts, charId,
    phase: Math.random() * 6, amp: 0, air: 0, seed: Math.random() * 10,
    setJacket(on) {
      jackets.forEach((o) => (o.visible = on));
      casual.forEach((o) => (o.visible = !on));
    },
  };
  av.setJacket(!!jacket);
  return av;
}

/** speed: 0(정지)~1(전속), air: 공중 여부(점프) */
export function animateAvatar(av, dt, speed, t, air = false) {
  const { ArmL, ArmR, LegL, LegR, Head } = av.parts;
  av.amp += (speed - av.amp) * Math.min(1, dt * 12);
  av.air += ((air ? 1 : 0) - av.air) * Math.min(1, dt * 14);
  av.phase += dt * (7 + av.amp * 5);
  const s = Math.sin(av.phase);
  const a = av.amp * (1 - av.air);
  const idle = 1 - av.amp;
  if (ArmL) {
    ArmL.rotation.x = s * 0.95 * a + (-2.7 * av.air);
    ArmR.rotation.x = -s * 0.95 * a + (-2.7 * av.air);
    ArmL.rotation.z = Math.sin(t * 1.7 + av.seed) * 0.05 * idle;
    ArmR.rotation.z = -Math.sin(t * 1.7 + av.seed) * 0.05 * idle;
  }
  if (LegL) {
    LegL.rotation.x = -s * 0.85 * a + 0.25 * av.air;
    LegR.rotation.x = s * 0.85 * a - 0.15 * av.air;
  }
  if (Head) Head.rotation.z = Math.sin(av.phase * 0.5) * 0.05 * av.amp;
  av.model.position.y = Math.abs(Math.cos(av.phase)) * 0.05 * a + Math.sin(t * 2.2 + av.seed) * 0.008 * idle;
}

/* ----------------------------------------------------------- lights util */

function addStudioLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe6f5, 1.5));
  const d = new THREE.DirectionalLight(0xffffff, 1.7);
  d.position.set(2.5, 4, 5);
  scene.add(d);
}

/* ------------------------------------------------------------- thumbnails */

let thumb = null;
const thumbCache = new Map();

/** 카드/선택 타일용 상반신 썸네일(dataURL). */
export function avatarThumb(charId, jacket) {
  const key = `${charId}|${jacket ? 1 : 0}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (!thumb) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(200, 200);
    const scene = new THREE.Scene();
    addStudioLights(scene);
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 30);
    camera.position.set(0.45, 1.0, 3.25);
    camera.lookAt(0, 0.87, 0);
    thumb = { renderer, scene, camera };
  }
  const av = createAvatar(charId, jacket);
  av.root.rotation.y = -0.25;
  thumb.scene.add(av.root);
  thumb.renderer.render(thumb.scene, thumb.camera);
  const url = thumb.renderer.domElement.toDataURL('image/png');
  thumb.scene.remove(av.root);
  thumbCache.set(key, url);
  return url;
}

/* --------------------------------------------------------------- preview */

/** 캐릭터 선택 화면의 회전 무대. 드래그로 돌려볼 수 있음. */
export class AvatarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    addStudioLights(this.scene);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    this.camera.position.set(0, 0.95, 3.5);
    this.camera.lookAt(0, 0.66, 0);

    // 받침대: 하얀 원판 + Wii 블루 링
    const pad = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.8, 0.06, 48), new THREE.MeshBasicMaterial({ color: 0xf2fbff }));
    disc.position.y = -0.04;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 8, 64), new THREE.MeshBasicMaterial({ color: 0x35b8ec }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.005;
    pad.add(disc, ring);
    this.scene.add(pad);

    this.av = null;
    this.spin = 0.4;
    this.hop = 1;
    this.drag = null;
    this.last = 0;
    this.running = false;
    this.t = 0;

    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.spin += (e.clientX - this.drag.x) * 0.012;
      this.drag.x = e.clientX;
    });
    const end = () => { this.drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setAvatar(charId, jacket) {
    const keepSpin = this.av ? this.spin : 0.4;
    if (this.av) this.scene.remove(this.av.root);
    this.av = createAvatar(charId, jacket);
    this.spin = keepSpin;
    this.scene.add(this.av.root);
    this.hop = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.resize();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      if (!this.drag) this.spin += dt * 0.6;
      this.hop = Math.min(1, this.hop + dt * 2.4);
      if (this.av) {
        this.av.root.rotation.y = this.spin;
        this.av.root.position.y = Math.sin(this.hop * Math.PI) * 0.22;
        animateAvatar(this.av, dt, 0, this.t);
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
