// DOM UI: 로딩 / 입력 마법사 / 방명록 대시보드 / 근처 말풍선 / HUD

import { CONFIG, CHARACTERS, GRADES, characterOf, gradeOf } from './config.js';
import { avatarThumb, AvatarPreview } from './avatars.js';
import { rankEntries } from './store.js';
import { sfx } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const heartSvg = '<svg class="ic"><use href="#i-heart"/></svg>';

/* ---------------------------------------------------------------- toast */

let toastTimer;
export function toast(msg, ms = 2000) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export function burstHearts(fromEl) {
  const r = fromEl.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    n.setAttribute('class', 'floating-heart');
    n.innerHTML = '<use href="#i-heart"/>';
    n.style.left = `${r.left + r.width / 2 - 13}px`;
    n.style.top = `${r.top + r.height / 2 - 13}px`;
    n.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
    n.style.animationDelay = `${i * 40}ms`;
    document.body.append(n);
    setTimeout(() => n.remove(), 1100);
  }
}

/* -------------------------------------------------------------- loading */

export const loading = {
  set(p, text) {
    $('#loadFill').style.width = `${Math.max(4, Math.round(p * 100))}%`;
    if (text) $('#loadText').textContent = text;
  },
  error(msg) {
    const t = $('#loadText');
    t.textContent = msg;
    t.classList.add('is-error');
  },
  hide() {
    const s = $('#loading');
    s.classList.add('is-leaving');
    setTimeout(() => (s.hidden = true), 380);
  },
};

/* ---------------------------------------------------------------- setup */

export class Setup {
  constructor() {
    this.root = $('#setup');
    this.form = $('#setupForm');
    this.state = { char: CHARACTERS[0].id, jacket: false, name: '', grade: '', message: '' };
    this.step = 1;
    this.editing = false;
    this.preview = null;
    this.onSubmit = null;
    this.onCancel = null;
    this.busy = false;

    $('#logoYear').textContent = CONFIG.eventYear;
    $('#logoTitle').textContent = CONFIG.eventTitle;
    $('#hudTitle').textContent = CONFIG.eventTitle;
    $('#nameInput').maxLength = CONFIG.limits.name;
    $('#msgInput').maxLength = CONFIG.limits.message;
    $('#msgCount').parentElement.lastChild.textContent = `/${CONFIG.limits.message}`;

    this._buildPicker();
    this._buildGrades();
    this._bind();
  }

  _buildPicker() {
    const picker = $('#picker');
    picker.innerHTML = CHARACTERS.map((c) => `
      <button type="button" role="radio" class="tile" data-char="${c.id}" aria-checked="false" aria-label="${c.label}">
        <i class="gender ${c.gender}">${c.gender === 'm' ? '♂' : '♀'}</i>
        <img alt="" width="84" height="84"><span>${c.label}</span>
      </button>`).join('');
  }

  _buildGrades() {
    $('#gradeChips').innerHTML = GRADES.map((g) => `
      <label class="gchip" style="--c:${g.color}">
        <input type="radio" name="grade" value="${g.id}"><span>${g.label}</span>
      </label>`).join('');
  }

