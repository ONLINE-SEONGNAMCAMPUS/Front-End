import { CONFIG } from './config.js';
import { createStore, myProfile, saveMyProfile } from './store.js';
import { loadCharacters } from './avatars.js';
import { Controls } from './controls.js';
import { World } from './world.js';
import { Setup, Board, NearCard, loading, toast, burstHearts, startClock } from './ui.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);

async function boot() {
  loading.set(0.04, '캐릭터를 불러오는 중…');
  let store;
  try {
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]);
    await loadCharacters((p) => loading.set(0.05 + p * 0.8));
    loading.set(0.9, '방명록을 불러오는 중…');
    store = await createStore();
  } catch (err) {
    console.error(err);
    loading.error('불러오지 못했어요. 네트워크를 확인하고 새로고침해 주세요.');
    return;
  }
  loading.set(1, '준비 완료!');

  const controls = new Controls({ stick: $('#stick'), jump: $('#jump'), canvas: $('#world') });
  controls.enabled = false;

  let world;
  try {
    world = new World({ canvas: $('#world'), controls, onNear: (id) => showNear(id), onTap: (id) => showNear(id, { pin: true }) });
  } catch (err) {
    console.error(err);
    loading.error('이 기기/브라우저에서는 3D를 사용할 수 없어요. 최신 Chrome 또는 Safari로 열어 주세요.');
    return;
  }

  const getMyId = () => myProfile()?.id ?? null;

  /* ---------- 좋아요 ---------- */
  async function like(id, btn) {
    if (id === getMyId()) return;
    sfx.unlock();
    let on;
    try { on = await store.toggleLike(id); } catch (err) {
      console.error(err);
      toast('하트를 저장하지 못했어요. 잠시 후 다시 눌러 주세요.', 2600);
      return;
    }
    on ? sfx.like() : sfx.unlike();
    document.querySelectorAll(`.like[data-like="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
    });
    if (on && btn?.isConnected) burstHearts(btn);
  }

  /* ---------- UI 조립 ---------- */
  const card = new NearCard({ store, getMyId, onLike: like });
  const board = new Board({
    store, getMyId, onLike: like,
    onFind: (id) => {
      const e = store.get(id);
      board.close();
      if (world.teleportToEntry(id)) { showNear(id, { pin: true }); sfx.next(); }
      else toast(`${e ? e.name : '이'}님은 지금 월드에 없어요. 목록에서 하트를 눌러 주세요.`, 2800);
    },
    onToggle: (open) => { controls.enabled = !open; if (open) controls.reset(); },
  });
  const setup = new Setup();

  let pinned = null;
  let pinTimer;
  function showNear(id, { pin = false } = {}) {
    if (pin) {
      pinned = id;
      card.show(id);
      clearTimeout(pinTimer);
      pinTimer = setTimeout(() => { pinned = null; card.show(world.nearId); }, 6500);
      return;
    }
    if (pinned) return;
    card.show(id);
  }

  store.subscribe((entries) => {
    world.setEntries(entries);
    board.update(entries);
    card.update();
    $('#boardCount').textContent = entries.length > 99 ? '99+' : entries.length;
  });

  /* ---------- 입장 / 수정 ---------- */
  async function saveProfile(data) {
    const prev = myProfile();
    let id = prev?.id && store.get(prev.id) ? prev.id : null;
    if (id) await store.update(id, data);
    else id = await store.add(data);
    saveMyProfile({ id, ...data });
    return { id, ...data };
  }

  async function enterWorld(data, { editing }) {
    sfx.unlock();
    const me = await saveProfile(data);
    world.setPlayer(me);
    world.setEntries(store.entries);
    setup.close();
    $('#hud').hidden = false;
    document.body.classList.remove('editing');
    document.body.classList.add('in-world');
    controls.enabled = true;
    world.start({ intro: !editing });
    sfx.enter();
    toast(editing ? '내 정보를 저장했어요' : `${me.name}님, 환영해요! 조이스틱으로 돌아다녀 보세요`, 3200);
  }

  const first = myProfile();
  const openSetup = (editing) => {
    setup.open({
      profile: editing ? myProfile() : first,
      editing,
      note: !editing && first ? '이전에 쓴 방명록을 불러왔어요. 입장하면 이 내용으로 수정돼요.' : editing ? '내 캐릭터와 방명록을 바꿀 수 있어요. 받은 하트는 그대로예요.' : '',
      onSubmit: (data) => enterWorld(data, { editing }),
      onCancel: () => {
        document.body.classList.remove('editing');
        setup.close();
        controls.enabled = true;
        world.start({ intro: false });
      },
    });
  };

  loading.hide();
  document.body.classList.remove('in-world');
  openSetup(false);

  /* ---------- HUD 버튼 ---------- */
  $('#btnBoard').addEventListener('click', () => { sfx.next(); board.open(); });
  $('#btnMe').addEventListener('click', () => {
    sfx.tap();
    controls.enabled = false;
    world.pause();
    document.body.classList.add('editing');
    openSetup(true);
  });
  $('#btnPlaza').addEventListener('click', () => { sfx.tap(); world.goToPlaza(); toast('Top 3 광장으로 왔어요'); });
  startClock();

  // 탭이 백그라운드로 가면 조이스틱 입력 초기화
  document.addEventListener('visibilitychange', () => { if (document.hidden) controls.reset(); });
}

boot();
