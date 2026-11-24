import Phaser from 'phaser';
import Player, { createPlayerAnims } from '../objects/Player.js';
import { setHint, showStandButton, onStandClick } from '../ui/hud.js';

const SEAT_NAMES = {
  sofa: '3인 소파',
  massage: '안마의자',
  beanbag: '빈백',
  hanging: '행잉 체어',
};
const SIT_DISTANCE = 20; // 이 거리(px) 안에 있는 좌석에 앉을 수 있다
const MOVE_HINT = '방향키/WASD 이동';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('lobby');
  }

  preload() {
    // 앞에 '/'를 붙이지 않아야 GitHub Pages 하위 주소에서도 파일을 찾는다
    this.load.tilemapTiledJSON('lobby-map', 'assets/maps/lobby.json');
    this.load.image('lobby-tiles', 'assets/tilesets/lobby.png');
    for (const key of ['body-male', 'body-female', 'outfit']) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, { frameWidth: 16, frameHeight: 24 });
    }
  }

  create() {
    // ── 맵 ──
    const map = this.make.tilemap({ key: 'lobby-map' });
    const tiles = map.addTilesetImage('lobby', 'lobby-tiles');
    map.createLayer('floor', tiles);
    map.createLayer('rug', tiles);
    const walls = map.createLayer('walls', tiles);
    const furniture = map.createLayer('furniture', tiles);
    // Tiled에서 collides=true 로 표시한 타일은 지나갈 수 없다
    walls.setCollisionByProperty({ collides: true });
    furniture.setCollisionByProperty({ collides: true });
    this.mapSize = { w: map.widthInPixels, h: map.heightInPixels };
    this.physics.world.setBounds(0, 0, this.mapSize.w, this.mapSize.h);

    // ── 맵의 objects 레이어: 입구(spawn)와 좌석(seat) ──
    const objects = map.getObjectLayer('objects').objects;
    const spawn = objects.find((o) => o.name === 'spawn');
    this.seats = objects
      .filter((o) => o.type === 'seat')
      .map((o) => {
        const p = Object.fromEntries((o.properties || []).map((q) => [q.name, q.value]));
        return { id: o.name, kind: p.kind, facing: p.facing, cx: o.x + o.width / 2, cy: o.y + o.height / 2 };
      });

    // ── 플레이어 (입구에서 시작, 안쪽을 바라봄) ──
    createPlayerAnims(this);
    this.player = new Player(this, spawn.x, spawn.y, { gender: 'male', dir: 'up' });
    this.physics.add.collider(this.player.base, [walls, furniture]);

    // 가까운 좌석을 깜빡이는 테두리로 표시
    this.seatMarker = this.add.rectangle(0, 0, 18, 18).setStrokeStyle(1, 0xffe08a).setDepth(9).setVisible(false);
    this.tweens.add({ targets: this.seatMarker, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });

    // ── 키 입력 ──
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.input.keyboard.on('keydown-E', () => this.toggleSit());
    onStandClick(() => this.standUp());

    // ── 카메라 ──
    this.fitCamera();
    this.scale.on('resize', this.fitCamera, this);
  }

  update() {
    const k = this.cursors;
    const w = this.wasd;
    const vx = (k.right.isDown || w.D.isDown ? 1 : 0) - (k.left.isDown || w.A.isDown ? 1 : 0);
    const vy = (k.down.isDown || w.S.isDown ? 1 : 0) - (k.up.isDown || w.W.isDown ? 1 : 0);

    if (this.player.isSitting) {
      if (vx !== 0 || vy !== 0) this.standUp(); // 방향키를 누르면 자연스럽게 일어남
      return;
    }

    this.player.move(vx, vy);

    this.nearSeat = this.findNearSeat();
    if (this.nearSeat) {
      this.seatMarker.setPosition(this.nearSeat.cx, this.nearSeat.cy).setVisible(true);
      setHint(`E: ${SEAT_NAMES[this.nearSeat.kind]}에 앉기 · ${MOVE_HINT}`);
    } else {
      this.seatMarker.setVisible(false);
      setHint(MOVE_HINT);
    }
  }

  findNearSeat() {
    const { x, y } = this.player.feet;
    let best = null;
    let bestDist = SIT_DISTANCE;
    for (const seat of this.seats) {
      const d = Phaser.Math.Distance.Between(x, y, seat.cx, seat.cy);
      if (d < bestDist) {
        best = seat;
        bestDist = d;
      }
    }
    return best;
  }

  toggleSit() {
    if (this.player.isSitting) {
      this.standUp();
    } else if (this.nearSeat) {
      this.player.sitOn(this.nearSeat);
      this.seatMarker.setVisible(false);
      setHint(`${SEAT_NAMES[this.nearSeat.kind]}에 앉아 있어요 · E 또는 방향키: 일어나기`);
      showStandButton(true);
    }
  }

  standUp() {
    if (!this.player.isSitting) return;
    this.player.standUp();
    showStandButton(false);
  }

  // 창 크기에 맞춰 확대 배율을 정한다. 맵이 화면에 다 들어가면 가운데 고정, 아니면 캐릭터를 따라간다.
  fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    const zoom = Math.max(2, Math.floor(Math.min(width / this.mapSize.w, height / this.mapSize.h)));
    cam.setZoom(zoom);
    if (this.mapSize.w * zoom <= width && this.mapSize.h * zoom <= height) {
      cam.stopFollow();
      cam.removeBounds();
      cam.centerOn(this.mapSize.w / 2, this.mapSize.h / 2);
    } else {
      cam.setBounds(0, 0, this.mapSize.w, this.mapSize.h);
      cam.startFollow(this.player.base, true);
    }
  }
}
