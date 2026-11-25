// 로비: 1인 게임 좌석, 단체 게임방 문 4개
import { ref, onValue } from 'firebase/database';
import AreaScene from './AreaScene.js';
import { tryEnter, ROOM_MAX } from '../net/RoomNet.js';
import { openSoloMenu, GAME_BY_ID } from '../ui/gameMenu.js';
import { openBoard } from '../ui/boardUi.js';
import { openFeedback } from '../ui/feedbackUi.js';
import * as hud from '../ui/hud.js';
import { icon, setIconText } from '../ui/icons.js';

const DOOR_DEPTH = 6; // 문 안쪽으로 이만큼(px) 걸어 들어가면 입장
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ENTER_FAIL = {
  full: '방이 꽉 찼어요 (최대 6명).',
  locked: '방장이 방문을 잠갔어요.',
  disbanded: '방이 해산하는 중이에요. 잠시 후 다시 시도해 주세요.',
  error: '방에 들어가지 못했어요. 다시 시도해 주세요.',
};

export default class LobbyScene extends AreaScene {
  constructor() {
    super('lobby');
  }

  // data.fromRoom: 방에서 나왔다면 그 방 번호 (그 문 앞에서 시작), data.notice: 띄울 안내
  init(data) {
    this.fromRoom = data?.fromRoom ?? null;
    this.notice = data?.notice ?? null;
  }

  create() {
    this.buildMap('lobby-map');
    this.hasSeatMenu = true;
    this.entering = false;
    this.playing = null;
    this.boardOpen = false;

    // 단체 게임방 문
    this.doors = this.objects
      .filter((o) => o.type === 'door')
      .map((o) => {
        const [dx, dy] = DIR_VEC[o.props.facing];
        return {
          room: o.props.room,
          facing: o.props.facing,
          rect: { x: o.x, y: o.y, w: o.width, h: o.height },
          // 문 앞 한 칸 (방에서 나오면 여기 선다)
          spawn: { x: o.x + o.width / 2 + dx * 16, y: o.y + o.height / 2 + dy * 16 + 3 },
          label: this.makeDoorLabel(o.props.room),
        };
      });

    // 게시판: 클릭하거나 근처에서 E
    const b = this.objectByName('board');
    this.board = { x: b.x, y: b.y, w: b.width, h: b.height, label: this.makeLabel('board-label', '게시판', 'pin') };
    this.add
      .zone(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openBoard());

    // 건의함 우체통: 클릭하거나 근처에서 E
    const m = this.objectByName('mailbox');
    this.mailbox = { x: m.x, y: m.y, w: m.width, h: m.height, label: this.makeLabel('board-label', '건의함', 'mailbox') };
    this.add
      .zone(m.x + m.width / 2, m.y + m.height / 2, m.width, m.height)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openFeedback());

