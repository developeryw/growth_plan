// 리액션 (단축키 1~9). 그림은 도트 아이콘 ico-{type} (src/ui/icons.js)
export const REACTIONS = [
  { key: '1', type: 'fighting', label: '파이팅' },
  { key: '2', type: 'hand', label: '할 말 있음' },
  { key: '3', type: 'win', label: '승리' },
  { key: '4', type: 'lose', label: '패배' },
  { key: '5', type: 'clap', label: '박수' },
  { key: '6', type: 'think', label: '고민' },
  { key: '7', type: 'heart', label: '하트' },
  { key: '8', type: 'again', label: '한 판 더' },
  { key: '9', type: 'sleep', label: '졸기' },
];
export const REACTION_BY_TYPE = Object.fromEntries(REACTIONS.map((r) => [r.type, r]));
export const REACTION_MS = 3000; // 졸기를 제외한 리액션 표시 시간
export const AFK_MS = 5 * 60 * 1000; // 5분 동안 입력이 없으면 자동으로 졸기
