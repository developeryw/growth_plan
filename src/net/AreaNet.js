// 한 영역(로비 또는 방 하나)의 실시간 동기화: 내 위치 전송, 다른 사람 구독, 채팅
// 무료 한도를 지키기 위해 지금 있는 영역만 구독하고, 위치는 바뀔 때만 최대 초당 5회 보낸다.
import {
  ref,
  set,
  update,
  get,
  push,
  remove,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  serverTimestamp,
  query,
  limitToLast,
} from 'firebase/database';

const SEND_INTERVAL_MS = 200; // 초당 최대 5회
const CHAT_KEEP = 30; // 채팅은 영역별 최근 30개만 유지

export default class AreaNet {
  // base: 'lobby' 또는 'rooms/1' 같은 영역 경로
  // handlers: { onJoin(uid, state), onUpdate(uid, state), onLeave(uid), onLoaded(), onChat(msg, isNew) }
  constructor(session, base, handlers) {
    this.session = session;
    this.db = session.db;
    this.uid = session.uid;
    this.base = base;
    this.h = handlers;
    this.playerPath = `${base}/players/${this.uid}`;
    this.playerRef = ref(this.db, this.playerPath);
    this.chatPath = `${base}/chat`;
    this.state = null; // 마지막으로 알려진 내 상태
    this.pending = null; // 아직 보내지 않은 변경
    this.lastSentAt = 0;
    this.timer = null;
    this.unsubs = [];
    this.stopped = false;
  }

  get active() {
    return !this.stopped && !this.session.kicked;
  }

  async start(initialState) {
    this.state = { ...initialState };
    await this.session.removeOnDisconnect(this.playerPath);
    set(this.playerRef, this.state);
    this.unsubs.push(this.session.onReconnect(() => this.active && set(this.playerRef, this.state)));

    const playersRef = ref(this.db, `${this.base}/players`);
    this.unsubs.push(
      onChildAdded(playersRef, (s) => s.key !== this.uid && this.h.onJoin(s.key, s.val())),
      onChildChanged(playersRef, (s) => s.key !== this.uid && this.h.onUpdate(s.key, s.val())),
      onChildRemoved(playersRef, (s) => s.key !== this.uid && this.h.onLeave(s.key)),
    );
    get(playersRef).then(() => this.active && this.h.onLoaded?.());

    // 처음 불러오는 채팅(지난 대화)은 말풍선 없이 기록에만 보여 준다
    let loaded = false;
    const chatQuery = query(ref(this.db, this.chatPath), limitToLast(CHAT_KEEP));
    this.unsubs.push(onChildAdded(chatQuery, (s) => this.h.onChat({ id: s.key, ...s.val() }, loaded)));
    get(chatQuery).then(() => (loaded = true));
  }

  // 바뀐 값만 모아서 보낸다 (최대 초당 5회)
  send(changes) {
    if (!this.active) return;
    Object.assign(this.state, changes);
    this.pending = { ...this.pending, ...changes };
    const wait = this.lastSentAt + SEND_INTERVAL_MS - Date.now();
    if (wait <= 0) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), wait);
  }

  flush() {
    this.timer = null;
    if (!this.pending || !this.active) return;
    update(this.playerRef, this.pending);
    this.pending = null;
    this.lastSentAt = Date.now();
  }

  async sendChat(name, text) {
    if (!this.active) return;
    const chatRef = ref(this.db, this.chatPath);
    await push(chatRef, { uid: this.uid, name, text, at: serverTimestamp() });
    // 30개를 넘은 오래된 메시지를 지운다
    const snap = await get(chatRef);
    const keys = Object.keys(snap.val() || {}).sort();
    const extra = keys.slice(0, Math.max(0, keys.length - CHAT_KEEP));
    await Promise.all(extra.map((k) => remove(ref(this.db, `${this.chatPath}/${k}`))));
  }

  // 이 영역에서 나간다: 구독을 끊고 내 캐릭터를 지운다
  async leave() {
    this.stop();
    await this.session.cancelOnDisconnect(this.playerPath);
    if (!this.session.kicked) await remove(this.playerRef);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
