// 게시판 창: 압정으로 꽂은 종이들, 글 올리기 폼, 압정 눌러 삭제
import { watchPosts, createPost, deletePost, BOARD_MAX } from '../net/board.js';
import { compressImage } from './imageCompress.js';

const $ = (id) => document.getElementById(id);

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 칸 번호마다 종이가 조금씩 다르게 기울어지게
const tilt = (slot) => [-2.5, 1.5, -1, 2, -1.5, 1, -2, 2.5, -0.5, 1.8][Number(slot) % 10];

let ctx = null; // { db, uid, name, posts, unsub, image }

// 게시판을 열고, 닫히면 끝나는 Promise를 돌려준다
export function openBoard({ db, uid, name }) {
  const modal = $('board');
  ctx = { db, uid, name, posts: [], image: null };
  showForm(false);
  $('board-list').innerHTML = '<p class="board-empty">불러오는 중…</p>';
  // 게시판은 열어 둔 동안만 구독한다
  ctx.unsub = watchPosts(db, (posts) => {
    ctx.posts = posts;
    renderPosts();
  });
  modal.hidden = false;
  modal.focus();

  return new Promise((resolve) => {
    const close = () => {
      ctx?.unsub?.();
      ctx = null;
      modal.hidden = true;
      $('board-view').hidden = true;
      modal.removeEventListener('close', close);
      resolve();
    };
    modal.addEventListener('close', close);
  });
}

function closeBoard() {
  $('board').dispatchEvent(new CustomEvent('close'));
}

// ── 글 목록 ──
function renderPosts() {
  const list = $('board-list');
  list.innerHTML = '';
  $('board-count').textContent = `${ctx.posts.length}/${BOARD_MAX}`;
  if (!ctx.posts.length) {
    list.innerHTML = '<p class="board-empty">아직 글이 없어요. 함께 한 게임을 첫 번째로 남겨 보세요!</p>';
    return;
  }
  for (const post of ctx.posts) {
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.style.rotate = `${tilt(post.slot)}deg`;

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.title = '압정을 누르면 삭제';
    pin.setAttribute('aria-label', '삭제');
    pin.onclick = () => askDelete(post);

    const img = document.createElement('img');
    img.src = post.image;
    img.alt = `${post.name}의 캡처`;
    img.onclick = () => {
      $('board-view-img').src = post.image;
      $('board-view').hidden = false;
    };

    const meta = document.createElement('div');
    meta.className = 'paper-meta';
    const who = document.createElement('b');
    who.textContent = post.name;
    const when = document.createElement('span');
    when.textContent = post.date;
    meta.append(who, when);

    paper.append(pin, img, meta);
    list.append(paper);
  }
}

// ── 삭제: 비밀번호 → "정말로 삭제하시겠습니까?" → 삭제 (비교는 보안 규칙이) ──
async function askDelete(post) {
  const password = window.prompt(`${post.name}님의 글 (${post.date})\n삭제하려면 비밀번호 4자리를 입력하세요.`);
  if (password === null) return;
  if (!/^\d{4}$/.test(password)) return window.alert('비밀번호는 숫자 4자리예요.');
  if (!window.confirm('정말로 삭제하시겠습니까?')) return;
  try {
    const ok = await deletePost(ctx.db, ctx.uid, post.slot, password);
    window.alert(ok ? '삭제했어요.' : '비밀번호가 맞지 않아요.');
  } catch (err) {
    console.error(err);
    window.alert('삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}

// ── 글 올리기 폼 ──
function showForm(show) {
  $('board-form').hidden = !show;
  $('board-list').hidden = show;
  $('board-new').hidden = show;
  if (!show) return;
  ctx.image = null;
  $('board-preview').hidden = true;
  $('board-preview').src = '';
  $('board-drop-text').hidden = false;
  $('board-name').textContent = ctx.name;
  $('board-date').value = today();
  $('board-date').max = today();
  $('board-pw').value = '';
  $('board-file').value = '';
  setFormMsg(ctx.posts.length >= BOARD_MAX ? '게시판이 꽉 찼어요. 올리면 가장 오래된 글이 내려가요.' : '');
}

function setFormMsg(text, isError = false) {
  const m = $('board-msg');
  m.textContent = text;
  m.classList.toggle('error', isError);
}

async function useImage(file) {
  if (!file || !file.type.startsWith('image/')) return setFormMsg('이미지 파일만 올릴 수 있어요.', true);
  setFormMsg('이미지를 줄이는 중…');
  try {
    ctx.image = await compressImage(file);
    $('board-preview').src = ctx.image;
    $('board-preview').hidden = false;
    $('board-drop-text').hidden = true;
    setFormMsg(`이미지 준비 완료 (${Math.round((ctx.image.length * 3) / 4 / 1024)}KB)`);
  } catch (err) {
    ctx.image = null;
    setFormMsg(err.message, true);
  }
}

async function submit(e) {
  e.preventDefault();
  if (!ctx) return;
  const date = $('board-date').value;
  const password = $('board-pw').value;
  if (!ctx.image) return setFormMsg('캡처 이미지를 넣어 주세요.', true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setFormMsg('플레이 날짜를 골라 주세요.', true);
  if (!/^\d{4}$/.test(password)) return setFormMsg('비밀번호는 숫자 4자리예요.', true);
  $('board-submit').disabled = true;
  setFormMsg('올리는 중…');
  try {
    await createPost(ctx.db, ctx.posts, { image: ctx.image, name: ctx.name, date, password });
    showForm(false);
  } catch (err) {
    console.error(err);
    setFormMsg('올리지 못했어요. 다른 사람이 동시에 올렸을 수 있어요. 다시 시도해 주세요.', true);
  } finally {
    $('board-submit').disabled = false;
  }
}

// ── 이벤트 연결 (한 번만) ──
$('board-close').onclick = closeBoard;
$('board-new').onclick = () => showForm(true);
$('board-cancel').onclick = () => showForm(false);
$('board-form').onsubmit = submit;
$('board-file').onchange = (e) => useImage(e.target.files[0]);
$('board-drop').onclick = () => $('board-file').click();
$('board-drop').ondragover = (e) => e.preventDefault();
$('board-drop').ondrop = (e) => {
  e.preventDefault();
  useImage(e.dataTransfer.files[0]);
};
$('board-pw').oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4));
$('board-view').onclick = () => ($('board-view').hidden = true);
$('board').addEventListener('keydown', (e) => {
  e.stopPropagation(); // 게시판에서 누른 키가 게임으로 넘어가지 않게
  if (e.key !== 'Escape') return;
  if (!$('board-view').hidden) $('board-view').hidden = true;
  else if (!$('board-form').hidden) showForm(false);
  else closeBoard();
});
$('board').addEventListener('click', (e) => e.target === $('board') && closeBoard());
// 글쓰기 폼이 열려 있을 때 Ctrl+V로 캡처를 붙여넣기
document.addEventListener('paste', (e) => {
  if (!ctx || $('board-form').hidden) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  useImage(item.getAsFile());
});
