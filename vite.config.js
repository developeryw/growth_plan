import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // GitHub Pages는 https://아이디.github.io/저장소이름/ 아래에서 열리므로
  // 상대 경로('./')로 빌드해야 어느 주소에서든 파일을 찾을 수 있다.
  base: './',
  build: {
    // Phaser 라이브러리 자체가 커서 나오는 경고를 끈다.
    chunkSizeWarningLimit: 2000,
    // 페이지 2개: 카페(index.html)와 관리자 화면(admin/index.html → 주소/admin/)
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
