// 관리자 화면: 접속자 수, 방 상태, 닉네임 강제 변경, 게시물 삭제, 건의함
// 관리자인지는 보안 규칙이 admins/{uid} 로 확인한다. (이 화면을 열어도 관리자가 아니면 아무것도 읽거나 지울 수 없다)
import { ref, get, onValue, update, remove } from 'firebase/database';
import { connect } from '../net/firebase.js';
import { ROOM_COUNT, ROOM_MAX } from '../net/RoomNet.js';
import { GAME_BY_ID } from '../ui/gameMenu.js';
import { icon } from '../ui/icons.js';
import '../ui/pixel.css';
import '../ui/icons.css';

const $ = (id) => document.getElementById(id);
const AREA_NAMES = { lobby: '로비', room1: '방 1', room2: '방 2', room3: '방 3', room4: '방 4' };

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else if (k === 'onclick') e.onclick = v;
    else e[k] = v;
  }
  e.append(...children);
  return e;
}

const time = (ms) => (ms ? new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

let db;
const names = new Map(); // uid → 이름 (한 번 읽은 것은 기억)
async function nameOf(uid) {
  if (!uid) return '—';
  if (!names.has(uid)) names.set(uid, get(ref(db, `users/${uid}/name`)).then((s) => s.val() || '(이름 없음)'));
  return names.get(uid);
}

async function main() {
  $('back').href = `../${location.search}`; // ?emu 를 유지
  let conn;
  try {
    conn = await connect();
  } catch (err) {
    console.error(err);
    $('status').textContent = '접속 실패 — 새로고침해 주세요.';
    return;
  }
  if (!conn) {
    $('status').textContent = 'Firebase 설정(src/firebase-config.js)이 비어 있어요.';
    return;
  }
  db = conn.db;
  const { uid } = conn;
  const isAdmin = (await get(ref(db, `admins/${uid}`))).val() === true;
  if (!isAdmin) {
    $('status-box').hidden = true;
    $('not-admin').hidden = false;
    $('my-uid').textContent = uid;
    $('copy-uid').onclick = () => navigator.clipboard?.writeText(uid).then(() => ($('copy-uid').textContent = '복사됨!'));
    return;
  }
  $('status').textContent = '관리자로 접속했어요.';
  $('admin').hidden = false;
  watchPresence();
  watchRooms();
  watchFeedback();
  $('load-users').onclick = loadAllUsers;
  $('load-posts').onclick = loadPosts;
}

// ── 접속자 ──
let online = {};
function watchPresence() {
  onValue(ref(db, 'presence'), async (snap) => {
    online = snap.val() || {};
    const entries = Object.entries(online);
    $('online-count').textContent = entries.length;
    const byArea = {};
    for (const [, p] of entries) byArea[p.area] = (byArea[p.area] || 0) + 1;
    $('area-chips').replaceChildren(
      ...Object.entries(byArea).map(([a, n]) => el('span', { class: 'chip', text: `${AREA_NAMES[a] || a} ${n}` })),
      ' ',
    );
    const rows = await Promise.all(
      entries
        .sort((a, b) => (a[1].at || 0) - (b[1].at || 0))
        .map(async ([u, p]) => el('tr', {}, [el('td', { text: await nameOf(u) }), el('td', { text: AREA_NAMES[p.area] || p.area }), el('td', { text: time(p.at) })])),
    );
    $('online-list').replaceChildren(...(rows.length ? rows : [el('tr', {}, [el('td', { class: 'empty', text: '접속한 사람이 없어요.', colSpan: 3 })])]));
    if (!usersLoaded) renderUsers(Object.keys(online));
  });
}

// ── 방 상태 (작은 값들만 구독: 위치·채팅은 받지 않는다) ──
const rooms = {};
function watchRooms() {
  for (let n = 1; n <= ROOM_COUNT; n++) {
    rooms[n] = {};
    for (const key of ['host', 'game', 'state', 'locked']) {
      onValue(ref(db, `rooms/${n}/${key}`), (s) => {
        rooms[n][key] = s.val();
        renderRooms();
      });
    }
  }
  onValue(ref(db, 'lobby/roomMembers'), (s) => {
    const v = s.val() || {};
    for (let n = 1; n <= ROOM_COUNT; n++) rooms[n].count = Object.keys(v[n] || {}).length;
    renderRooms();
  });
}

async function renderRooms() {
  const cards = [];
  for (let n = 1; n <= ROOM_COUNT; n++) {
    const r = rooms[n] || {};
    const count = r.count || 0;
    const lines = [`인원 ${count}/${ROOM_MAX}`];
    if (count) {
      lines.push(`방장 ${await nameOf(r.host)}`);
      lines.push(r.locked ? [icon('lock'), ' 잠김'] : [icon('unlock'), ' 열림']);
      lines.push(r.game ? [icon('dice'), ` ${GAME_BY_ID[r.game.id]?.name || r.game.id}`] : '게임 고르는 중');
      if (r.state === 'disbanded') lines.push('해산 중');
    } else {
      lines.push('비어 있음');
    }
    cards.push(el('div', { class: 'room' }, [el('b', { text: `방 ${n}` }), ...lines.map((t) => (Array.isArray(t) ? el('div', {}, t) : el('div', { text: t })))]));
  }
  $('rooms').replaceChildren(...cards);
}

// ── 닉네임 강제 변경 ──
let usersLoaded = false;
async function loadAllUsers() {
  const all = (await get(ref(db, 'users'))).val() || {};
  for (const [u, p] of Object.entries(all)) names.set(u, Promise.resolve(p.name));
  usersLoaded = true;
  $('users-info').textContent = `전체 ${Object.keys(all).length}명`;
  renderUsers(Object.keys(all));
}

async function renderUsers(uids) {
  const rows = await Promise.all(
    uids.map(async (u) => {
      const input = el('input', { maxLength: 12, placeholder: '새 이름' });
      const save = el('button', {
        type: 'button',
        text: '변경',
        onclick: async () => {
          const name = input.value.trim().slice(0, 12);
          if (!name) return;
          await update(ref(db, `users/${u}`), { name });
          names.set(u, Promise.resolve(name));
          current.textContent = name;
          input.value = '';
          save.textContent = '바꿨어요';
        },
      });
      const current = el('td', { text: await nameOf(u) });
      return el('tr', {}, [current, el('td', {}, [input]), el('td', {}, [save]), (online[u] ? el('td', { class: 'online' }, [icon('dot'), ' 접속 중']) : el('td'))]);
    }),
  );
  $('user-list').replaceChildren(...rows);
}

// ── 게시판 (불러오기 버튼을 누를 때만 읽는다: 이미지가 커서) ──
async function loadPosts() {
  const posts = Object.entries((await get(ref(db, 'board/posts'))).val() || {}).sort((a, b) => b[1].createdAt - a[1].createdAt);
  if (!posts.length) return $('post-list').replaceChildren(el('p', { class: 'empty', text: '게시물이 없어요.' }));
  $('post-list').replaceChildren(
    ...posts.map(([slot, p]) =>
      el('div', { class: 'post' }, [
        el('img', { src: p.image, alt: '' }),
        el('div', { text: `${p.name} · ${p.date}` }),
        el('button', {
          type: 'button',
          class: 'danger',
          text: '삭제',
          onclick: async () => {
            if (!confirm(`${p.name}님의 글(${p.date})을 삭제할까요?`)) return;
            await update(ref(db, 'board'), { [`posts/${slot}`]: null, [`postSecrets/${slot}`]: null, [`deleteTickets/${slot}`]: null });
            loadPosts();
          },
        }),
      ]),
    ),
  );
}

// ── 건의함 ──
function watchFeedback() {
  onValue(ref(db, 'feedback'), (snap) => {
    const items = Object.entries(snap.val() || {}).sort((a, b) => b[1].at - a[1].at);
    $('fb-count').textContent = `${items.length}건`;
    if (!items.length) return $('fb-list').replaceChildren(el('p', { class: 'empty', text: '아직 건의가 없어요.' }));
    $('fb-list').replaceChildren(
      ...items.map(([id, f]) =>
        el('div', { class: 'fb' }, [
          el('div', { class: 'body' }, [el('div', { class: 'meta', text: `${f.name} · ${time(f.at)}` }), f.text]),
          el('div', {}, [
            el('button', {
              type: 'button',
              class: 'danger',
              text: '삭제',
              onclick: () => confirm('이 건의를 삭제할까요?') && remove(ref(db, `feedback/${id}`)),
            }),
          ]),
        ]),
      ),
    );
  });
}

main();
