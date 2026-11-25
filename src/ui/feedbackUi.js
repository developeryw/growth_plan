// 로비 건의함: 건의 내용을 적어 feedback/{id} 에 보낸다 (관리자만 읽을 수 있음)
import { ref, push, serverTimestamp } from 'firebase/database';

const $ = (id) => document.getElementById(id);
export const FEEDBACK_MAX = 500;

// 건의함 창을 열고, 닫히면 끝나는 Promise. 보냈으면 true
export function openFeedback({ db, uid, name }) {
  const modal = $('feedback');
  const text = $('feedback-text');
  text.value = '';
  text.maxLength = FEEDBACK_MAX;
  $('feedback-msg').textContent = '';
  $('feedback-count').textContent = `0/${FEEDBACK_MAX}`;
  modal.hidden = false;
  // E 키로 열었을 때 그 'e'가 입력칸에 찍히지 않도록, 키 입력이 끝난 뒤에 커서를 옮긴다
  setTimeout(() => text.focus(), 0);

  return new Promise((resolve) => {
    const finish = (sent) => {
      modal.hidden = true;
      modal.onkeydown = null;
      $('feedback-form').onsubmit = null;
      resolve(sent);
    };
    text.oninput = () => ($('feedback-count').textContent = `${text.value.length}/${FEEDBACK_MAX}`);
    $('feedback-cancel').onclick = () => finish(false);
    // 주의: on○○ 처리 함수가 false를 돌려주면 브라우저가 기본 동작(폼 보내기)을 취소한다 → 중괄호로 감싼다
    modal.onclick = (e) => {
      if (e.target === modal) finish(false);
    };
    modal.onkeydown = (e) => {
      e.stopPropagation(); // 입력한 키가 게임으로 넘어가지 않게
      if (e.key === 'Escape') finish(false);
    };
    $('feedback-form').onsubmit = async (e) => {
      e.preventDefault();
      const body = text.value.trim();
      if (!body) return ($('feedback-msg').textContent = '내용을 적어 주세요.');
      $('feedback-send').disabled = true;
      try {
        await push(ref(db, 'feedback'), { uid, name, text: body.slice(0, FEEDBACK_MAX), at: serverTimestamp() });
        finish(true);
      } catch (err) {
        console.error(err);
        $('feedback-msg').textContent = '보내지 못했어요. 잠시 후 다시 시도해 주세요.';
      } finally {
        $('feedback-send').disabled = false;
      }
    };
  });
}
