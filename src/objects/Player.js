// 플레이어 캐릭터.
// 두 겹의 그림으로 이루어져 있다:
//   base   = 피부·머리·신발 (물리 충돌을 담당)
//   outfit = 흰색 점프수트 → setTint()로 원하는 색을 입힌다
export const DIRS = ['down', 'left', 'right', 'up'];
const SIT_COL = 3; // 시트에서 '앉기' 자세가 있는 열
const SPEED = 80; // 초당 픽셀

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
  constructor(scene, x, y, { gender = 'male', color = 0xff8a3d, dir = 'down' } = {}) {
    this.scene = scene;
    this.bodyKey = `body-${gender}`;
    this.dir = dir;
    this.seat = null;

    this.base = scene.physics.add.sprite(x, y, this.bodyKey).setOrigin(0.5, 1);
    // 충돌 상자는 발밑에만 둔다 (탑다운 게임에서 자연스럽게 벽에 붙도록)
    this.base.body.setSize(10, 6).setOffset(3, 18);
    this.base.setCollideWorldBounds(true);

    this.outfit = scene.add.sprite(x, y, 'outfit').setOrigin(0.5, 1).setTint(color);
    this.base.setDepth(10);
    this.outfit.setDepth(10.1);
    this.showIdle();

    // 물리 계산이 끝난 뒤 옷 그림을 몸에 맞춘다
    scene.events.on('postupdate', this.syncOutfit, this);
  }

  get feet() {
    return { x: this.base.x, y: this.base.y - 3 };
  }

  get isSitting() {
    return this.seat !== null;
  }

  setColor(color) {
    this.outfit.setTint(color);
  }

  frameOf(col) {
    return DIRS.indexOf(this.dir) * 4 + col;
  }

  showIdle() {
    this.base.anims.stop();
    this.base.setFrame(this.frameOf(0));
  }

  // vx, vy: -1, 0, 1 (누른 방향키)
  move(vx, vy) {
    if (this.isSitting) return;
    if (vx === 0 && vy === 0) {
      this.base.setVelocity(0, 0);
      this.showIdle();
      return;
    }
    const len = Math.hypot(vx, vy);
    this.base.setVelocity((vx / len) * SPEED, (vy / len) * SPEED);
    this.dir = vx < 0 ? 'left' : vx > 0 ? 'right' : vy < 0 ? 'up' : 'down';
    this.base.anims.play(`${this.bodyKey}-walk-${this.dir}`, true);
  }

  sitOn(seat) {
    this.seat = seat;
    this.base.setVelocity(0, 0);
    this.base.body.enable = false; // 앉아 있는 동안은 가구와 충돌하지 않음
    this.dir = seat.facing;
    this.base.anims.stop();
    this.base.setFrame(this.frameOf(SIT_COL));
    this.base.setPosition(seat.cx, seat.cy + 6);
  }

  // 좌석 앞(바라보는 방향으로 한 칸) 빈 바닥에 세운다
  standUp() {
    const seat = this.seat;
    if (!seat) return;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[seat.facing];
    this.seat = null;
    this.base.body.enable = true;
    this.base.body.reset(seat.cx + dx * 16, seat.cy + dy * 16 + 6);
    this.showIdle();
  }

  syncOutfit() {
    this.outfit.setPosition(this.base.x, this.base.y);
    this.outfit.setFrame(this.base.frame.name);
  }
}
