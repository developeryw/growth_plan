// 리액션 (단축키 1~9)
export const REACTIONS = [
  { key: '1', type: 'fighting', emoji: '🙌', label: '파이팅' },
  { key: '2', type: 'hand', emoji: '✋', label: '할 말 있음' },
  { key: '3', type: 'win', emoji: '🎉', label: '승리' },
  { key: '4', type: 'lose', emoji: '😞', label: '패배' },
  { key: '5', type: 'clap', emoji: '👏', label: '박수' },
  { key: '6', type: 'think', emoji: '🤔', label: '고민' },
  { key: '7', type: 'heart', emoji: '❤️', label: '하트' },
  { key: '8', type: 'again', emoji: '🙏', label: '한 판 더' },
  { key: '9', type: 'sleep', emoji: '💤', label: '졸기' },
];
export const REACTION_BY_TYPE = Object.fromEntries(REACTIONS.map((r) => [r.type, r]));
export const REACTION_MS = 3000; // 졸기를 제외한 리액션 표시 시간
export const AFK_MS = 5 * 60 * 1000; // 5분 동안 입력이 없으면 자동으로 졸기
