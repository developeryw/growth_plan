import Phaser from 'phaser';
import LobbyScene from './scenes/LobbyScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1e1a16',
  pixelArt: true, // 픽셀 그래픽이 흐려지지 않게
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE, // 브라우저 창 크기에 맞춤
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [LobbyScene],
});
