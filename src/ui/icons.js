// 도트 아이콘 (이모지 대신). 그림은 public/assets/icons.png, 위치는 icons.css (둘 다 scripts/make-art.js 가 만든다)
// 이름: fighting hand win lose clap think heart again sleep dice crown lock unlock pin mailbox kiosk
//       camera clipboard pointer people door pencil wrench dot

// <i class="ico ico-이름"> 요소. scale 2면 32×32
export function icon(name, scale = 1) {
  const i = document.createElement('i');
  i.className = `ico ico-${name}`;
  i.setAttribute('aria-hidden', 'true');
  if (scale !== 1) i.style.setProperty('--s', scale);
  return i;
}

// HTML 문자열로 (innerHTML에 넣을 때)
export function iconHtml(name, scale = 1) {
  const s = scale !== 1 ? ` style="--s:${scale}"` : '';
  return `<i class="ico ico-${name}"${s} aria-hidden="true"></i>`;
}

// 아이콘 + 글자를 요소 안에 채운다 (글자는 textContent로 안전하게)
export function setIconText(el, name, text) {
  el.replaceChildren(icon(name), ` ${text}`);
}
