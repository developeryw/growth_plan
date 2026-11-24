// 로비와 게임방이 함께 쓰는 기본 장면
// 맵 만들기, 내 캐릭터 이동·앉기, 다른 사람 표시(예측+보정), 채팅, 리액션, 아바타 변경, 카메라를 담당한다.
// LobbyScene / RoomScene 이 이 클래스를 이어받아 각자 필요한 것만 더한다.
import Phaser from 'phaser';
import Player from '../objects/Player.js';
import AreaNet from '../net/AreaNet.js';
import { fetchProfile, saveProfile } from '../data/profile.js';
import { openAvatarDialog } from '../ui/avatarDialog.js';
import { GAME_BY_ID } from '../ui/gameMenu.js';
import { REACTIONS, AFK_MS } from '../data/reactions.js';
import * as hud from '../ui/hud.js';

const SIT_DISTANCE = 20; // 이 거리(px) 안에 있는 좌석에 앉을 수 있다
const HEARTBEAT_MS = 1000; // 걷는 중에는 1초마다 위치를 한 번 더 알려 오차를 줄인다
const SNAP_DISTANCE = 48; // 다른 사람 위치가 이만큼 어긋나면 순간이동으로 맞춘다
const CORRECT_MS = 200; // 작은 오차는 이 시간 동안 부드럽게 따라잡는다
export const MOVE_HINT = '방향키/WASD 이동 · Enter 채팅 · 1~9 리액션';
const SEAT_NAMES = { sofa: '3인 소파', massage: '안마의자', beanbag: '빈백', hanging: '행잉 체어', chair: '의자' };

const propsOf = (o) => Object.fromEntries((o.properties || []).map((q) => [q.name, q.value]));

export default class AreaScene extends Phaser.Scene {
  // ── 준비 ──
  // 맵을 만들고 objects 레이어를 읽는다
  buildMap(mapKey) {
    const { session } = this.registry.get('boot');
    this.session = session; // 혼자 모드면 null
    this.profile = this.registry.get('profile');
    this.remotes = new Map(); // uid → { uid, player, profile, state, corr }
    this.loading = new Map(); // 프로필을 불러오는 중인 사람의 최신 상태
    // Phaser는 장면 객체를 다시 쓰므로, 지난번에 남은 값을 매번 초기화한다
    this.leaving = false;
    this.cleanups = [];
    this.net = null;
    this.typing = false;
    this.nearSeat = null;
    this.nearThing = null;

    const map = this.make.tilemap({ key: mapKey });
    const tiles = map.addTilesetImage('lobby', 'lobby-tiles');
    this.solidLayers = [];
    for (const { name } of map.layers) {
      const layer = map.createLayer(name, tiles);
      // Tiled에서 collides=true 로 표시한 타일은 지나갈 수 없다
      layer.setCollisionByProperty({ collides: true });
      this.solidLayers.push(layer);
    }
    this.mapSize = { w: map.widthInPixels, h: map.heightInPixels };
    this.physics.world.setBounds(0, 0, this.mapSize.w, this.mapSize.h);

    this.objects = map.getObjectLayer('objects').objects.map((o) => ({ ...o, props: propsOf(o) }));
    this.seats = this.objects
      .filter((o) => o.type === 'seat')
      .map((o) => ({ id: o.name, kind: o.props.kind, facing: o.props.facing, cx: o.x + o.width / 2, cy: o.y + o.height / 2 }));
    this.seatById = Object.fromEntries(this.seats.map((s) => [s.id, s]));
    return map;
  }

  // 내 캐릭터, 키 입력, 화면 UI, 카메라
  createMe(x, y, dir) {
    this.player = new Player(this, x, y, { ...this.profile, dir, isMe: true });
    this.setTyping(false);
    this.addColliders(this.player);

    // 가까운 좌석을 깜빡이는 테두리로 표시
    this.seatMarker = this.add.rectangle(0, 0, 18, 18).setStrokeStyle(1, 0xffe08a).setDepth(9).setVisible(false);
    this.tweens.add({ targets: this.seatMarker, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });

    // W,A,S,D는 '가로채기'를 끄고 등록한다 (켜 두면 채팅창에 w,a,s,d를 칠 수 없다)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D', false);
    this.input.keyboard.on('keydown-E', () => this.interact());
    this.input.keyboard.on('keydown', (e) => {
      this.lastInputAt = Date.now();
      if (this.player.reaction === 'sleep' && e.key !== '9') this.setReaction(null);
      const r = REACTIONS.find((x) => x.key === e.key);
      if (r) this.setReaction(r.type);
    });
    this.lastInputAt = Date.now();
    this.input.on('pointerdown', () => (this.lastInputAt = Date.now()));

    hud.bind({
      onStand: () => this.standUp(),
      onMenu: () => this.onSeatMenu(),
      onAvatar: () => this.editAvatar(),
      onSend: (text) => this.sendChat(text),
      onTyping: (typing) => this.setTyping(typing),
    });
    hud.clearChatLog();
    hud.showSeatButtons(false);
    hud.showAvatarButton(true);

    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);
    this.cameras.main.fadeIn(250);

