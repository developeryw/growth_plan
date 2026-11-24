// 사용자 프로필 { name, gender, color } — 3단계에서 설정창이 생기기 전까지는 랜덤으로 정한다
import { ref, get, set } from 'firebase/database';

const ADJECTIVES = ['졸린', '배고픈', '신난', '수줍은', '용감한', '느긋한', '똑똑한', '엉뚱한', '행복한', '씩씩한', '조용한', '반짝이는'];
const ANIMALS = ['너구리', '고양이', '펭귄', '수달', '판다', '여우', '토끼', '고슴도치', '부엉이', '다람쥐', '햄스터', '알파카'];
export const COLORS = [0xff8a3d, 0x4fa3ff, 0x6fcf6a, 0xf2c94c, 0xbb6bd9, 0xff6b8b, 0x56ccf2, 0xeeeeee];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomName() {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function randomProfile() {
  return { name: randomName(), gender: pick(['male', 'female']), color: pick(COLORS) };
}

// DB에 프로필이 있으면 불러오고, 없으면 랜덤으로 만들어 저장한다
export async function loadProfile(db, uid) {
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  if (snap.exists()) return snap.val();
  const profile = randomProfile();
  await set(userRef, profile);
  return profile;
}

// 다른 사람의 프로필 (처음 볼 때 한 번만 읽는다)
const cache = new Map();
export function fetchProfile(db, uid) {
  if (!cache.has(uid)) cache.set(uid, get(ref(db, `users/${uid}`)).then((s) => s.val() || randomProfile()));
  return cache.get(uid);
}
