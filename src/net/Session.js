// 접속 한 번 동안 계속 유지되는 정보: 접속 상태(presence), 다른 탭 감지, '끊기면 삭제' 예약 관리
// 로비 ↔ 방을 오가도 이 객체는 그대로다.
import { ref, set, update, remove, onValue, onDisconnect, serverTimestamp, goOffline } from 'firebase/database';

export default class Session {
  constructor(db, uid) {
    this.db = db;
    this.uid = uid;
    this.tabId = Math.random().toString(36).slice(2, 10);
    this.area = 'lobby';
    this.kicked = false;
    this.presenceRef = ref(db, `presence/${uid}`);
    this.disconnectRefs = new Map(); // 창을 닫으면 자동으로 지울 경로들
    this.reconnectHandlers = new Set();
    this.kickHandlers = new Set();
  }

  start() {
    this.disconnectRefs.set(`presence/${this.uid}`, this.presenceRef);
    // 연결될 때마다(재연결 포함) '끊기면 삭제' 예약을 다시 걸고 접속 정보를 쓴다
    onValue(ref(this.db, '.info/connected'), async (snap) => {
      if (!snap.val() || this.kicked) return;
      await Promise.all([...this.disconnectRefs.values()].map((r) => onDisconnect(r).remove()));
      await set(this.presenceRef, { area: this.area, tabId: this.tabId, at: serverTimestamp() });
      this.watchOtherTabs();
      this.reconnectHandlers.forEach((fn) => fn());
    });
  }

  // 창을 닫거나 연결이 끊기면 이 경로를 지우도록 예약한다
  async removeOnDisconnect(path) {
    const r = ref(this.db, path);
    this.disconnectRefs.set(path, r);
    if (!this.kicked) await onDisconnect(r).remove();
  }

  async cancelOnDisconnect(path) {
    const r = this.disconnectRefs.get(path);
    if (!r) return;
    this.disconnectRefs.delete(path);
    if (!this.kicked) await onDisconnect(r).cancel();
  }

  // 지금 있는 곳: 'lobby' | 'room1' ~ 'room4'
  setArea(area) {
    this.area = area;
    if (!this.kicked) update(this.presenceRef, { area });
  }

  onReconnect(fn) {
    this.reconnectHandlers.add(fn);
    return () => this.reconnectHandlers.delete(fn);
  }

  // 내 프로필(users/{uid})이 바뀌면 알려 준다 (예: 관리자가 닉네임을 바꿈)
  onProfileChange(fn) {
    return onValue(ref(this.db, `users/${this.uid}`), (snap) => snap.exists() && fn(snap.val()));
  }

  onKicked(fn) {
    this.kickHandlers.add(fn);
    return () => this.kickHandlers.delete(fn);
  }

  // 같은 계정이 다른 탭에서 접속하면 presence의 tabId가 바뀐다 → 이 탭은 물러난다
  watchOtherTabs() {
    if (this.tabWatch) return;
    this.tabWatch = onValue(ref(this.db, `presence/${this.uid}/tabId`), async (snap) => {
      const tabId = snap.val();
      if (!tabId || tabId === this.tabId || this.kicked) return;
      this.kicked = true;
      // 새 탭은 로비에서 시작하므로 presence와 로비 캐릭터는 새 탭과 같은 자리다 → 지우지 않고 예약만 취소.
      // 그 밖의 자리(예: 게임방 안의 내 캐릭터)는 이 탭만 쓰던 것이므로 지금 지운다. (안 지우면 방에 유령이 남는다)
      const shared = new Set([`presence/${this.uid}`, `lobby/players/${this.uid}`]);
      await Promise.all(
        [...this.disconnectRefs.entries()].map(([path, r]) =>
          shared.has(path) ? onDisconnect(r).cancel() : Promise.all([onDisconnect(r).cancel(), remove(r)]),
        ),
      );
      goOffline(this.db);
      this.kickHandlers.forEach((fn) => fn());
    });
  }
}