  _bind() {
    $('#picker').addEventListener('click', (e) => {
      const t = e.target.closest('.tile');
      if (t) { sfx.tap(); this.setChar(t.dataset.char); }
    });
    $('#charPrev').addEventListener('click', () => this._cycle(-1));
    $('#charNext').addEventListener('click', () => this._cycle(1));
    $$('.seg__btn').forEach((b) => b.addEventListener('click', () => { sfx.tap(); this.setJacket(b.dataset.jacket === '1'); }));

    $('#nameInput').addEventListener('input', (e) => {
      this.state.name = e.target.value;
      this._clearErr('name');
      this._tag();
    });
    $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._next(); } });
    $('#gradeChips').addEventListener('change', (e) => {
      this.state.grade = e.target.value;
      sfx.tap();
      this._clearErr('grade');
      this._tag();
    });
    $('#msgInput').addEventListener('input', (e) => {
      this.state.message = e.target.value;
      $('#msgCount').textContent = [...e.target.value].length;
      this._clearErr('msg');
    });

    $('#btnNext').addEventListener('click', () => this._next());
    $('#btnPrev').addEventListener('click', () => this._prev());
    this.form.addEventListener('submit', (e) => e.preventDefault());
  }

  _cycle(d) {
    sfx.tap();
    const i = CHARACTERS.findIndex((c) => c.id === this.state.char);
    this.setChar(CHARACTERS[(i + d + CHARACTERS.length) % CHARACTERS.length].id);
  }

  setChar(id) {
    this.state.char = id;
    const c = characterOf(id);
    $$('.tile').forEach((t) => t.setAttribute('aria-checked', String(t.dataset.char === id)));
    $('#charName').textContent = c.label;
    const g = $('#charGender');
    g.textContent = c.gender === 'm' ? '♂' : '♀';
    g.className = `gender ${c.gender}`;
    this.preview?.setAvatar(id, this.state.jacket);
    this._thumbs();
  }

  setJacket(on) {
    this.state.jacket = on;
    $$('.seg__btn').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.jacket === '1') === on)));
    this.preview?.setAvatar(this.state.char, on);
    this._thumbs();
  }

  _thumbs() {
    $$('.tile').forEach((t) => { t.querySelector('img').src = avatarThumb(t.dataset.char, this.state.jacket); });
    $('#miniAvatar').src = avatarThumb(this.state.char, this.state.jacket);
  }

  _tag() {
    const g = this.state.grade ? gradeOf(this.state.grade) : null;
    const el = $('#tagPreview');
    $('.nametag__grade', el).textContent = g ? g.label : '학년';
    $('.nametag__name', el).textContent = this.state.name.trim() || '이름';
    el.style.setProperty('--c', g ? g.color : '#b5c0ca');
  }

  _err(field, msg) {
    $(`#${field}Err`).textContent = msg;
    const wrap = $(`#${field}Err`).closest('.field');
    wrap?.classList.add('has-err');
    sfx.error();
  }
  _clearErr(field) {
    $(`#${field}Err`).textContent = '';
    $(`#${field}Err`).closest('.field')?.classList.remove('has-err');
  }

  _validate(step) {
    if (step === 2) {
      const name = this.state.name.trim();
      if (!name) { this._err('name', '이름을 입력해 주세요.'); $('#nameInput').focus(); return false; }
      if (!this.state.grade) { this._err('grade', '학년을 선택해 주세요.'); return false; }
    }
    if (step === 3) {
      if (!this.state.message.trim()) { this._err('msg', '방명록 내용을 한 줄 이상 적어 주세요.'); $('#msgInput').focus(); return false; }
    }
    return true;
  }

  async _next() {
    if (this.busy) return;
    if (!this._validate(this.step)) return;
    if (this.step < 3) { sfx.next(); this.go(this.step + 1); return; }
    this.busy = true;
    $('#btnNext').disabled = true;
    try {
      const s = this.state;
      await this.onSubmit?.({ name: s.name.trim(), grade: s.grade, char: s.char, jacket: s.jacket, message: s.message.trim() });
    } catch (err) {
      console.error(err);
      toast('저장하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.', 3200);
      sfx.error();
    } finally {
      this.busy = false;
      $('#btnNext').disabled = false;
    }
  }

  _prev() {
    sfx.back();
    if (this.step > 1) this.go(this.step - 1);
    else if (this.editing) this.onCancel?.();
  }

  go(n) {
    this.step = n;
    $$('.step', this.form).forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    $$('.steps li').forEach((li) => {
      const k = Number(li.dataset.step);
      li.classList.toggle('is-on', k === n);
      li.classList.toggle('is-done', k < n);
    });
    $('#btnPrev').hidden = n === 1 && !this.editing;
    $('#btnPrev').textContent = n === 1 ? '취소' : '이전';
    $('#btnNext').textContent = n < 3 ? '다음' : this.editing ? '저장하기' : '입장하기';
    this.root.scrollTop = 0;
    if (n === 1) { this.preview?.start(); } else this.preview?.stop();
    if (n === 2) this._tag();
    if (n === 3) $('#msgCount').textContent = [...this.state.message].length;
  }

  open({ profile = null, editing = false, onSubmit, onCancel, note = '' }) {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.editing = editing;
    if (profile) {
      this.state = { char: profile.char, jacket: !!profile.jacket, name: profile.name, grade: profile.grade, message: profile.message };
      $('#nameInput').value = profile.name;
      $('#msgInput').value = profile.message;
      const r = $(`input[name=grade][value="${profile.grade}"]`);
      if (r) r.checked = true;
    }
    const n = $('#setupNote');
    n.hidden = !note;
    n.textContent = note;

    this.root.hidden = false;
    this.root.classList.remove('is-leaving');
    this.preview ??= new AvatarPreview($('#previewCanvas'));
    this.setChar(this.state.char);
    this.setJacket(this.state.jacket);
    this.go(1);
  }

  close() {
    this.preview?.stop();
    this.root.classList.add('is-leaving');
    setTimeout(() => { if (this.root.classList.contains('is-leaving')) this.root.hidden = true; }, 380);
  }
}

