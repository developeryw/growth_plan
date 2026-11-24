// 화면 위 HTML UI: 안내 문구, 앉기 버튼, 채팅창, 리액션 안내, 알림
// 버튼·채팅 처리는 지금 보고 있는 장면(로비/방)이 bind()로 연결한다.
import { REACTIONS } from '../data/reactions.js';

const $ = (id) => document.getElementById(id);
const MODALS = ['notice', 'avatar', 'games', 'kiosk', 'game-modal', 'delegate'];

let handlers = {}; // { onStand, onMenu, onAvatar, onSend, onTyping }
export function bind(h) {
  handlers = h;
}

const click = (id, name) => {
  $(id).addEventListener('click', () => {
    $(id).blur(); // 버튼에 포커스가 남아 키 입력을 가로채지 않게
    handlers[name]?.();
  });
};

// 처음 한 번만 부른다
export function init() {
  click('stand-btn', 'onStand');
  click('menu-btn', 'onMenu');
  click('avatar-btn', 'onAvatar');
  renderReactionHelp();

  const input = $('chat-input');
  input.addEventListener('focus', () => handlers.onTyping?.(true));
  input.addEventListener('blur', () => handlers.onTyping?.(false));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) {
      const text = input.value.trim();
      input.value = '';
      if (text) handlers.onSend?.(text);
      input.blur();
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });
  // 게임 중에 Enter를 누르면 채팅 입력창으로
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement !== input && !anyModalOpen() && handlers.onSend) {
      e.preventDefault();
      input.focus();
    }
  });
}

export function anyModalOpen() {
  return MODALS.some((id) => !$(id).hidden);
}

let lastHint = '';
export function setHint(text) {
  if (text === lastHint) return; // 매 프레임 DOM을 건드리지 않도록
  lastHint = text;
  $('hint').textContent = text;
}

// 앉아 있을 때만 [서기] (로비에서는 [게임 고르기]도) 버튼을 보여 준다
export function showSeatButtons(show, withMenu = false) {
  $('stand-btn').hidden = !show;
  $('menu-btn').hidden = !(show && withMenu);
}

export function setStatus(text) {
  $('status').textContent = text;
}

export function showAvatarButton(show) {
  $('avatar-btn').hidden = !show;
}

// 화면 가운데 큰 알림 (예: 다른 탭에서 접속 중)
export function showNotice(message, buttonText, onClick) {
  $('notice-text').textContent = message;
  const btn = $('notice-btn');
  btn.textContent = buttonText;
  btn.onclick = onClick;
  $('notice').hidden = false;
}

// 잠깐 떴다 사라지는 안내
let toastTimer;
export function toast(text, ms = 3000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

function renderReactionHelp() {
  $('reactions').innerHTML = REACTIONS.map((r) => `<div><b>${r.key}</b> ${r.emoji} ${r.label}</div>`).join('');
}

export function clearChatLog() {
  $('chat-log').innerHTML = '';
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