    if (this.session) this.cleanups.push(this.session.onKicked(() => this.onKicked()));
    this.events.once('shutdown', () => this.shutdownArea());
  }

  // 영역(로비 / rooms/n) 실시간 동기화 시작
  startNet(basePath, extraState = {}) {
    this.updateStatus();
    if (!this.session) return;
    this.lastSent = this.myState();
    this.lastSentAt = 0;
    this.net = new AreaNet(this.session, basePath, {
      onJoin: (uid, s) => this.addRemote(uid, s),
      onUpdate: (uid, s) => this.updateRemote(uid, s),
      onLeave: (uid) => this.removeRemote(uid),
      onLoaded: () => this.onPlayersLoaded(),
      onChat: (msg, isNew) => this.showChat(msg, isNew),
    });
    this.net.start({ ...this.lastSent, reaction: null, reactionAt: 0, playing: null, ...extraState });
  }

  shutdownArea() {
    this.scale.off('resize', this.fitCamera, this);
    this.cleanups.forEach((fn) => fn());
    this.net?.stop();
    for (const uid of [...this.remotes.keys()]) this.removeRemote(uid);
    this.player.destroy();
    hud.setHint('');
  }

  // 다른 장면으로 화면을 어둡게 하며 넘어간다
  fadeTo(key, data) {
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key, data));
  }

  addColliders(player) {
    this.physics.add.collider(player.anchor, this.solidLayers);
  }

  updateStatus() {
    if (this.session?.kicked) return;
    hud.setStatus(this.session ? `${this.profile.name} · ${this.areaLabel()}` : `${this.profile.name} · 혼자 모드`);
  }

  // ── 하위 장면이 필요하면 바꾸는 부분 ──
  areaLabel() {
    return '접속됨';
  }
  onSat() {}
  onStood() {}
  onSeatMenu() {}
  onPlayersLoaded() {}
  onMemberState() {}
  onMemberLeave() {}
  // 좌석 말고 E로 쓸 수 있는 것: { hint, action } 또는 null
  nearInteraction() {
    return null;
  }
  areaUpdate() {}

  // ── 매 프레임 ──
  update(time) {
    if (this.leaving) return;
    this.updateMe(time);
    for (const r of this.remotes.values()) this.updateRemoteMotion(r, time);
    this.areaUpdate(time);

    // 5분 동안 아무 입력이 없으면 자동으로 졸기
    if (Date.now() - this.lastInputAt > AFK_MS && this.player.reaction !== 'sleep') this.setReaction('sleep');
  }

  // 지금 누르고 있는 방향 (-1, 0, 1)
  inputDir() {
    if (this.typing) return { vx: 0, vy: 0 };
    const k = this.cursors;
    const w = this.wasd;
    return {
      vx: (k.right.isDown || w.D.isDown ? 1 : 0) - (k.left.isDown || w.A.isDown ? 1 : 0),
      vy: (k.down.isDown || w.S.isDown ? 1 : 0) - (k.up.isDown || w.W.isDown ? 1 : 0),
    };
  }

  updateMe(time) {
    const { vx, vy } = this.inputDir();
    if (this.player.isSitting) {
      if (vx !== 0 || vy !== 0) this.standUp(); // 방향키를 누르면 자연스럽게 일어남
    } else {
      this.player.move(vx, vy);
      this.nearSeat = this.findNearSeat();
      this.nearThing = this.nearSeat ? null : this.nearInteraction();
      if (this.nearSeat) {
        this.seatMarker.setPosition(this.nearSeat.cx, this.nearSeat.cy).setVisible(true);
        hud.setHint(`E: ${SEAT_NAMES[this.nearSeat.kind] || '좌석'}에 앉기 · ${MOVE_HINT}`);
      } else {
        this.seatMarker.setVisible(false);
        hud.setHint(this.nearThing ? `${this.nearThing.hint} · ${MOVE_HINT}` : MOVE_HINT);
      }
    }
    this.syncMe(time);
  }

  // ── 내 상태 전송: 출발·방향 전환·정지·앉기/서기 때만, 걷는 중엔 1초마다 한 번 ──
  myState() {
    const p = this.player;
    return {
      x: Math.round(p.anchor.x),
      y: Math.round(p.anchor.y),
      dir: p.dir,
      vx: p.vx,
      vy: p.vy,
      moving: p.vx !== 0 || p.vy !== 0,
      seat: p.seat ? p.seat.id : null,
    };
  }

  syncMe(time) {
    if (!this.net) return;
    const s = this.myState();
    const last = this.lastSent;
    const changed = s.vx !== last.vx || s.vy !== last.vy || s.seat !== last.seat || s.dir !== last.dir;
    const heartbeat = s.moving && time - this.lastSentAt > HEARTBEAT_MS;
    if (changed || heartbeat) {
      this.net.send(s);
      this.lastSent = s;
      this.lastSentAt = time;
    }
  }

  // ── 다른 사람 ──
  async addRemote(uid, state) {
    this.loading.set(uid, state);
    this.onMemberState(uid, state);
    const profile = await fetchProfile(this.session.db, uid);
    // 프로필을 불러오는 사이에 나갔거나, 상태가 바뀌었을 수 있다
    if (!this.loading.has(uid) || this.remotes.has(uid) || !this.sys.isActive()) return;
    const latest = this.loading.get(uid);
    this.loading.delete(uid);
    const player = new Player(this, latest.x, latest.y, { ...profile, dir: latest.dir });
    this.addColliders(player);
    const r = { uid, player, profile, state: latest, corr: null };
    this.remotes.set(uid, r);
    this.applyRemote(r, latest, true);
    this.onRemoteReady(r);
  }

  onRemoteReady() {}

  updateRemote(uid, state) {
    this.onMemberState(uid, state);
    const r = this.remotes.get(uid);
    if (r) this.applyRemote(r, state, false);
    else if (this.loading.has(uid)) this.loading.set(uid, state);
  }

  applyRemote(r, s, first) {
    const p = r.player;
    const prev = r.state;
    r.state = s;
    // 앉기 / 서기
    const seat = s.seat ? this.seatById[s.seat] : null;
    if (seat && p.seat !== seat) {
      if (p.isSitting) p.standUp();
      p.sitOn(seat);
    } else if (!seat && p.isSitting) {
      p.standUp(s.x, s.y);
    }
    // 하고 있는 1인 게임
    if (first || s.playing !== prev.playing) p.setPlaying(GAME_BY_ID[s.playing]?.name ?? null);
    // 아바타를 바꿨으면 프로필을 다시 읽어 모습을 바꾼다
    if (!first && s.profileV !== prev.profileV) {
      fetchProfile(this.session.db, r.uid, true).then((pf) => {
        const cur = this.remotes.get(r.uid);
        if (!cur) return;
        cur.profile = pf;
        cur.player.setLook(pf);
        this.onRemoteReady(cur);
      });
    }
    // 리액션: 누른 시각(reactionAt)이 바뀌었을 때만 새로 보여 준다 (같은 리액션 연속도 OK)
    // 처음 들어올 때 이미 있던 리액션은 '졸기'만 보여 준다
    if (first) {
      if (s.reaction === 'sleep') p.react('sleep');
    } else if (s.reactionAt !== prev.reactionAt) {
      p.react(s.reaction);
    }
    if (seat) return;
    // 위치 보정: 많이 어긋나면 순간이동, 조금이면 잠깐 속도를 더해 따라잡는다
    p.dir = s.dir;
    const dx = s.x - p.anchor.x;
    const dy = s.y - p.anchor.y;
    if (first || Math.hypot(dx, dy) > SNAP_DISTANCE) {
      p.teleport(s.x, s.y);
      r.corr = null;
    } else {
      r.corr = { x: (dx * 1000) / CORRECT_MS, y: (dy * 1000) / CORRECT_MS, until: this.time.now + CORRECT_MS };
    }
    if (!s.moving) p.showIdle();
  }

  // 받은 방향대로 계속 걸어가게 그린다 (다음 소식이 올 때까지 예측)
  updateRemoteMotion(r, time) {
    const p = r.player;
    if (p.isSitting) return;
    const corr = r.corr && time < r.corr.until ? r.corr : undefined;
    p.move(r.state.vx || 0, r.state.vy || 0, corr);
    if (!r.state.moving) {
      p.dir = r.state.dir;
      p.showIdle();
    }
  }

  removeRemote(uid) {
    this.loading.delete(uid);
    const r = this.remotes.get(uid);
    if (r) {
      r.player.destroy();
      this.remotes.delete(uid);
    }
    if (!this.leaving) this.onMemberLeave(uid);
  }

  nameOf(uid) {
    if (uid === this.session?.uid) return this.profile.name;
    return this.remotes.get(uid)?.profile.name;
  }

  // ── 채팅·리액션 ──
  sendChat(text) {
    text = text.slice(0, 100);
    if (this.net) this.net.sendChat(this.profile.name, text);
    else this.showChat({ uid: 'me', name: this.profile.name, text }, true);
  }

  showChat(msg, isNew) {
    const mine = msg.uid === (this.session?.uid ?? 'me');
    hud.addChatLog(msg.name, msg.text, mine);
    if (!isNew) return;
    const speaker = mine ? this.player : this.remotes.get(msg.uid)?.player;
    speaker?.say(msg.text);
  }

  setReaction(type) {
    this.player.react(type);
    this.net?.send({ reaction: type, reactionAt: Date.now() });
  }

  // 채팅·설정창 등에 글자를 칠 때는 게임 키 입력을 끈다
  setTyping(typing) {
    this.typing = typing;
    this.lastInputAt = Date.now();
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.enabled = !typing;
    if (typing) kb.disableGlobalCapture();
    else {
      kb.enableGlobalCapture();
      kb.resetKeys();
    }
  }

  // [아바타 변경] → 설정창 → 저장하면 내 모습을 바꾸고 다른 사람에게 알린다
  async editAvatar() {
    this.setTyping(true);
    const profile = await openAvatarDialog(this.profile, { title: '아바타 변경', submitText: '저장', cancellable: true });
    this.setTyping(false);
    if (!profile || !this.sys.isActive()) return;
    if (this.session) await saveProfile(this.session.db, this.session.uid, profile);
    this.profile = profile;
    this.registry.set('profile', profile);
    this.player.setLook(profile);
    this.updateStatus();
    // 다른 사람들은 profileV가 바뀐 것을 보고 내 프로필을 다시 읽는다
    this.net?.send({ profileV: Date.now() });
    this.onProfileChanged();
  }

  onProfileChanged() {}

  // ── 좌석·상호작용 ──
  findNearSeat() {
    const { x, y } = this.player.feet;
    const taken = new Set([...this.remotes.values()].map((r) => r.player.seat?.id));
    let best = null;
    let bestDist = SIT_DISTANCE;
    for (const seat of this.seats) {
      if (taken.has(seat.id)) continue;
      const d = Phaser.Math.Distance.Between(x, y, seat.cx, seat.cy);
      if (d < bestDist) {
        best = seat;
        bestDist = d;
      }
    }
    return best;
  }

  // E 키: 앉아 있으면 일어나고, 좌석 근처면 앉고, 그 밖의 물건 근처면 그것을 쓴다
  interact() {
    if (this.leaving) return;
    if (this.player.isSitting) {
      this.standUp();
    } else if (this.nearSeat) {
      const seat = this.nearSeat;
      this.player.sitOn(seat);
      this.seatMarker.setVisible(false);
      hud.setHint(`${SEAT_NAMES[seat.kind] || '좌석'}에 앉아 있어요 · E 또는 방향키: 일어나기`);
      hud.showSeatButtons(true, this.hasSeatMenu);
      this.onSat(seat);
    } else if (this.nearThing) {
      this.nearThing.action();
    }
  }

  standUp() {
    if (!this.player.isSitting) return;
    this.player.standUp();
    hud.showSeatButtons(false);
    this.onStood();
  }

  onKicked() {
    this.leaving = true;
    this.scene.pause();
    for (const uid of [...this.remotes.keys()]) this.removeRemote(uid);
    hud.setStatus('연결 끊김');
    hud.showNotice('다른 탭에서 접속 중이에요.\n이 탭은 연결을 끊었어요.', '이 탭에서 다시 접속', () => location.reload());
  }

  // 창 크기에 맞춰 확대 배율을 정한다. 맵이 화면에 다 들어가면 가운데 고정, 아니면 캐릭터를 따라간다.
  fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.floor(Math.min(width / this.mapSize.w, height / this.mapSize.h)), 2, 4);
    cam.setZoom(zoom);
    if (this.mapSize.w * zoom <= width && this.mapSize.h * zoom <= height) {
      cam.stopFollow();
      cam.removeBounds();
      cam.centerOn(this.mapSize.w / 2, this.mapSize.h / 2);
    } else {
      cam.setBounds(0, 0, this.mapSize.w, this.mapSize.h);
      cam.startFollow(this.player.anchor, true);
    }
  }

  // 월드 좌표 → 화면 좌표 (HTML 이름표 등을 맵 위에 띄울 때)
  toScreen(x, y) {
    const cam = this.cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
  }

  objectByName(name) {
    return this.objects.find((o) => o.name === name);
  }
}
