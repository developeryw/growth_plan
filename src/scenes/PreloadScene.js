// 그림·맵을 한 번만 불러 두고 로비로 넘어간다
import Phaser from 'phaser';
import { createPlayerAnims } from '../objects/Player.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('preload');
  }

  preload() {
    // 앞에 '/'를 붙이지 않아야 GitHub Pages 하위 주소에서도 파일을 찾는다
    this.load.tilemapTiledJSON('lobby-map', 'assets/maps/lobby.json');
    this.load.tilemapTiledJSON('room-map', 'assets/maps/room.json');
    this.load.image('lobby-tiles', 'assets/tilesets/lobby.png');
    // 같은 타일 그림을 한 칸씩 잘라 쓸 수 있게도 불러 둔다 (콜라·팝콘 등)
    this.load.spritesheet('tile-sprites', 'assets/tilesets/lobby.png', { frameWidth: 16, frameHeight: 16 });
    for (const key of ['body-male', 'body-female', 'outfit']) {
      this.load.spritesheet(key, `assets/sprites/${key}.png`, { frameWidth: 16, frameHeight: 24 });
    }
  }

  create() {
    createPlayerAnims(this);
    this.scene.start('lobby');
  }
}
