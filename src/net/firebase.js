// Firebase 연결과 익명 로그인
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { firebaseConfig } from '../firebase-config.js';

// 주소 끝에 ?emu 를 붙이면 내 컴퓨터의 Firebase 에뮬레이터에 연결한다 (개발·테스트용)
const useEmulator = new URLSearchParams(location.search).has('emu');
export const isOnline = useEmulator || Boolean(firebaseConfig.apiKey);

const EMULATOR_CONFIG = {
  apiKey: 'demo-key',
  projectId: 'demo-growth',
  // 보안 규칙(firebase.json)은 기본 인스턴스 이름(프로젝트ID-default-rtdb)에 적용된다
  databaseURL: 'http://127.0.0.1:9000?ns=demo-growth-default-rtdb',
};

// 로그인까지 마치고 { db, uid } 를 돌려준다. 설정이 없으면 null.
export async function connect() {
  if (!isOnline) return null;
  const app = initializeApp(useEmulator ? EMULATOR_CONFIG : firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  // 이미 익명 로그인한 적이 있으면 같은 uid가 그대로 돌아온다 (브라우저에 저장됨)
  const { user } = await signInAnonymously(auth);
  return { db, uid: user.uid };
}
