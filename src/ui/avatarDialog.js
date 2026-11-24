// 아바타 설정창: 성별·이름·옷 색을 고르고 미리보기로 확인한다
import { COLORS, NAME_MAX, randomName, randomProfile } from '../data/profile.js';

const $ = (id) => document.getElementById(id);
const PREVIEW_SCALE = 6;

// 스프라이트 그림을 한 번만 불러 둔다
const images = {};
function loadImage(key) {
  images[key] ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `assets/sprites/${key}.png`;
  });
  return images[key];
}

// 게임 속 setTint와 같은 방식(곱하기)으로 흰 옷에 색을 입혀 미리보기를 그린다
async function drawPreview(canvas, profile) {
  const [body, outfit] = await Promise.all([loadImage(`body-${profile.gender}`), loadImage('outfit')]);
  const tinted = document.createElement('canvas');
  tinted.width = 16;
  tinted.height = 24;
  const t = tinted.getContext('2d');
  t.drawImage(outfit, 0, 0, 16, 24, 0, 0, 16, 24); // 첫 칸 = 정면 서 있는 자세
  t.globalCompositeOperation = 'multiply';
  t.fillStyle = '#' + profile.color.toString(16).padStart(6, '0');
  t.fillRect(0, 0, 16, 24);
  t.globalCompositeOperation = 'destination-in'; // 옷 모양 밖으로 칠해진 색은 지운다
  t.drawImage(outfit, 0, 0, 16, 24, 0, 0, 16, 24);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // 픽셀이 흐려지지 않게
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(body, 0, 0, 16, 24, 0, 0, 16 * PREVIEW_SCALE, 24 * PREVIEW_SCALE);
  ctx.drawImage(tinted, 0, 0, 16, 24, 0, 0, 16 * PREVIEW_SCALE, 24 * PREVIEW_SCALE);
}

// 설정창을 열고, [저장]을 누르면 고른 프로필을, [취소]를 누르면 null을 돌려준다
// options: { title, submitText, cancellable }
export function openAvatarDialog(initial, { title = '아바타 만들기', submitText = '입장하기', cancellable = false } = {}) {
  const profile = { ...(initial || randomProfile()) };
  const dialog = $('avatar');
  const nameInput = $('avatar-name');
  const canvas = $('avatar-preview');
  const error = $('avatar-error');

  $('avatar-title').textContent = title;
  $('avatar-submit').textContent = submitText;
  $('avatar-cancel').hidden = !cancellable;
  nameInput.maxLength = NAME_MAX;
  nameInput.value = profile.name;
  error.textContent = '';
  nameInput.oninput = () => (error.textContent = '');

  const refresh = () => {
    document.querySelectorAll('#avatar-gender button').forEach((b) => b.classList.toggle('on', b.dataset.gender === profile.gender));
    document.querySelectorAll('#avatar-colors button').forEach((b) => b.classList.toggle('on', Number(b.dataset.color) === profile.color));
    drawPreview(canvas, profile);
  };

  $('avatar-colors').innerHTML = COLORS.map(
    (c) => `<button type="button" data-color="${c}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="색상"></button>`,
  ).join('');

  return new Promise((resolve) => {
    const finish = (result) => {
      dialog.hidden = true;
      dialog.onclick = null;
      dialog.onsubmit = null;
      resolve(result);
    };

    dialog.onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.gender) profile.gender = btn.dataset.gender;
      if (btn.dataset.color) profile.color = Number(btn.dataset.color);
      if (btn.id === 'avatar-random') nameInput.value = randomName();
      if (btn.id === 'avatar-cancel') return finish(null);
      refresh();
    };

    dialog.onsubmit = (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) {
        error.textContent = '이름을 입력해 주세요.';
        nameInput.focus();
        return;
      }
      finish({ ...profile, name: name.slice(0, NAME_MAX) });
    };

    // 설정창에서 누르는 키가 게임으로 넘어가지 않게
    dialog.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' && cancellable) finish(null);
    };

    dialog.hidden = false;
    refresh();
    nameInput.focus();
  });
}
