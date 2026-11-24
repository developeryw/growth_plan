// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) 에 나오는 값을 붙여넣는다.
// 이 값들은 공개돼도 괜찮다. (보안은 database.rules.json 보안 규칙이 지킨다)
// apiKey가 비어 있으면 Firebase 없이 '혼자 모드'로 실행된다.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: '',
};
