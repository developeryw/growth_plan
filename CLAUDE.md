# Growth Plan — 온라인 보드게임 카페

교육 프로그램 보드게임 동아리를 위한 2D 메타버스 모임 공간.
**절대 조건: 배포·운영에 금전 비용 0원.** 유료 플랜, 결제 수단 등록이 필요한 서비스는 사용하지 않는다.

## 작업 방식 (Claude에게)
- 사용자는 코딩 초보다. 각 단계 시작 전에 무엇을 만들지 짧게 설명하고, 끝나면 브라우저에서 확인할 방법을 알려준다.
- 한 번에 한 단계(아래 로드맵)만 진행한다. 단계가 끝나면 커밋하고 배포 가능한 상태로 둔다.
- 설명과 커밋 메시지는 한국어로 쓴다.
- 비밀 값(입장 코드, 관리자 uid)은 절대 코드나 저장소에 넣지 않는다.

## 기술 스택
| 역할 | 도구 |
|---|---|
| 빌드 | Vite + JavaScript (TypeScript 아님, 초보 친화) |
| 게임 엔진 | Phaser 3 (2D 탑다운) |
| 맵 | Tiled 에디터 → JSON export (`public/assets/maps/`) |
| 실시간 DB | Firebase Realtime Database, **Spark(무료) 플랜** |
| 사용자 식별 | Firebase **익명 로그인** |
| 배포 | GitHub Pages (GitHub Actions로 자동 배포) |
| 에셋 | Kenney(CC0), itch.io 무료 팩, LPC 생성기 — 출처를 `CREDITS.md`에 기록 |

Firebase 설정값(apiKey 등)은 공개돼도 되는 값이므로 `.env`가 아닌 `src/firebase-config.js`에 둬도 된다. 보안은 전적으로 **Database 보안 규칙**(`database.rules.json`)으로 지킨다.

## 확정된 설계 결정 (변경 금지)
1. **사용자 식별 = Firebase 익명 로그인.** IP 기반 식별은 쓰지 않는다(같은 와이파이 사용자 충돌, 브라우저에서 IP 조회 불가). uid는 브라우저에 유지되므로 가입 없이 재접속 시 같은 사용자로 인식된다.
2. **그래픽 = 2D 탑다운 픽셀.** 3D 미사용. 콜라·팝콘도 2D 스프라이트.
3. **입장 코드는 DB의 읽기 불가 경로 `config/entryCode`에 보관**하고, 보안 규칙이 `members/{uid}`에 쓴 값과 비교해 검증한다. 클라이언트 코드·저장소에 코드 값이 존재하면 안 된다. 코드를 바꾸면 기존 회원은 자동으로 재입력 필요.
4. **팀원 게임 탭 열기 = 클릭 1회 방식.** 방장은 클릭으로 바로 `window.open`. 팀원에게는 "방장이 ○○를 선택했어요 [게임 열기]" 모달을 띄운다(팝업 차단 회피). 설정에서 "자동 열기" 옵션을 켜면 바로 `window.open` 시도하고, 차단되면 모달로 대체.

## 무료 한도 지키기 (성능 규칙)
- Spark 한도: 동시 접속 100, 저장 1GB, 다운로드 하루 약 360MB. 초과 시 과금이 아니라 서비스 중지.
- **위치를 매 프레임 전송 금지.** 이동 시작/방향 전환/정지 시에만 `{x, y, dir, moving}` 전송, 다른 클라이언트는 보간·예측으로 그린다. 전송 최대 5회/초 throttle.
- **영역별 구독:** 로비 사용자는 `lobby/*`만, 방 사용자는 `rooms/{n}/*`만 구독.
- 채팅은 영역별 최근 30개만 유지.
- 게시판은 **클릭해서 열 때만** 로드. 이미지는 브라우저에서 가로 800px WebP(≤100KB)로 압축 후 base64로 DB 저장 (Firebase Storage 사용 금지 — 결제 수단 필요).
- 한 사용자가 탭을 여러 개 열면 가장 최근 탭만 남기고 나머지는 "다른 탭에서 접속 중" 안내 후 연결 해제.

