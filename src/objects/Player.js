// 캐릭터 한 명 (나 / 다른 사람 공통)
//   anchor = 발밑의 보이지 않는 상자. 물리 충돌과 위치를 담당한다.
//   base   = 피부·머리·신발 그림
//   outfit = 흰색 점프수트 그림 → setTint()로 원하는 색을 입힌다
//   tag    = 머리 위 이름·말풍선·리액션 (HTML이라 글자가 선명하다)
import { REACTION_BY_TYPE, REACTION_MS } from '../data/reactions.js';
import { icon } from '../ui/icons.js';

export const DIRS = ['down', 'left', 'right', 'up'];
export const SPEED = 80; // 초당 픽셀
const SIT_COL = 3; // 시트에서 '앉기' 자세가 있는 열
const BUBBLE_MS = 4000;
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function createPlayerAnims(scene) {
  for (const key of ['body-male', 'body-female']) {
    DIRS.forEach((dir, row) => {
      const f = row * 4;
      scene.anims.create({
        key: `${key}-walk-${dir}`,
        frames: scene.anims.generateFrameNumbers(key, { frames: [f + 1, f, f + 2, f] }),
        frameRate: 8,
        repeat: -1,
      });
    });
  }
}

export default class Player {
  constructor(scene, x, y, { name = '', gender = 'male', color = 0xff8a3d, dir = 'down', isMe = false } = {}) {
    this.scene = scene;
    this.bodyKey = `body-${gender}`;
    this.dir = dir;
    this.seat = null;
    this.vx = 0;
    this.vy = 0;
    this.hop = 0; // 방방 뛰기 리액션용 높이

    this.anchor = scene.add.zone(x, y, 10, 6);
    scene.physics.add.existing(this.anchor);
    this.anchor.body.setCollideWorldBounds(true);

    this.base = scene.add.sprite(x, y, this.bodyKey).setOrigin(0.5, 1);
    this.outfit = scene.add.sprite(x, y, 'outfit').setOrigin(0.5, 1).setTint(color);
    this.showIdle();

    this.tag = document.createElement('div');
    this.tag.className = 'tag' + (isMe ? ' me' : '');
    this.tag.innerHTML =
      '<div class="bubble" hidden></div><div class="reaction" hidden></div><div class="playing" hidden></div><div class="name"></div>';
    this.tag.querySelector('.name').textContent = name;
    document.getElementById('tags').appendChild(this.tag);

    // 물리 계산이 끝난 뒤 그림과 이름표를 발밑 상자에 맞춘다
    scene.events.on('postupdate', this.syncView, this);
  }

  // 성별·옷 색·이름을 바꾼다 (아바타 변경)
  setLook({ name, gender, color }) {
    this.bodyKey = `body-${gender}`;
    this.base.setTexture(this.bodyKey);
    this.outfit.setTint(color);
    this.tag.querySelector('.name').textContent = name;
    if (this.isSitting) this.base.setFrame(this.frameOf(SIT_COL));
    else this.showIdle();
  }

  get feet() {
    return { x: this.anchor.x, y: this.anchor.y };
  }

  get isSitting() {
    return this.seat !== null;
  }

  frameOf(col) {
    return DIRS.indexOf(this.dir) * 4 + col;
  }

  showIdle() {
    this.base.anims.stop();
    this.base.setFrame(this.frameOf(0));
  }

  // vx, vy: -1, 0, 1 (가려는 방향). extra: 위치 보정용 추가 속도
  move(vx, vy, extra = { x: 0, y: 0 }) {
    this.vx = vx;
    this.vy = vy;
    if (this.isSitting) return;
    const len = Math.hypot(vx, vy) || 1;
    this.anchor.body.setVelocity((vx / len) * SPEED + extra.x, (vy / len) * SPEED + extra.y);
    if (vx === 0 && vy === 0) {
      this.showIdle();
      return;
    }
    this.dir = vx < 0 ? 'left' : vx > 0 ? 'right' : vy < 0 ? 'up' : 'down';
    this.base.anims.play(`${this.bodyKey}-walk-${this.dir}`, true);
  }