/* -------------------------------------------------------- entry markup */

function entryHead(e, rank, mine) {
  const g = gradeOf(e.grade);
  return `
    <span class="chip" style="--c:${g.color}">${g.label}</span>
    <strong>${esc(e.name)}</strong>
    ${rank ? `<span class="rank-tag r${rank}">TOP ${rank}</span>` : ''}
    ${mine ? '<span class="me-tag">나</span>' : ''}`;
}

const likeBtn = (e, mine, liked) => `
  <button type="button" class="like ${liked ? 'is-on' : ''}" data-like="${esc(e.id)}" aria-pressed="${liked}"
    ${mine ? 'disabled aria-label="내 방명록에는 하트를 누를 수 없어요"' : `aria-label="${esc(e.name)}님의 방명록에 하트"`}>
    ${heartSvg}<span class="like__n">${e.likes}</span>
  </button>`;

/* ------------------------------------------------------------ dashboard */

export class Board {
  constructor({ store, getMyId, onLike, onFind, onToggle }) {
    this.store = store;
    this.getMyId = getMyId;
    this.onLike = onLike;
    this.onFind = onFind;
    this.onToggle = onToggle;
    this.root = $('#boardRoot');
    this.list = $('#boardList');
    this.sort = 'likes';
    this.open_ = false;
    this.count = 0;

    $$('[data-close]', this.root).forEach((el) => el.addEventListener('click', () => { sfx.back(); this.close(); }));
    $$('.tab', this.root).forEach((t) => t.addEventListener('click', () => {
      sfx.tap();
      this.sort = t.dataset.sort;
      $$('.tab', this.root).forEach((x) => { x.classList.toggle('is-on', x === t); x.setAttribute('aria-selected', String(x === t)); });
      this.render();
      this.list.scrollTop = 0;
    }));
    this.list.addEventListener('click', (e) => {
      const like = e.target.closest('.like');
      if (like) { this.onLike(like.dataset.like, like); return; }
      const find = e.target.closest('.find');
      if (find) this.onFind(find.dataset.find);
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open_) this.close(); });

