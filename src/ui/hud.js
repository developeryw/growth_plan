// 화면 위 HTML UI: 안내 문구, [서기] 버튼, 채팅창, 리액션 안내, 알림
import { REACTIONS } from '../data/reactions.js';

const $ = (id) => document.getElementById(id);

let lastHint = '';
export function setHint(text) {
  if (text === lastHint) return; // 매 프레임 DOM을 건드리지 않도록
  lastHint = text;
  $('hint').textContent = text;
}

export function showStandButton(show) {
  $('stand-btn').hidden = !show;
}

export function onStandClick(fn) {
  $('stand-btn').addEventListener('click', () => {
    $('stand-btn').blur(); // 버튼에 포커스가 남아 키 입력을 가로채지 않게
    fn();
  });
}

export function setStatus(text) {
  $('status').textContent = text;
}

// 화면 가운데 큰 알림 (예: 다른 탭에서 접속 중)
export function showNotice(message, buttonText, onClick) {
  $('notice-text').textContent = message;
  const btn = $('notice-btn');
  btn.textContent = buttonText;
  btn.onclick = onClick;
  $('notice').hidden = false;
}

export function renderReactionHelp() {
  $('reactions').innerHTML = REACTIONS.map((r) => `<div><b>${r.key}</b> ${r.emoji} ${r.label}</div>`).join('');
}

// ── 채팅 ──
// onSend(text): 보낼 때, onFocusChange(typing): 입력 중이면 게임 키 입력을 꺼야 한다
export function setupChat({ onSend, onFocusChange }) {
  const input = $('chat-input');
  input.addEventListener('focus', () => onFocusChange(true));
  input.addEventListener('blur', () => onFocusChange(false));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      const text = input.value.trim();
      input.value = '';
      if (text) onSend(text);
      input.blur();
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });
  // 게임 중에 Enter를 누르면 채팅 입력창으로
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement !== input && $('notice').hidden) {
      e.preventDefault();
      input.focus();
    }
  });
}

export function addChatLog(name, text, isMine) {
  const log = $('chat-log');
  const line = document.createElement('div');
  line.className = isMine ? 'mine' : '';
  const who = document.createElement('b');
  who.textContent = name;
  line.append(who, ` ${text}`);
  log.appendChild(line);
  while (log.children.length > 30) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
