// 단체 게임방 화면 UI: 위쪽 방 정보 줄, 키오스크 메뉴판(투표), 게임·초대 공유 칸, 팀원 알림창, 방장 위임 창
import { openGameTab, safeUrl } from './gameMenu.js';

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'on') Object.entries(v).forEach(([ev, fn]) => e.addEventListener(ev, fn));
    else if (k === 'class') e.className = v;
    else e[k] = v;
  }
  e.append(...children);
  return e;
}

// 모달 안에서 누른 키가 게임으로 넘어가지 않게
for (const id of ['kiosk', 'game-modal', 'delegate']) {
  const m = $(id);
  m.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') m.dispatchEvent(new CustomEvent('close'));
  });
}

// ── 위쪽 방 정보 줄 ──
let barHandlers = {};
$('kiosk-btn').onclick = () => barHandlers.onKiosk?.();
$('lock-btn').onclick = () => barHandlers.onLock?.();
$('disband-btn').onclick = () => barHandlers.onDisband?.();
$('leave-btn').onclick = () => barHandlers.onLeave?.();

export function showRoomBar(handlers) {
  barHandlers = handlers;
  $('room-bar').hidden = false;
}

export function hideRoomUi() {
  $('room-bar').hidden = true;
  $('game-panel').hidden = true;
  for (const id of ['kiosk', 'game-modal', 'delegate']) {
    $(id).hidden = true;
    $(id).dispatchEvent(new CustomEvent('close'));
  }
}

export function renderRoomBar({ n, hostName, count, max, locked, isHost }) {
  $('room-info').textContent = `방 ${n} · 👑 ${hostName || '…'} · ${count}/${max}명${locked ? ' · 🔒 잠김' : ''}`;
  $('lock-btn').hidden = !isHost;
  $('lock-btn').textContent = locked ? '🔓 방문 열기' : '🔒 방문 잠그기';
  $('disband-btn').hidden = !isHost;
}

// ── 키오스크 메뉴판 (투표) ──
let kiosk = null; // { games, onVote, onPlay, state }
export function openKiosk({ games, onVote, onPlay }) {
  kiosk = { games, onVote, onPlay, state: kiosk?.state };
  const m = $('kiosk');
  const close = () => {
    m.hidden = true;
    m.removeEventListener('close', close);
  };
  m.addEventListener('close', close);
  $('kiosk-close').onclick = close;
  m.onclick = (e) => {
    if (e.target === m) close();
  };
  m.hidden = false;
  m.focus();
  if (kiosk.state) renderKiosk(kiosk.state);
}

export function closeKiosk() {
  $('kiosk').dispatchEvent(new CustomEvent('close'));
}

// state: { votes: {uid: gameId}, myUid, isHost, names: {uid: name}, currentGameId }
export function renderKiosk(state) {
  if (!kiosk) kiosk = { state };
  kiosk.state = state;
  if ($('kiosk').hidden || !kiosk.games) return;
  const { votes = {}, myUid, isHost, names = {}, currentGameId } = state;
  const list = $('kiosk-list');
  list.innerHTML = '';
  $('kiosk-desc').textContent = isHost
    ? '모두의 투표를 보고 [플레이]로 최종 선택하세요.'
    : '하고 싶은 게임에 투표하세요. 최종 선택은 방장이 해요.';
  if (!kiosk.games.length) {
    list.append(el('p', { class: 'empty', text: '단체 게임이 아직 없어요. games.json에 mode "group" 또는 "both"로 추가해 주세요.' }));
    return;
  }
  for (const g of kiosk.games) {
    const voters = Object.entries(votes).filter(([, id]) => id === g.id).map(([uid]) => names[uid] || '?');
    const mine = votes[myUid] === g.id;
    const row = el('div', { class: 'kiosk-game' + (mine ? ' voted' : '') + (currentGameId === g.id ? ' playing' : '') }, [
      el('div', { class: 'kiosk-name' }, [
        el('b', { text: g.name }),
        el('small', { text: `${g.players || ''}명 · ${voters.length}표` }),
        el('div', { class: 'voters', text: voters.join(', ') }),
      ]),
      el('button', {
        type: 'button',
        class: 'vote-btn',
        text: mine ? '투표 취소' : '투표',
        on: { click: () => kiosk.onVote(mine ? null : g.id) },
      }),
    ]);
    if (isHost) {
      // 방장 클릭 그 순간에 새 탭을 열어야 팝업 차단에 안 걸린다
      row.append(el('button', { type: 'button', class: 'play-btn', text: '▶ 플레이', on: { click: () => kiosk.onPlay(g) } }));
    }
    list.append(row);
  }
}

