// 로비 게시판 데이터
//   board/posts/{칸}         { image, name, date, createdAt }   칸 = '0' ~ '9' (최대 10개)
//   board/postSecrets/{칸}   비밀번호 4자리 — 아무도 읽을 수 없다
//   board/deleteTickets/{칸}/{uid}  삭제하려는 사람이 입력한 비밀번호
// 비밀번호가 맞는지는 브라우저가 아니라 보안 규칙(database.rules.json)이 비교한다.
import { ref, onValue, update, set, serverTimestamp } from 'firebase/database';

export const BOARD_MAX = 10;

// 게시판을 열어 둔 동안만 구독한다 (무료 한도 절약). 최신 글이 앞에 온다.
export function watchPosts(db, callback) {
  return onValue(ref(db, 'board/posts'), (snap) => {
    const posts = Object.entries(snap.val() || {}).map(([slot, p]) => ({ slot, ...p }));
    posts.sort((a, b) => b.createdAt - a.createdAt);
    callback(posts);
  });
}

// 빈 칸이 있으면 그 칸, 10개가 꽉 찼으면 가장 오래된 글의 칸
function pickSlot(posts) {
  const used = new Set(posts.map((p) => p.slot));
  for (let i = 0; i < BOARD_MAX; i++) if (!used.has(String(i))) return String(i);
  return posts.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b)).slot;
}

// 글 올리기. 11번째 글이면 가장 오래된 글 자리에 덮어쓴다 (보안 규칙이 '정말 가장 오래된 글인지' 확인)
export async function createPost(db, posts, { image, name, date, password }) {
  const slot = pickSlot(posts);
  await update(ref(db, 'board'), {
    [`posts/${slot}`]: { image, name, date, createdAt: serverTimestamp() },
    [`postSecrets/${slot}`]: password,
    [`deleteTickets/${slot}`]: null,
  });
  return { replacedOldest: posts.length >= BOARD_MAX };
}

// 삭제: ① 내가 입력한 비밀번호를 '삭제 요청표'로 적고 ② 글 삭제를 시도한다.
// 보안 규칙이 요청표와 저장된 비밀번호를 비교해서, 틀리면 ②가 거절된다 → false
export async function deletePost(db, uid, slot, password) {
  const ticketRef = ref(db, `board/deleteTickets/${slot}/${uid}`);
  await set(ticketRef, password);
  try {
    await update(ref(db, 'board'), {
      [`posts/${slot}`]: null,
      [`postSecrets/${slot}`]: null,
      [`deleteTickets/${slot}`]: null,
    });
    return true;
  } catch (err) {
    if (!String(err?.message || err).includes('PERMISSION_DENIED')) throw err;
    await set(ticketRef, null);
    return false;
  }
}
