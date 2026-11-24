// 로비 실시간 동기화: 접속 상태(presence), 내 위치 전송, 다른 사람 구독, 채팅, 다중 탭 감지
// 무료 한도를 지키기 위해 lobby/* 만 구독하고, 위치는 바뀔 때만 최대 초당 5회 보낸다.
import {
  ref,
  set,
  update,
  get,
  push,
  remove,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  serverTimestamp,
  query,
  limitToLast,
  goOffline,
} from 'firebase/database';

const SEND_INTERVAL_MS = 200; // 초당 최대 5회
const CHAT_KEEP = 30; // 채팅은 최근 30개만 유지

export default class LobbyNet {
  // handlers: { onJoin(uid, state), onUpdate(uid, state), onLeave(uid), onChat(msg, isNew), onKicked() }
  constructor(db, uid, handlers) {
    this.db = db;
    this.uid = uid;
    this.h = handlers;
    this.tabId = Math.random().toString(36).slice(2, 10);
    this.presenceRef = ref(db, `presence/${uid}`);
    this.playerRef = ref(db, `lobby/players/${uid}`);
    this.chatRef = ref(db, 'lobby/chat');
    this.state = null; // 마지막으로 알려진 내 상태
    this.pending = null; // 아직 보내지 않은 변경
    this.lastSentAt = 0;
    this.timer = null;
    this.unsubs = [];
    this.kicked = false;
  }

  start(initialState) {
    this.state = { ...initialState };
    // 연결될 때마다(재연결 포함) 접속 정보를 다시 쓰고, 끊기면 자동으로 지워지게 예약한다
    this.unsubs.push(
      onValue(ref(this.db, '.info/connected'), async (snap) => {
        if (!snap.val() || this.kicked) return;
        await onDisconnect(this.presenceRef).remove();
        await onDisconnect(this.playerRef).remove();
        await set(this.presenceRef, { area: 'lobby', tabId: this.tabId, at: serverTimestamp() });
        await set(this.playerRef, this.state);
        this.watchOtherTabs();
      }),
    );

    const playersRef = ref(this.db, 'lobby/players');
    this.unsubs.push(
      onChildAdded(playersRef, (s) => s.key !== this.uid && this.h.onJoin(s.key, s.val())),
      onChildChanged(playersRef, (s) => s.key !== this.uid && this.h.onUpdate(s.key, s.val())),
      onChildRemoved(playersRef, (s) => s.key !== this.uid && this.h.onLeave(s.key)),
    );

    // 처음 불러오는 채팅(지난 대화)은 말풍선 없이 기록에만 보여 준다
    let loaded = false;
    const chatQuery = query(this.chatRef, limitToLast(CHAT_KEEP));
    this.unsubs.push(onChildAdded(chatQuery, (s) => this.h.onChat({ id: s.key, ...s.val() }, loaded)));
    get(chatQuery).then(() => (loaded = true));
  }

  // 같은 계정이 다른 탭에서 접속하면 presence의 tabId가 바뀐다 → 이 탭은 물러난다
  watchOtherTabs() {
    if (this.tabWatch) return;
    this.tabWatch = onValue(ref(this.db, `presence/${this.uid}/tabId`), async (snap) => {
      const tabId = snap.val();
      if (!tabId || tabId === this.tabId || this.kicked) return;
      this.kicked = true;
      clearTimeout(this.timer);
      // 연결을 끊기 전에 '끊기면 삭제' 예약을 취소한다. (안 그러면 새 탭의 데이터가 지워진다)
      await onDisconnect(this.presenceRef).cancel();
      await onDisconnect(this.playerRef).cancel();
      this.stop();
      goOffline(this.db);
      this.h.onKicked();
    });
    this.unsubs.push(this.tabWatch);
  }

  // 바뀐 값만 모아서 보낸다 (최대 초당 5회)
  send(changes) {
    if (this.kicked) return;
    Object.assign(this.state, changes);
    this.pending = { ...this.pending, ...changes };
    const wait = this.lastSentAt + SEND_INTERVAL_MS - Date.now();
    if (wait <= 0) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), wait);
  }

  flush() {
    this.timer = null;
    if (!this.pending || this.kicked) return;
    update(this.playerRef, this.pending);
    this.pending = null;
    this.lastSentAt = Date.now();
  }

  async sendChat(name, text) {
    await push(this.chatRef, { uid: this.uid, name, text, at: serverTimestamp() });
    // 30개를 넘은 오래된 메시지를 지운다
    const snap = await get(this.chatRef);
    const keys = Object.keys(snap.val() || {}).sort();
    const extra = keys.slice(0, Math.max(0, keys.length - CHAT_KEEP));
    await Promise.all(extra.map((k) => remove(ref(this.db, `lobby/chat/${k}`))));
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