// ── 게임·초대 공유 칸 (오른쪽 아래) ──
// view: { game(games.json 항목), url, invite, isHost, autoOpen }
// h: { onShareInvite(invite), onEndGame(), onAutoOpen(bool) }
export function renderGamePanel(view, h) {
  const panel = $('game-panel');
  if (!view.game) {
    panel.hidden = true;
    return;
  }
  const { game, url, invite, isHost, autoOpen } = view;
  const body = [];
  body.push(el('div', { class: 'gp-title', text: `🎲 지금 게임: ${game.name}` }));
  const openBtn = (label, target) =>
    el('button', {
      type: 'button',
      class: 'gp-open',
      text: label,
      on: { click: () => openGameTab(target) || alert('팝업이 차단됐어요. 브라우저 주소창 옆의 팝업 허용을 눌러 주세요.') },
    });

  if (game.join === 'url-template') {
    body.push(el('p', { text: '모두 같은 게임방 주소로 들어가요.' }), openBtn('게임 열기', url));
  } else {
    body.push(openBtn('게임 사이트 열기', url));
    const isCode = game.join === 'code';
    if (isHost) {
      if (game.join === 'qr') {
        body.push(el('p', { text: '게임의 QR을 캡처(⌘+Shift+4 / Win+Shift+S)한 뒤, 여기를 누르고 붙여넣기(Ctrl/⌘+V) 하세요.' }));
        body.push(el('div', { class: 'gp-paste', tabIndex: 0, text: '📋 여기에 QR 붙여넣기', on: { paste: (e) => pasteQr(e, h) } }));
      } else {
        const input = el('input', { placeholder: isCode ? '참가 코드 입력' : '초대 링크 붙여넣기', value: invite?.value || '', maxLength: 300 });
        input.addEventListener('keydown', (e) => e.stopPropagation());
        const share = () => {
          const value = input.value.trim();
          if (!value) return;
          if (!isCode && !safeUrl(value)) return alert('http:// 또는 https:// 로 시작하는 링크를 넣어 주세요.');
          h.onShareInvite({ type: isCode ? 'code' : 'link', value });
        };
        body.push(el('div', { class: 'gp-row' }, [input, el('button', { type: 'button', text: '공유', on: { click: share } })]));
      }
    }
    if (invite?.type === 'link' && safeUrl(invite.value)) {
      body.push(openBtn('👉 참가하기', invite.value));
    } else if (invite?.type === 'code') {
      body.push(
        el('div', { class: 'gp-code', text: invite.value }),
        el('button', {
          type: 'button',
          text: '코드 복사',
          on: { click: () => navigator.clipboard?.writeText(invite.value).then(() => alert('복사했어요!')) },
        }),
      );
      if (game.joinUrl) body.push(openBtn('참가 페이지 열기', game.joinUrl));
    } else if (!isHost) {
      body.push(el('p', { class: 'muted', text: game.join === 'code' ? '방장이 참가 코드를 준비 중이에요.' : '방장이 초대 링크를 준비 중이에요.' }));
    }
  }

  if (isHost) {
    body.push(el('button', { type: 'button', class: 'gp-end', text: '게임 끝 (테이블 치우기)', on: { click: () => h.onEndGame() } }));
  } else {
    const box = el('input', { type: 'checkbox', checked: autoOpen, on: { change: (e) => h.onAutoOpen(e.target.checked) } });
    body.push(el('label', { class: 'gp-auto' }, [box, ' 방장이 고르면 자동으로 열기']));
  }
  panel.replaceChildren(...body);
  panel.hidden = false;
}

async function pasteQr(e, h) {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return alert('이미지가 없어요. QR을 캡처한 뒤 붙여넣어 주세요.');
  e.preventDefault();
  const bitmap = await createImageBitmap(item.getAsFile());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import('jsqr'); // 필요할 때만 불러온다
  const code = jsQR(data, width, height);
  const url = code && safeUrl(code.data);
  if (!url) return alert('QR에서 링크를 찾지 못했어요. QR이 잘 보이게 다시 캡처해 주세요.');
  h.onShareInvite({ type: 'link', value: url });
}

// ── 팀원 알림창: "방장이 ○○를 선택했어요 [게임 열기]" ──
export function showGameModal(gameName, url) {
  const m = $('game-modal');
  $('game-modal-text').textContent = `방장이 ${gameName}을(를) 선택했어요`;
  const close = () => {
    m.hidden = true;
    m.removeEventListener('close', close);
  };
  m.addEventListener('close', close);
  $('game-modal-open').onclick = () => {
    openGameTab(url);
    close();
  };
  $('game-modal-close').onclick = close;
  m.hidden = false;
  m.focus();
}

// ── 방장 위임: 나갈 때 다음 방장을 고른다. 고른 uid 또는 취소하면 null ──
export function chooseDelegate(members) {
  const m = $('delegate');
  const list = $('delegate-list');
  list.innerHTML = '';
  return new Promise((resolve) => {
    const finish = (uid) => {
      m.hidden = true;
      m.removeEventListener('close', cancel);
      resolve(uid);
    };
    const cancel = () => finish(null);
    m.addEventListener('close', cancel);
    for (const { uid, name } of members) {
      list.append(el('button', { type: 'button', text: `👑 ${name}`, on: { click: () => finish(uid) } }));
    }
    $('delegate-cancel').onclick = cancel;
    m.hidden = false;
    m.focus();
  });
}
