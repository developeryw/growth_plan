// 로비 좌석의 1인 게임 선택창
import games from '../data/games.json';

const $ = (id) => document.getElementById(id);

// 1인으로 할 수 있는 게임 (mode가 solo 또는 both)
export const SOLO_GAMES = games.filter((g) => g.mode === 'solo' || g.mode === 'both');
export const GAME_BY_ID = Object.fromEntries(games.map((g) => [g.id, g]));

// 게임을 새 탭으로 열고 그 탭을 돌려준다 (탭이 닫혔는지 확인하는 데 쓴다).
// 열린 사이트가 우리 페이지를 조작하지 못하도록 opener 연결은 끊어 둔다.
function openGameTab(url) {
  const win = window.open('about:blank', '_blank');
  if (!win) return null; // 팝업이 차단됨
  win.opener = null;
  win.location.href = url;
  return win;
}

// 선택창을 열고, { game, win }(또는 닫으면 null)을 돌려준다.
// 새 탭은 클릭하는 그 순간에 열어야 브라우저 팝업 차단에 걸리지 않는다.
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
    const finish = (game) => {
      menu.hidden = true;
      menu.onclick = null;
      menu.onkeydown = null;
      resolve(game);
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

export function isMenuOpen() {
  return !$('games').hidden;
}
