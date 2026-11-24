import Phaser from 'phaser';
import LobbyScene from './scenes/LobbyScene.js';
import { connect } from './net/firebase.js';
import { getProfile, saveProfile } from './data/profile.js';
import { openAvatarDialog } from './ui/avatarDialog.js';
import { setStatus } from './ui/hud.js';

async function boot() {
  setStatus('접속 중…');
  let session = null;
  let profile;
  try {
    session = await connect();
    profile = session ? await getProfile(session.db, session.uid) : null;
    if (!profile) {
      // 처음 온 사람: 아바타 설정창을 먼저 띄운다
      setStatus('아바타를 만들어 주세요');
      profile = await openAvatarDialog(null);
      if (session) await saveProfile(session.db, session.uid, profile);
    }
  } catch (err) {
    console.error(err);
    setStatus('접속 실패 — 새로고침해 주세요');
    return;
  }

  const game = new Phaser.Game({
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
    callbacks: {
      // 장면이 시작되기 전에 접속 정보를 넘겨준다
      preBoot: (g) => g.registry.set('boot', { session, profile }),
    },
    scene: [LobbyScene],
  });
  window.__game = game; // 브라우저 콘솔에서 상태를 살펴볼 때 사용
}

boot();