    // 시작 위치: 처음이면 입구, 방에서 나왔으면 그 방 문 앞
    const door = this.doors.find((d) => d.room === this.fromRoom);
    const spawn = door ? door.spawn : this.objectByName('spawn');
    this.createMe(spawn.x, spawn.y, door ? door.facing : 'up');
    this.startNet('lobby');
    this.session?.setArea('lobby');
    this.watchRooms();
    if (this.notice) hud.toast(this.notice);
  }

  areaLabel() {
    return '로비';
  }

  // ── 문 위 "방 1 · 3/6 (자물쇠)" 표시 ──
  makeDoorLabel() {
    return this.makeLabel('door-label', '');
  }

  // 맵 위에 띄우는 HTML 이름표
  makeLabel(className, text, iconName) {
    const el = document.createElement('div');
    el.className = className;
    if (iconName) setIconText(el, iconName, text);
    else el.textContent = text;
    document.getElementById('tags').appendChild(el);
    this.cleanups.push(() => el.remove());
    return el;
  }

  // ── 게시판 ──
  nearInteraction() {
    const { x, y } = this.player.feet;
    const b = this.board;
    if (x >= b.x - 8 && x <= b.x + b.w + 8 && y <= b.y + b.h + 28) {
      return { hint: 'E: 게시판 보기', action: () => this.openBoard() };
    }
    const m = this.mailbox;
    if (Math.hypot(x - (m.x + m.w / 2), y - (m.y + m.h / 2)) < 26) {
      return { hint: 'E: 건의함에 건의하기', action: () => this.openFeedback() };
    }
    return null;
  }

  async openFeedback() {
    if (this.boardOpen || this.leaving) return;
    if (!this.session) return hud.toast('혼자 모드에서는 건의함을 쓸 수 없어요.');
    this.boardOpen = true;
    this.setTyping(true);
    const sent = await openFeedback({ db: this.session.db, uid: this.session.uid, name: this.profile.name });
    this.boardOpen = false;
    if (!this.sys.isActive()) return;
    this.setTyping(false);
    if (sent) hud.toast('건의가 전달됐어요. 고마워요!');
  }

  async openBoard() {
    if (this.boardOpen || this.leaving) return;
    if (!this.session) return hud.toast('혼자 모드에서는 게시판을 쓸 수 없어요.');
    this.boardOpen = true;
    this.setTyping(true);
    await openBoard({ db: this.session.db, uid: this.session.uid, name: this.profile.name });
    this.boardOpen = false;
    if (this.sys.isActive()) this.setTyping(false);
  }

  // 로비에서는 rooms/* 대신 작은 거울 데이터만 구독한다 (무료 한도 절약)
  watchRooms() {
    this.roomCounts = {};
    this.roomLocks = {};
    this.renderDoorLabels();
    if (!this.session) return;
    const { db } = this.session;
    this.cleanups.push(
      onValue(ref(db, 'lobby/roomMembers'), (s) => {
        const v = s.val() || {};
        this.roomCounts = Object.fromEntries(Object.entries(v).map(([n, m]) => [n, Object.keys(m || {}).length]));
        this.renderDoorLabels();
      }),
      onValue(ref(db, 'lobby/roomLocks'), (s) => {
        this.roomLocks = s.val() || {};
        this.renderDoorLabels();
      }),
    );
  }

  renderDoorLabels() {
    for (const d of this.doors) {
      const count = this.roomCounts[d.room] || 0;
      const locked = count > 0 && this.roomLocks[d.room];
      d.label.replaceChildren(icon('door'), ` 방 ${d.room} · ${count}/${ROOM_MAX}`, ...(locked ? [' ', icon('lock')] : []));
      d.label.classList.toggle('full', count >= ROOM_MAX || Boolean(locked));
    }
  }

  // ── 매 프레임: 문 이름표 위치, 문으로 들어가는지 확인 ──
  areaUpdate() {
    for (const thing of [this.board, this.mailbox]) {
      const tp = this.toScreen(thing.x + thing.w / 2, thing.y);
      thing.label.style.transform = `translate(${Math.round(tp.x)}px, ${Math.round(tp.y)}px)`;
    }
    for (const d of this.doors) {
      const p = this.toScreen(d.rect.x + d.rect.w / 2, d.rect.y);
      d.label.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    }
    if (this.entering || this.player.isSitting) return;
    const { x, y } = this.player.feet;
    const { vx, vy } = this.inputDir();
    for (const d of this.doors) {
      const [fx, fy] = DIR_VEC[d.facing]; // 문에서 방 안쪽을 보는 방향 → 들어갈 때는 반대로 걷는다
      const r = d.rect;
      const inside =
        x >= r.x - (fx < 0 ? DOOR_DEPTH : 0) &&
        x <= r.x + r.w + (fx > 0 ? DOOR_DEPTH : 0) &&
        y >= r.y &&
        y <= r.y + r.h;
      const walkingIn = vx === -fx && fx !== 0;
      if (inside && walkingIn) {
        this.enterRoom(d);
        return;
      }
    }
  }

  async enterRoom(door) {
    if (!this.session) {
      hud.toast('혼자 모드에서는 게임방에 들어갈 수 없어요.');
      this.player.teleport(door.spawn.x, door.spawn.y);
      return;
    }
    this.entering = true;
    this.player.move(0, 0);
    // 방 맵의 시작 위치를 미리 알아 두고, 그 자리로 자리를 잡는다
    const roomObjects = this.cache.tilemap.get('room-map').data.layers.find((l) => l.name === 'objects').objects;
    const start = roomObjects.find((o) => o.name === 'spawn');
    const joinedAt = Date.now();
    // 여러 명이 같은 자리에 겹치지 않도록 좌우로 조금씩 흩어서 선다
    const x = start.x + Math.round((Math.random() - 0.5) * 40);
    const state = { x, y: start.y, dir: 'up', vx: 0, vy: 0, moving: false, seat: null, reaction: null, reactionAt: 0, playing: null, joinedAt };
    const result = await tryEnter(this.session, door.room, state);
    if (!this.sys.isActive()) return;
    if (!result.ok) {
      hud.toast(ENTER_FAIL[result.reason] || ENTER_FAIL.error);
      this.player.teleport(door.spawn.x, door.spawn.y);
      this.entering = false;
      return;
    }
    this.leaving = true;
    await this.net.leave();
    this.fadeTo('room', { room: door.room, joinedAt, x });
  }

  // ── 1인 게임 좌석 ──
  onSat() {
    this.chooseGame(); // 앉으면 바로 1인 게임 선택창
  }

  onSeatMenu() {
    this.chooseGame();
  }

  onStood() {
    clearInterval(this.gameTabTimer);
    this.setPlaying(null);
  }

  // 1인 게임 선택창 → 고르면 새 탭이 열리고 머리 위에 "하는 중" 표시
  async chooseGame() {
    if (!this.player.isSitting) return;
    this.setTyping(true);
    const picked = await openSoloMenu(this.playing);
    this.setTyping(false);
    if (!picked || !this.player.isSitting || !this.sys.isActive()) return;
    this.setPlaying(picked.game.id);
    this.watchGameTab(picked.win);
  }

  // 게임 탭을 닫으면 "하는 중" 표시를 지운다 (1초마다 확인)
  // 로비 탭이 뒤에 있어도 돌도록 Phaser 타이머 대신 브라우저 setInterval을 쓴다
  watchGameTab(win) {
    clearInterval(this.gameTabTimer);
    if (!win) return;
    const openedAt = Date.now();
    this.gameTabTimer = setInterval(() => {
      if (!win.closed) return;
      clearInterval(this.gameTabTimer);
      // 열자마자 닫힘으로 보이면, 사이트가 보안 설정으로 연결을 끊은 것일 수 있다 → 표시 유지
      if (Date.now() - openedAt < 1500) return;
      this.setPlaying(null);
    }, 1000);
    this.cleanups.push(() => clearInterval(this.gameTabTimer));
  }

  setPlaying(gameId) {
    if (this.playing === gameId) return;
    this.playing = gameId;
    this.player.setPlaying(GAME_BY_ID[gameId]?.name ?? null);
    this.net?.send({ playing: gameId });
  }
}
