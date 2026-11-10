// 아주 작은 WebAudio 효과음 (외부 파일 없음). 사용자 터치 이후에만 소리가 납니다.

let ctx = null;

function ac() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, start, dur, { type = 'sine', vol = 0.1, slideTo = null } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  unlock: () => ac(),
  tap: () => tone(1320, 0, 0.07, { vol: 0.07 }),
  next: () => { tone(880, 0, 0.08, { vol: 0.08 }); tone(1320, 0.06, 0.1, { vol: 0.08 }); },
  back: () => tone(660, 0, 0.1, { vol: 0.07, slideTo: 440 }),
  like: () => { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, i * 0.055, 0.14, { vol: 0.08, type: 'triangle' })); },
  unlike: () => tone(660, 0, 0.14, { vol: 0.06, slideTo: 330 }),
  jump: () => tone(420, 0, 0.16, { vol: 0.06, slideTo: 900, type: 'square' }),
  enter: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.07, 0.22, { vol: 0.09, type: 'triangle' })); },
  error: () => { tone(280, 0, 0.12, { vol: 0.08, type: 'square' }); tone(220, 0.1, 0.16, { vol: 0.08, type: 'square' }); },
};
