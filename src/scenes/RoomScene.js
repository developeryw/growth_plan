// 단체 게임방: 테이블·의자 6석·키오스크, 방장/잠금/해산/위임, 투표, 게임 선택, 초대 공유
import Phaser from 'phaser';
import AreaScene from './AreaScene.js';
import RoomNet, { ROOM_MAX } from '../net/RoomNet.js';
import { GROUP_GAMES, GAME_BY_ID, openGameTab } from '../ui/gameMenu.js';
import * as roomUi from '../ui/roomUi.js';
import * as hud from '../ui/hud.js';

const KIOSK_DISTANCE = 48; // 키오스크(테이블 가운데)에서 이 거리 안이면 E로 메뉴판
const EXIT_DEPTH = 6; // 출구 안쪽으로 이만큼(px) 걸어 들어가면 나가기
const AUTO_OPEN_KEY = 'gp-auto-open';

function getAutoOpen() {
  try {
    return localStorage.getItem(AUTO_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
function setAutoOpen(on) {
  try {
    localStorage.setItem(AUTO_OPEN_KEY, on ? '1' : '0');
  } catch {
    /* 저장이 막힌 브라우저면 이번 접속 동안만 */
  }
}

export default class RoomScene extends AreaScene {
  constructor() {
    super('room');
  }

  // data: { room: 방 번호, joinedAt: 입장 시각 }
  init(data) {
    this.roomNo = data.room;
    this.joinedAt = data.joinedAt;
    this.spawnX = data.x;
  }

  create() {
    this.buildMap('room-map');
    this.hasSeatMenu = false;
    this.exiting = false;
    // 방 정보 (RoomNet이 채워 준다)
    this.host = null;
    this.locked = false;
    this.game = null;
    this.invite = null;
    this.votes = {};
    this.loaded = { players: false, game: false, invite: false };
    this.members = new Map([[this.session.uid, this.joinedAt]]); // uid → 입장 시각 (방장 승계 순서)

    const spawn = this.objectByName('spawn');
    this.createMe(this.spawnX ?? spawn.x, spawn.y, 'up');

    // 키오스크: 클릭하거나 근처에서 E
    const k = this.objectByName('kiosk');
    this.kiosk = { x: k.x + k.width / 2, y: k.y + k.height / 2 };
    this.add
      .zone(this.kiosk.x, this.kiosk.y, k.width, k.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openKiosk());

    // 게임이 시작되면 테이블에 놓이는 콜라·팝콘
    this.props = this.objects
      .filter((o) => o.type === 'prop')
      .map((o) => this.add.image(o.x, o.y, 'tile-sprites', o.props.frame).setDepth(5).setVisible(false));

    const ex = this.objectByName('exit');
    this.exitRect = { x: ex.x, y: ex.y, w: ex.width, h: ex.height };

    roomUi.showRoomBar({
      onKiosk: () => this.openKiosk(),
      onLock: () => this.toggleLock(),
      onDisband: () => this.disband(),
      onLeave: () => this.leaveRoom(),
    });
    this.cleanups.push(() => roomUi.hideRoomUi());

    this.startNet(`rooms/${this.roomNo}`, { joinedAt: this.joinedAt });
    this.roomNet = new RoomNet(this.session, this.roomNo, {
      onHost: (v) => this.onHost(v),
      onLocked: (v) => {
        this.locked = Boolean(v);
        this.renderAll();
      },
      onState: (v) => v === 'disbanded' && this.leaveRoom({ disbanded: true }),
      onGame: (v) => this.onGame(v),
      onInvite: (v) => this.onInvite(v),
      onVotes: (v) => {
        this.votes = v || {};
        this.renderKiosk();
      },
    });
    this.roomNet.start();
    this.cleanups.push(() => this.roomNet.stop());
    this.session.setArea(`room${this.roomNo}`);
    this.renderAll();
  }

  get me() {
    return this.session.uid;
  }

  get isHost() {
    return this.host === this.me;
  }

  areaLabel() {
    return `방 ${this.roomNo}`;
  }

  // ── 방장 ──
  onHost(uid) {
    this.host = uid;
    this.renderAll();
    this.checkHost();
  }

  // 방장이 사라졌으면(창을 닫음) 가장 먼저 들어온 사람이 이어받는다
  checkHost() {
    if (!this.loaded.players || this.leaving) return;
    if (this.host && this.members.has(this.host)) return;
    const [first] = [...this.members.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    if (first?.[0] === this.me) this.roomNet.claimHost(this.host);
  }

  onPlayersLoaded() {
    this.loaded.players = true;
    this.checkHost();
  }

  onMemberState(uid, state) {
    if (this.members.has(uid)) return;
    this.members.set(uid, state.joinedAt ?? Date.now());
    this.renderAll();
  }

  onMemberLeave(uid) {
    this.members.delete(uid);
    this.renderAll();
    this.checkHost();
  }

  onRemoteReady() {
    this.renderAll();
  }

  onProfileChanged() {
    this.renderAll();
  }

  toggleLock() {
    if (!this.isHost) return;
    this.roomNet.setLocked(!this.locked);
    hud.toast(this.locked ? '방문을 열었어요.' : '방문을 잠갔어요. 이제 아무도 들어올 수 없어요.');
  }

  disband() {
    if (!this.isHost) return;
    if (!window.confirm('정말 방을 해산할까요? 모두 로비로 이동해요.')) return;
    this.roomNet.disband();
  }

  // 나가기: 방장이면 다음 방장을 고른 뒤 나간다
  async leaveRoom({ disbanded = false } = {}) {
    if (this.leaving || this.exiting) return;
    this.exiting = true;
    this.player.move(0, 0);
    const others = [...this.members.keys()].filter((uid) => uid !== this.me);
    if (!disbanded && this.isHost && others.length) {
      const target = await roomUi.chooseDelegate(others.map((uid) => ({ uid, name: this.nameOf(uid) || '?' })));
      if (!target || !this.sys.isActive()) {
        // 취소 → 출구에서 한 발 물러선다
        const spawn = this.objectByName('spawn');
        this.player.teleport(spawn.x, spawn.y);
        this.exiting = false;
        return;
      }
      await this.roomNet.setHost(target);
    }
    this.leaving = true;
    await this.net.leave();
    await this.roomNet.leave({ last: others.length === 0 });
    this.fadeTo('lobby', { fromRoom: this.roomNo, notice: disbanded ? '방장이 방을 해산했어요.' : null });
  }

  // ── 키오스크 메뉴판 · 투표 · 게임 ──
  nearInteraction() {
    const { x, y } = this.player.feet;
    if (Phaser.Math.Distance.Between(x, y, this.kiosk.x, this.kiosk.y) > KIOSK_DISTANCE) return null;
    return { hint: 'E: 키오스크 (단체 게임 메뉴판)', action: () => this.openKiosk() };
  }

  openKiosk() {
    if (this.leaving) return;
    roomUi.openKiosk({
      games: GROUP_GAMES,
      onVote: (gameId) => this.roomNet.vote(gameId),
      onPlay: (game) => this.play(game),
    });
    this.renderKiosk();
  }

  // 방장이 [플레이] — 클릭한 그 순간 새 탭을 열고, 모두에게 알린다
  play(game) {
    if (!this.isHost) return;
    const url =
      game.join === 'url-template' && game.template
        ? game.template.replace('{roomId}', `gp-${this.roomNo}-${Date.now()}`)
        : game.url;
    if (!openGameTab(url)) hud.toast('팝업이 차단됐어요. 오른쪽 아래 [게임 열기]를 눌러 주세요.');
    this.roomNet.play(game.id, url);
    roomUi.closeKiosk();
  }

  onGame(game) {
    const first = !this.loaded.game;
    this.loaded.game = true;
    const prev = this.game;
    this.game = game;
    this.props.forEach((p) => p.setVisible(Boolean(game)));
    this.renderAll();
    // 방장이 새로 고른 게임 → 팀원에게 알림 (처음 들어왔을 때 이미 진행 중인 게임은 패널에만 표시)
    if (first || !game || this.isHost || prev?.at === game.at) return;
    const def = GAME_BY_ID[game.id];
    if (!def) return;
    // '자동 열기'를 켰으면 바로 열어 보고, 브라우저가 막으면 알림창으로 대신한다
    if (getAutoOpen() && openGameTab(game.url)) return;
    roomUi.showGameModal(def.name, game.url);
  }

  onInvite(invite) {
    const first = !this.loaded.invite;
    this.loaded.invite = true;
    this.invite = invite;
    this.renderAll();
    if (!first && invite && !this.isHost) hud.toast(invite.type === 'code' ? '방장이 참가 코드를 올렸어요!' : '방장이 초대 링크를 올렸어요!');
  }

  // ── 화면 갱신 ──
  renderAll() {
    if (!this.player) return;
    this.player.setHost(this.isHost);
    for (const r of this.remotes.values()) r.player.setHost(r.uid === this.host);
    roomUi.renderRoomBar({
      n: this.roomNo,
      hostName: this.nameOf(this.host),
      count: this.members.size,
      max: ROOM_MAX,
      locked: this.locked,
      isHost: this.isHost,
    });
    roomUi.renderGamePanel(
      {
        game: this.game ? GAME_BY_ID[this.game.id] : null,
        url: this.game?.url,
        invite: this.invite,
        isHost: this.isHost,
        autoOpen: getAutoOpen(),
      },
      {
        onShareInvite: (inv) => {
          this.roomNet.setInvite(inv);
          hud.toast('팀원들에게 공유했어요.');
        },
        onEndGame: () => this.roomNet.endGame(),
        onAutoOpen: (on) => setAutoOpen(on),
      },
    );
    this.renderKiosk();
  }

  renderKiosk() {
    const names = {};
    for (const uid of this.members.keys()) names[uid] = this.nameOf(uid);
    roomUi.renderKiosk({ votes: this.votes, myUid: this.me, isHost: this.isHost, names, currentGameId: this.game?.id });
  }

  // ── 매 프레임: 출구로 걸어 들어가면 나가기 ──
  areaUpdate() {
    if (this.exiting || this.player.isSitting) return;
    const { x, y } = this.player.feet;
    const r = this.exitRect;
    const { vy } = this.inputDir();
    if (vy > 0 && x >= r.x && x <= r.x + r.w && y >= r.y - EXIT_DEPTH) this.leaveRoom();
  }
}
