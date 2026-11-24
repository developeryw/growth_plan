// 게임 목록과 로비 좌석의 1인 게임 선택창
import games from '../data/games.json';

const $ = (id) => document.getElementById(id);

// 1인으로 할 수 있는 게임 (mode가 solo 또는 both)
export const SOLO_GAMES = games.filter((g) => g.mode === 'solo' || g.mode === 'both');
// 단체 게임방 메뉴판에 나오는 게임 (mode가 group 또는 both)
export const GROUP_GAMES = games.filter((g) => g.mode === 'group' || g.mode === 'both');
export const GAME_BY_ID = Object.fromEntries(games.map((g) => [g.id, g]));

// http(s) 주소만 연다 (javascript: 같은 위험한 주소 차단)
export function safeUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

// 게임을 새 탭으로 열고 그 탭을 돌려준다 (탭이 닫혔는지 확인하는 데 쓴다).
// 열린 사이트가 우리 페이지를 조작하지 못하도록 opener 연결은 끊어 둔다.
// 반드시 클릭한 그 순간에 불러야 브라우저 팝업 차단에 걸리지 않는다. 차단되면 null.
export function openGameTab(url) {
  const safe = safeUrl(url);
  if (!safe) return null;
  const win = window.open('about:blank', '_blank');
  if (!win) return null;
  win.opener = null;
  win.location.href = safe;
  return win;
}

// 선택창을 열고, { game, win }(또는 닫으면 null)을 돌려준다.
export function openSoloMenu(currentId) {
  const menu = $('games');
  const list = $('games-list');
  list.innerHTML = '';
  for (const g of SOLO_GAMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game' + (g.id === currentId ? ' on' : '');
    btn.dataset.id = g.id;
    const name = document.createElement('b');
    name.textContent = g.name;
    const host = document.createElement('small');
    host.textContent = new URL(g.url).hostname.replace(/^www\./, '');
    btn.append(name, host);
    list.appendChild(btn);
  }

  return new Promise((resolve) => {
    const finish = (result) => {
      menu.hidden = true;
      menu.onclick = null;
      menu.onkeydown = null;
      resolve(result);
    };
    menu.onclick = (e) => {
      const btn = e.target.closest('button');
      if (btn?.dataset.id) {
        const game = GAME_BY_ID[btn.dataset.id];
        finish({ game, win: openGameTab(game.url) });
      } else if (btn?.id === 'games-close' || e.target === menu) {
        finish(null);
      }
    };
    menu.onkeydown = (e) => {
      e.stopPropagation(); // 선택창에서 누른 키가 게임으로 넘어가지 않게
      if (e.key === 'Escape') finish(null);
    };
    menu.hidden = false;
    menu.focus();
  });
}
