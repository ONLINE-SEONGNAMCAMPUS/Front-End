// 방명록 데이터 계층.
//  - LocalStore    : localStorage (데모/오프라인). 이 기기에만 저장.
//  - FirebaseStore : Firestore 실시간 공유. CONFIG.firebase 가 있으면 사용.
// 두 구현은 같은 인터페이스: ready / subscribe / get / add / update / toggleLike / isLiked

import { CONFIG, CHARACTERS } from './config.js';

const LS = {
  entries: 'gb.entries.v1',
  liked: 'gb.liked.v1',
  me: 'gb.me.v1',
};

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } };

/** 좋아요 1개 이상인 방명록 중 상위 3개. 동점이면 먼저 쓴 글이 앞. */
export function rankEntries(list, n = 3) {
  return list
    .filter((e) => e.likes > 0)
    .sort((a, b) => b.likes - a.likes || a.createdAt - b.createdAt)
    .slice(0, n);
}

export const myProfile = () => read(LS.me, null);
export const saveMyProfile = (p) => write(LS.me, p);

class BaseStore {
  constructor() {
    this.entries = [];
    this.listeners = new Set();
    this.liked = new Set(read(LS.liked, []));
  }
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.entries);
    return () => this.listeners.delete(fn);
  }
  emit() { this.listeners.forEach((fn) => fn(this.entries)); }
  get(id) { return this.entries.find((e) => e.id === id) || null; }
  isLiked(id) { return this.liked.has(id); }
  _saveLiked() { write(LS.liked, [...this.liked]); }
}

/* ---------------------------------------------------------------- local */

const DEMO = [
  ['김하늘', '2', 'female_01_longhair', true, '부스 구경하다가 길을 잃었는데 이 월드가 제일 재밌어요!', 14],
  ['이도윤', '3', 'male_01_spiky', true, '작품 전시 너무 멋져요. 과잠 입고 오길 잘했다 ㅎㅎ', 11],
  ['박서연', '1', 'female_02_twintails', false, '선배님들 덕분에 학술제 즐겁게 구경했습니다!', 8],
  ['최민준', '4', 'male_02_curly', true, '마지막 학술제... 4년 동안 고생했다 우리 모두 🎓', 6],
  ['정유나', '2', 'female_03_bun', false, '캐릭터 너무 귀여워요. Wii 감성 최고', 4],
  ['한지호', 'guest', 'male_03_moustache', false, '졸업생입니다. 후배들 열정이 보기 좋네요. 응원합니다!', 2],
  ['오세린', '1', 'female_01_longhair', false, '처음 와봤는데 재미있어요', 1],
  ['강태오', '3', 'male_01_spiky', true, '여기 방명록 1등 노려본다', 0],
];

class LocalStore extends BaseStore {
  constructor() {
    super();
    this.mode = 'local';
    let saved = read(LS.entries, null);
    if (!saved) {
      const now = Date.now();
      saved = DEMO.map(([name, grade, char, jacket, message, likes], i) => ({
        id: `demo-${i + 1}`, name, grade, char, jacket, message, likes,
        createdAt: now - (i + 1) * 7 * 60 * 1000,
      }));
      write(LS.entries, saved);
    }
    this.entries = saved;
    window.addEventListener('storage', (e) => {
      if (e.key === LS.entries) { this.entries = read(LS.entries, []); this.emit(); }
      if (e.key === LS.liked) this.liked = new Set(read(LS.liked, []));
    });
  }
  async ready() { return this; }
  _save() { write(LS.entries, this.entries); this.emit(); }

  async add(data) {
    const entry = { ...data, id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, likes: 0, createdAt: Date.now() };
    this.entries = [entry, ...this.entries];
    this._save();
    return entry.id;
  }
  async update(id, patch) {
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    this._save();
  }
  async toggleLike(id) {
    const on = !this.liked.has(id);
    on ? this.liked.add(id) : this.liked.delete(id);
    this._saveLiked();
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, likes: Math.max(0, e.likes + (on ? 1 : -1)) } : e));
    this._save();
    return on;
  }
}

/* ------------------------------------------------------------- firebase */

class FirebaseStore extends BaseStore {
  constructor() { super(); this.mode = 'firebase'; }

  async ready() {
    const V = '10.12.2';
    const [{ initializeApp }, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);
    this.fs = fs;
    this.db = fs.getFirestore(initializeApp(CONFIG.firebase));
    this.col = fs.collection(this.db, CONFIG.collection);
    await new Promise((resolve, reject) => {
      fs.onSnapshot(
        fs.query(this.col, fs.orderBy('createdAt', 'desc'), fs.limit(300)),
        (snap) => {
          this.entries = snap.docs.map((d) => ({ id: d.id, likes: 0, ...d.data() }));
          this.emit();
          resolve();
        },
        reject,
      );
    });
    return this;
  }

  async add(data) {
    const ref = await this.fs.addDoc(this.col, { ...data, likes: 0, createdAt: Date.now() });
    return ref.id;
  }
  async update(id, patch) {
    await this.fs.updateDoc(this.fs.doc(this.db, CONFIG.collection, id), patch);
  }
  async toggleLike(id) {
    const on = !this.liked.has(id);
    on ? this.liked.add(id) : this.liked.delete(id);
    this._saveLiked();
    // 낙관적 반영 (스냅샷이 곧 덮어씀)
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, likes: Math.max(0, e.likes + (on ? 1 : -1)) } : e));
    this.emit();
    await this.fs.updateDoc(this.fs.doc(this.db, CONFIG.collection, id), { likes: this.fs.increment(on ? 1 : -1) });
    return on;
  }
}

export async function createStore() {
  if (CONFIG.firebase) {
    try {
      return await new FirebaseStore().ready();
    } catch (err) {
      console.warn('[store] Firebase 연결 실패 → 데모(로컬) 모드로 전환', err);
    }
  }
  return new LocalStore().ready();
}

export const validChar = (id) => (CHARACTERS.some((c) => c.id === id) ? id : CHARACTERS[0].id);