    $('#modeNote').textContent = store.mode === 'local' ? '데모 모드: 이 기기에만 저장돼요.' : '';
  }

  open() {
    this.open_ = true;
    this.root.hidden = false;
    this.render();
    this.list.scrollTop = 0;
    this.onToggle?.(true);
    $('.tab.is-on', this.root).focus({ preventScroll: true });
  }
  close() {
    this.open_ = false;
    this.root.hidden = true;
    this.onToggle?.(false);
  }

  render() {
    const entries = [...this.store.entries];
    const rank = new Map(rankEntries(entries).map((e, i) => [e.id, i + 1]));
    entries.sort(this.sort === 'likes'
      ? (a, b) => b.likes - a.likes || a.createdAt - b.createdAt
      : (a, b) => b.createdAt - a.createdAt);
    this.count = entries.length;
    if (!entries.length) {
      this.list.innerHTML = '<p class="empty">아직 방명록이 없어요.<br>첫 번째 글의 주인공이 되어 보세요!</p>';
      return;
    }
    const me = this.getMyId();
    this.list.innerHTML = entries.map((e) => {
      const mine = e.id === me;
      const r = rank.get(e.id) || 0;
      return `
      <article class="entry ${mine ? 'is-mine' : ''} ${r ? `rank-${r}` : ''}" data-id="${esc(e.id)}">
        <img class="entry__avatar" alt="" src="${avatarThumb(e.char, e.jacket)}">
        <div>
          <div class="entry__head">${entryHead(e, r, mine)}</div>
          <p class="entry__msg">${esc(e.message)}</p>
          <div class="entry__foot">
            <time class="entry__time">${timeAgo(e.createdAt)}</time>
            <div class="entry__actions">
              ${mine ? '' : `<button type="button" class="find" data-find="${esc(e.id)}"><svg class="ic"><use href="#i-pin"/></svg>찾아가기</button>`}
              ${likeBtn(e, mine, this.store.isLiked(e.id))}
            </div>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  /** 스토어 변경 시: 새 글이 오면 (맨 위일 때만) 다시 그리고, 아니면 하트 숫자만 제자리 갱신 */
  update(entries) {
    if (!this.open_) return;
    if (entries.length !== this.count && this.list.scrollTop < 40) { this.render(); return; }
    for (const e of entries) {
      const b = this.list.querySelector(`.like[data-like="${CSS.escape(e.id)}"]`);
      if (!b) continue;
      const liked = this.store.isLiked(e.id);
      b.classList.toggle('is-on', liked);
      b.setAttribute('aria-pressed', String(liked));
      b.querySelector('.like__n').textContent = e.likes;
    }
  }
}

/* ------------------------------------------------------------ near card */

export class NearCard {
  constructor({ store, getMyId, onLike }) {
    this.el = $('#nearCard');
    this.store = store;
    this.getMyId = getMyId;
    this.id = null;
    this.el.addEventListener('click', (e) => {
      const like = e.target.closest('.like');
      if (like) onLike(like.dataset.like, like);
    });
  }

  show(id) {
    if (!id) { this.id = null; this.el.hidden = true; return; }
    const e = this.store.get(id);
    if (!e) { this.id = null; this.el.hidden = true; return; }
    const changed = this.id !== id;
    this.id = id;
    const rank = rankEntries(this.store.entries).findIndex((x) => x.id === id) + 1;
    const mine = id === this.getMyId();
    this.el.innerHTML = `
      <img class="near__avatar" alt="" src="${avatarThumb(e.char, e.jacket)}">
      <div class="near__body">
        <div class="near__head">${entryHead(e, rank, mine)}</div>
        <p class="near__msg">${esc(e.message)}</p>
      </div>
      ${likeBtn(e, mine, this.store.isLiked(id))}`;
    this.el.hidden = false;
    if (changed) { this.el.style.animation = 'none'; void this.el.offsetWidth; this.el.style.animation = ''; }
  }

  update() { if (this.id) this.show(this.id); }
}

/* ------------------------------------------------------------------ hud */

export function startClock() {
  const tick = () => {
    const d = new Date();
    $('#clockTime').textContent = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
    $('#clockDate').textContent = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  };
  tick();
  setInterval(tick, 15000);
}