  sitOn(seat) {
    this.seat = seat;
    this.vx = this.vy = 0;
    this.anchor.body.stop();
    this.anchor.body.enable = false; // 앉아 있는 동안은 가구와 충돌하지 않음
    this.dir = seat.facing;
    this.base.anims.stop();
    this.base.setFrame(this.frameOf(SIT_COL));
    this.anchor.setPosition(seat.cx, seat.cy + 3);
  }

  // 일어날 위치를 정해 주지 않으면 좌석 앞(바라보는 방향으로 한 칸)에 선다
  standUp(x, y) {
    const seat = this.seat;
    if (!seat) return;
    const [dx, dy] = DIR_VEC[seat.facing];
    this.seat = null;
    this.anchor.body.enable = true;
    this.anchor.body.reset(x ?? seat.cx + dx * 16, y ?? seat.cy + dy * 16 + 3);
    this.showIdle();
  }

  teleport(x, y) {
    this.anchor.body.reset(x, y);
  }

  get name() {
    return this.tag.querySelector('.name').textContent;
  }

  // 방장이면 이름 앞에 왕관
  setHost(isHost) {
    this.tag.classList.toggle('host', isHost);
  }

  // 머리 위 "(주사위) ○○ 하는 중" (null이면 지움)
  setPlaying(gameName) {
    const el = this.tag.querySelector('.playing');
    if (gameName) el.replaceChildren(icon('dice'), ` ${gameName} 하는 중`);
    el.hidden = !gameName;
  }

  say(text) {
    const el = this.tag.querySelector('.bubble');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => (el.hidden = true), BUBBLE_MS);
  }

  // type이 null이면 리액션을 지운다. '졸기'는 풀릴 때까지 계속 표시된다.
  react(type) {
    const el = this.tag.querySelector('.reaction');
    clearTimeout(this.reactionTimer);
    this.hopTween?.stop();
    this.hop = 0;
    const r = type && REACTION_BY_TYPE[type];
    if (!r) {
      el.hidden = true;
      this.reaction = null;
      return;
    }
    this.reaction = type;
    el.replaceChildren(icon(r.type, 2)); // 32×32 도트 아이콘
    el.hidden = false;
    if (type === 'win') {
      this.hopTween = this.scene.tweens.add({ targets: this, hop: -6, duration: 150, yoyo: true, repeat: 4, ease: 'Quad.easeOut' });
    }
    if (type !== 'sleep') {
      this.reactionTimer = setTimeout(() => this.react(null), REACTION_MS);
    }
  }

  syncView() {
    const { x, y } = this.anchor;
    // 앉아 있을 때는 발 위치 기준이 조금 다르다
    const footY = y + 3 + this.hop + (this.reaction === 'lose' ? 1 : 0);
    this.base.setPosition(x, footY);
    this.outfit.setPosition(x, footY);
    this.outfit.setFrame(this.base.frame.name);
    // 아래쪽에 있는 사람이 앞에 그려지도록
    const depth = 10 + y / 1000;
    this.base.setDepth(depth);
    this.outfit.setDepth(depth + 0.0001);

    // 화면 좌표로 바꿔서 이름표를 머리 위에 둔다
    const cam = this.scene.cameras.main;
    const sx = (x - cam.worldView.x) * cam.zoom;
    const sy = (footY - 24 - cam.worldView.y) * cam.zoom;
    this.tag.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
  }

  destroy() {
    this.scene.events.off('postupdate', this.syncView, this);
    clearTimeout(this.bubbleTimer);
    clearTimeout(this.reactionTimer);
    this.hopTween?.stop();
    this.anchor.destroy();
    this.base.destroy();
    this.outfit.destroy();
    this.tag.remove();
  }
}
