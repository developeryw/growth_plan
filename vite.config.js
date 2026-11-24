import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages는 https://아이디.github.io/저장소이름/ 아래에서 열리므로
  // 상대 경로('./')로 빌드해야 어느 주소에서든 파일을 찾을 수 있다.
  base: './',
  // Phaser 라이브러리 자체가 커서 나오는 경고를 끈다.
  build: { chunkSizeWarningLimit: 2000 },
});
