import Phaser from 'phaser';

// 0단계: 게임 화면이 잘 뜨는지만 확인하는 임시 장면
class HelloScene extends Phaser.Scene {
  constructor() {
    super('hello');
  }

  create() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, '온라인 보드게임 카페\n준비 중이에요 🎲', {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#f3e3c3',
        align: 'center',
      })
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#3b2a1e',
  pixelArt: true, // 픽셀 그래픽이 흐려지지 않게
  scale: {
    mode: Phaser.Scale.RESIZE, // 브라우저 창 크기에 맞춤
  },
  scene: [HelloScene],
});
