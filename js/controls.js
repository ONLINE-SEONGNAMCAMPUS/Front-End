// 가상 조이스틱 + 점프 버튼 + 화면 드래그(카메라 회전) + 키보드(PC 테스트용)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Controls {
  constructor({ stick, jump, canvas }) {
    this.enabled = true;
    this.stickVec = { x: 0, y: 0 };
    this.keys = new Set();
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.jumpQueued = false;
    this.onTap = null;

    this._bindStick(stick);
    this._bindJump(jump);
    this._bindCanvas(canvas);
    this._bindKeys();
  }

  /** 카메라 기준 이동 입력 (-1..1, 길이 ≤ 1). y<0 = 앞으로 */
  get move() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.stickVec.x;
    let y = this.stickVec.y;
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (kx || ky) { x = kx; y = ky; }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  consumeJump() {
    const j = this.jumpQueued && this.enabled;
    this.jumpQueued = false;
    return j;
  }

  consumeLook() {
    const l = { yaw: this.yawDelta, pitch: this.pitchDelta };
    this.yawDelta = 0;
    this.pitchDelta = 0;
    return l;
  }

  reset() {
    this.stickVec = { x: 0, y: 0 };
    this.keys.clear();
    this.jumpQueued = false;
    this._knobReset?.();
  }

  _bindStick(base) {
    const knob = base.querySelector('.stick__knob');
    let id = null;
    let rect = null;
    const place = (e) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.34;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      this.stickVec = { x: dx / max, y: dy / max };
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    this._knobReset = () => {
      id = null;
      this.stickVec = { x: 0, y: 0 };
      knob.style.transform = '';
      base.classList.remove('is-active');
    };
    base.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      rect = base.getBoundingClientRect();
      base.setPointerCapture(id);
      base.classList.add('is-active');
      place(e);
      e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) place(e); });
    const end = (e) => { if (e.pointerId === id) this._knobReset(); };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    base.addEventListener('lostpointercapture', end);
  }

  _bindJump(btn) {
    btn.addEventListener('pointerdown', (e) => {
      this.jumpQueued = true;
      btn.classList.add('is-down');
      e.preventDefault();
    });
    const up = () => btn.classList.remove('is-down');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  _bindCanvas(canvas) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || !this.enabled) return;
      this.yawDelta -= (e.clientX - drag.x) * 0.0065;
      this.pitchDelta += (e.clientY - drag.y) * 0.0045;
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (e.type === 'pointerup' && moved < 10 && performance.now() - drag.t < 350 && this.enabled) {
        this.onTap?.(e.clientX, e.clientY);
      }
      drag = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  _bindKeys() {
    const typing = (e) => e.target instanceof HTMLElement && e.target.matches('input, textarea, [contenteditable]');
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { this.jumpQueued = true; e.preventDefault(); return; }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }
}

export { clamp };
