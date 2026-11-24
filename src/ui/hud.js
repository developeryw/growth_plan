// 화면 아래 안내 문구와 [서기] 버튼 (HTML로 그려서 글자가 선명하다)
const hint = document.getElementById('hint');
const standBtn = document.getElementById('stand-btn');

let lastHint = '';
export function setHint(text) {
  if (text === lastHint) return; // 매 프레임 DOM을 건드리지 않도록
  lastHint = text;
  hint.textContent = text;
}

export function showStandButton(show) {
  standBtn.hidden = !show;
}

export function onStandClick(fn) {
  standBtn.addEventListener('click', () => {
    standBtn.blur(); // 버튼에 포커스가 남아 키 입력을 가로채지 않게
    fn();
  });
}
