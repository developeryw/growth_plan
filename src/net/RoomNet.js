// 단체 게임방 정보: 입장(트랜잭션), 방장, 잠금, 해산, 투표, 게임 선택, 초대 정보
// rooms/{n}: { host, locked, state, game, invite, players/{uid}, votes/{uid}, chat/{id} }
// 로비 사람들은 rooms/* 를 구독하지 않으므로, 문 위 인원 표시는 작은 거울 데이터를 쓴다:
//   lobby/roomMembers/{n}/{uid}: true   (창을 닫으면 자동 삭제)
//   lobby/roomLocks/{n}: true/false
import { ref, get, set, update, remove, onValue, runTransaction, serverTimestamp } from 'firebase/database';

export const ROOM_MAX = 6;
export const ROOM_COUNT = 4;

// 방을 새로 시작할 때 지우는 것들 (이전 모임의 채팅도 지운다)
const RESET = { locked: false, state: 'open', game: null, invite: null, votes: null, chat: null };

// 방에 들어가 본다. 성공하면 { ok: true }, 실패하면 { ok: false, reason: 'full' | 'locked' | 'disbanded' | 'error' }
// "6명 미만 & 잠금 아님" 검사와 자리 차지를 트랜잭션으로 한 번에 처리해서, 동시에 들어와도 7명이 되지 않는다.
export async function tryEnter(session, n, initialState) {
  const { db, uid } = session;
  const roomPath = `rooms/${n}`;
  const [locked, state] = await Promise.all([get(ref(db, `${roomPath}/locked`)), get(ref(db, `${roomPath}/state`))]);
  let reason = null;
  let wasEmpty = false;
  let result;
  try {
    result = await runTransaction(
      ref(db, `${roomPath}/players`),
      (players) => {
        players = players || {};
        const others = Object.keys(players).filter((k) => k !== uid).length;
        wasEmpty = others === 0;
        reason = null;
        // 아무도 없는 방의 잠금·해산 표시는 예전 기록이므로 무시한다
        if (!wasEmpty && locked.val()) reason = 'locked';
        else if (!wasEmpty && state.val() === 'disbanded') reason = 'disbanded';
        else if (others >= ROOM_MAX) reason = 'full';
        if (reason) return undefined; // 트랜잭션 취소
        players[uid] = initialState;
        return players;
      },
      { applyLocally: false },
    );
  } catch (err) {
    console.error(err);
    return { ok: false, reason: 'error' };
  }
  if (!result.committed) return { ok: false, reason: reason || 'error' };

  if (wasEmpty) {
    // 빈 방에 처음 들어옴 → 방을 새로 시작하고 내가 방장
    await update(ref(db, roomPath), { ...RESET, host: uid });
    await set(ref(db, `lobby/roomLocks/${n}`), false);
  } else {
    // 방장 자리가 비어 있으면(방장이 갑자기 나간 경우) 내가 맡는다
    const players = result.snapshot.val() || {};
    await runTransaction(ref(db, `${roomPath}/host`), (host) => (host && players[host] ? undefined : uid));
  }
  await session.removeOnDisconnect(`rooms/${n}/votes/${uid}`);
  await session.removeOnDisconnect(`lobby/roomMembers/${n}/${uid}`);
  await set(ref(db, `lobby/roomMembers/${n}/${uid}`), true);
  return { ok: true };
}

export default class RoomNet {
  // handlers: { onHost, onLocked, onState, onGame, onInvite, onVotes } — 각각 (value) 를 받는다
  constructor(session, n, handlers) {
    this.session = session;
    this.db = session.db;
    this.uid = session.uid;
    this.n = n;
    this.path = `rooms/${n}`;
    this.h = handlers;
    this.unsubs = [];
  }

  r(sub) {
    return ref(this.db, `${this.path}/${sub}`);
  }

  start() {
    const watch = (key, fn) => this.unsubs.push(onValue(this.r(key), (s) => fn(s.val())));
    watch('host', this.h.onHost);
    watch('locked', this.h.onLocked);
    watch('state', this.h.onState);
    watch('game', this.h.onGame);
    watch('invite', this.h.onInvite);
    watch('votes', this.h.onVotes);
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  get canWrite() {
    return !this.session.kicked;
  }

  // ── 방장 ──
  setHost(uid) {
    return set(this.r('host'), uid);
  }

  // 방장이 사라졌을 때, 다음 방장 후보(가장 먼저 들어온 사람)가 부른다
  claimHost(oldHost) {
    return runTransaction(this.r('host'), (host) => (host === oldHost || !host ? this.uid : undefined));
  }

  setLocked(locked) {
    update(ref(this.db), { [`${this.path}/locked`]: locked, [`lobby/roomLocks/${this.n}`]: locked });
  }

  disband() {
    update(ref(this.db), {
      [`${this.path}/state`]: 'disbanded',
      [`${this.path}/game`]: null,
      [`${this.path}/invite`]: null,
      [`${this.path}/votes`]: null,
      [`${this.path}/locked`]: false,
      [`lobby/roomLocks/${this.n}`]: false,
    });
  }

  // ── 투표·게임 ──
  vote(gameId) {
    return set(this.r(`votes/${this.uid}`), gameId);
  }

  play(gameId, url) {
    return update(ref(this.db, this.path), { game: { id: gameId, url, at: serverTimestamp() }, invite: null });
  }

  endGame() {
    return update(ref(this.db, this.path), { game: null, invite: null });
  }

  // invite: { type: 'link' | 'code', value }
  setInvite(invite) {
    return set(this.r('invite'), invite);
  }

  // 방에서 나간다. 내가 마지막이면 방을 처음 상태로 되돌린다.
  async leave({ last }) {
    this.stop();
    const { n, uid } = this;
    await this.session.cancelOnDisconnect(`rooms/${n}/votes/${uid}`);
    await this.session.cancelOnDisconnect(`lobby/roomMembers/${n}/${uid}`);
    if (!this.canWrite) return;
    await Promise.all([remove(this.r(`votes/${uid}`)), remove(ref(this.db, `lobby/roomMembers/${n}/${uid}`))]);
    if (last) {
      await update(ref(this.db, this.path), { ...RESET, host: null });
      await set(ref(this.db, `lobby/roomLocks/${n}`), false);
    }
  }
}
