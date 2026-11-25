// 사용자 프로필 { name, gender, color } — DB의 users/{uid}에 저장한다
import { ref, get, set } from 'firebase/database';

const ADJECTIVES = ['졸린', '배고픈', '신난', '수줍은', '용감한', '느긋한', '똑똑한', '엉뚱한', '행복한', '씩씩한', '조용한', '반짝이는'];
const ANIMALS = ['너구리', '고양이', '펭귄', '수달', '판다', '여우', '토끼', '고슴도치', '부엉이', '다람쥐', '햄스터', '알파카'];
export const COLORS = [
  0xff8a3d, 0xff6b8b, 0xe04848, 0xf2c94c, 0x6fcf6a, 0x2fa38a,
  0x56ccf2, 0x4f7bff, 0xbb6bd9, 0x8a6a4f, 0x555a66, 0xeeeeee,
];
export const NAME_MAX = 12;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomName() {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function randomProfile() {
  return { name: randomName(), gender: pick(['male', 'female']), color: pick(COLORS) };
}

// 저장된 프로필. 처음 온 사람이면 null
export async function getProfile(db, uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.val();
}

export function saveProfile(db, uid, profile) {
  return set(ref(db, `users/${uid}`), profile);
}

// 다른 사람의 프로필 (처음 볼 때 한 번만 읽고, 바꿨다는 표시 version(profileV)이 달라지면 다시 읽는다)
const cache = new Map(); // uid → { version, promise }
export function fetchProfile(db, uid, version = 0) {
  const hit = cache.get(uid);
  if (!hit || hit.version !== version) {
    const promise = get(ref(db, `users/${uid}`)).then((s) => s.val() || randomProfile());
    cache.set(uid, { version, promise });
  }
  return cache.get(uid).promise;
}