## 기능 명세

### 접속·아바타
- 첫 화면: 입장 코드 입력 → 아바타 설정창.
- 아바타: 남/여 각 단일 헤어. 의상은 점프수트 죄수복으로 통일, **색상만 변경**(흰색 스프라이트 + `setTint()`).
- 이름: 직접 입력 또는 랜덤 뽑기(형용사+동물 조합).
- 시작 위치: 카페 입구.

### 공통 액션
- 이동(방향키/WASD), 앉기/서기, 말풍선 채팅(3~5초 표시), 단체 게임방 입장/퇴장.
- 리액션(단축키 1~9): 두 손 들기(파이팅), 한 손 들기(할 말 있음), 방방 뛰기(승리), 고개 숙이기(패배), 박수, 턱 괴기(고민), 하트, 손 모으기(한 판 더), 졸기(AFK — 5분 무입력 시 자동).

### 로비/거실
- 고풍스러운 분위기: 목조 벽, 유럽식 조명.
- 좌석 12개(빈백, 안마의자, 3인 소파, 행잉 체어)를 가운데를 마주보도록 배치.
- 앉으면 **1인 게임 선택 팝업** → 선택 시 새 탭 열림 + 머리 위에 "🎲 ○○ 하는 중" 말풍선 상시 표시. `서기`/`나가기`로 일어남.

### 게시판 (로비)
- 상단 중앙 "게시판" 제목 클릭 → 게시 폼: 캡처 1장, 닉네임(자동), 플레이 날짜, 비밀번호 4자리.
- 종이를 압정으로 꽂은 모양. 최대 10개, 11번째 등록 시 가장 오래된 글 자동 삭제.
- 압정 클릭 → 비밀번호 입력 → "정말로 삭제하시겠습니까?" → 삭제.
- 비밀번호는 `board/postSecrets/{id}`(읽기 불가)에 저장, 삭제 권한은 보안 규칙에서 비교. 클라이언트 비교 금지.

### 단체 게임방 (4개, 각 최대 6명)
- 커튼/벽으로 구분. 문에 들어가면 페이드 전환으로 별도 Scene(방 + 출입구만, 동물의 숲 방식).
- 테이블 1개 + 의자/소파 6석, 테이블 위 키오스크.
- **방장 = 최초 입장자** (트랜잭션). 방장이 창을 닫으면(onDisconnect) 가장 먼저 입장한 사람이 자동 승계.
- 방장이 `방문` 클릭 → 잠금/해제. 잠기면 입장 불가. 입장은 트랜잭션으로 "6명 미만 & 잠금 아님" 검사.
- 키오스크 클릭 → 단체 게임 메뉴판 팝업. 모든 방 같은 목록.
- **투표:** 각자 게임에 투표, 실시간 집계 표시. 최종 선택은 방장.
- 방장 `플레이` → `rooms/{n}/game` 기록 → 방장 탭 열림, 팀원 모달(설계 결정 4). 테이블에 콜라·팝콘 스프라이트 표시.
- **초대 링크 공유 칸**(게임 `join` 유형별, 아래 참고).
- 방 안 말풍선 채팅.
- `해산`(방장 전용): `state = "disbanded"` → 전원 로비로 이동.
- `나가기`: 로비로 이동. 방장은 나갈 때 **방장 위임** 대상 선택.
- 게임 인원 조절은 방장 몫, 사이트에서 관리하지 않음.

### 외부 게임 연동 (`src/data/games.json`)
외부 사이트는 조작·읽기 불가(동일 출처 정책)이므로 `join` 유형으로 처리한다.
| join | 의미 | 처리 |
|---|---|---|
| `url-template` | 주소에 임의 방 이름을 넣으면 방이 생김 | `template`의 `{roomId}`를 `gp-{방번호}-{시각}`으로 치환해 전원에게 열기 (완전 자동) |
| `invite-link` | 방 생성 후 초대 링크 제공 | 방장이 링크 붙여넣기 → 팀원 [참가하기] |
| `code` | 코드만 제공 | 방장이 코드 입력 → 팀원 화면에 크게 표시 + 복사 버튼 + `joinUrl` 열기 |
| `qr` | QR만 제공 | 방장이 캡처 후 Ctrl+V → jsQR로 해독 → `invite-link`처럼 처리 |
| `none` | 1인용 | 로비 좌석 목록에만 노출 |

```json
{ "id": "quoridor", "name": "쿼리도", "url": "https://quoridorgame.com/ko/",
  "mode": "group", "join": "invite-link", "players": "2-4" }
```
`mode`: `solo` | `group` | `both`. 후보 사이트(유형은 사용자가 점검 후 기입):
boardgames.zone/ko, yesnodetective.com/ko, ko.puzzle-loop.com, semantle-ko.newsjel.ly,
newmantle.kr, quoridorgame.com/ko/wall-go/, murdoku.com/ko, devil.haplate.com, quoridorgame.com/ko

### 관리자·건의
- `admins/{uid}: true`는 Firebase 콘솔에서 수동 지정.
- `/admin` 화면: 접속자 수, 방 상태, 닉네임 강제 변경, 게시물 삭제.
- 로비 우체통(건의함) → `feedback/{id}` (관리자만 읽기).

## DB 구조
```
config/entryCode            읽기·쓰기 불가 (콘솔에서만 수정)
admins/{uid}
members/{uid}               사용자가 입력한 입장 코드
users/{uid}                 { name, gender, color }
presence/{uid}              { area: "lobby" | "room1"..., tabId, at }
lobby/players/{uid}         { x, y, dir, moving, seat, bubble, reaction }
lobby/chat/{id}
rooms/{1-4}/                { host, locked, state, game, invite,
                              players/{uid}, votes/{uid}, chat/{id} }
board/posts/{id}            { image, name, date, createdAt }
board/postSecrets/{id}      읽기 불가
board/deleteTickets/{id}/{uid}
feedback/{id}
```
모든 경로(config 제외)는 "회원 인증됨" = `root.child('members/'+auth.uid).val() === root.child('config/entryCode').val()` 일 때만 읽기/쓰기.

## 로드맵 (단계별 배포)
0. 프로젝트 생성(Vite + Phaser), GitHub 저장소, GitHub Pages 자동 배포 설정
1. 혼자 걷는 로비: Tiled 맵, 충돌, 입구 스폰, 앉기/서기 → **첫 배포**
2. 멀티플레이: 익명 로그인, presence, 이동 동기화, 말풍선 채팅, 리액션
3. 입장 코드 + 보안 규칙 + 아바타 설정창
4. 로비 1인 게임 좌석 + 게임 말풍선
5. 단체 게임방 전체 기능
6. 게시판
7. 관리자 화면 + 건의함
8. 봇 30명 부하 테스트 스크립트(`scripts/bots.js`), 다운로드 사용량 측정

## 명령어
- `npm run dev` — 로컬 실행 (http://localhost:5173)
- `npm run build` — 배포용 빌드
- `npm run art` — 타일셋·캐릭터 PNG 다시 생성 (맵 `lobby.json`은 없을 때만 생성, 초기화는 `npm run art -- --force-map`)
- `npm run emulators` — 내 컴퓨터용 Firebase 에뮬레이터 실행(Java 필요). 켠 뒤 http://localhost:5173/?emu 로 접속하면 실제 Firebase 대신 에뮬레이터 사용
- 배포: `main` 브랜치에 push하면 GitHub Actions가 자동 배포
