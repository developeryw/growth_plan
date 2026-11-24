// 로비 타일셋·캐릭터 스프라이트(PNG)와 초기 로비 맵(Tiled JSON)을 만드는 스크립트.
// 실행: npm run art
//   - 그림(PNG)은 매번 새로 만든다.
//   - 맵(lobby.json)은 파일이 없을 때만 만든다. (Tiled에서 고친 맵을 덮어쓰지 않도록)
//     처음 상태로 되돌리려면: npm run art -- --force-map
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = (p) => path.join(ROOT, 'public/assets', p);

// ───────────── 작은 그림판 ─────────────
function hex(c) {
  c = c.replace('#', '');
  const n = parseInt(c.slice(0, 6), 16);
  const a = c.length > 6 ? parseInt(c.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

class Img {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  px(x, y, c) {
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b, a] = hex(c);
    if (a === 255) {
      this.d.set([r, g, b, 255], i);
      return;
    }
    const t = a / 255;
    const da = this.d[i + 3] / 255;
    const oa = t + da * (1 - t);
    for (const [k, v] of [[0, r], [1, g], [2, b]]) {
      this.d[i + k] = Math.round((v * t + this.d[i + k] * da * (1 - t)) / oa);
    }
    this.d[i + 3] = Math.round(oa * 255);
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const s = (y * src.w + x) * 4;
        const t = ((oy + y) * this.w + ox + x) * 4;
        this.d.set(src.d.subarray(s, s + 4), t);
      }
  }
}

function mirror(img) {
  const out = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * 4;
      const t = (y * img.w + (img.w - 1 - x)) * 4;
      out.d.set(img.d.subarray(s, s + 4), t);
    }
  return out;
}

// 시계 방향 90도 회전 (정사각형 타일 전용)
function rotateCW(img) {
  const n = img.w;
  const out = new Img(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const s = (y * n + x) * 4;
      const t = (x * n + (n - 1 - y)) * 4;
      out.d.set(img.d.subarray(s, s + 4), t);
    }
  return out;
}

// ───────────── PNG 저장 ─────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function savePNG(img, file) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    raw.set(img.d.subarray(y * img.w * 4, (y + 1) * img.w * 4), y * (img.w * 4 + 1) + 1);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log('저장:', path.relative(ROOT, file));
}

// ───────────── 타일 (16×16) ─────────────
const T = 16;
const SHADOW = '#00000040';

function floor(seed) {
  const im = new Img(T, T);
  im.rect(0, 0, T, T, '#8b5a2b');
  for (let band = 0; band < 4; band++) {
    const y0 = band * 4;
    im.rect(0, y0 + 3, T, 1, '#6b4423');
    const seam = [3, 11, 7, 14][(band + seed) % 4];
    im.rect(seam, y0, 1, 3, '#6b4423');
    im.px((seam + 5) % T, y0 + 1, '#a06b38');
    im.px((seam + 9) % T, y0 + 2, '#a06b38');
  }
  return im;
}

function wallFace() {
  const im = new Img(T, T);
  im.rect(0, 0, T, T, '#5c3b23');
  for (const x of [0, 8]) {
    im.rect(x, 3, 1, 10, '#3f2817');
    im.rect(x + 1, 3, 1, 10, '#6e4a2d');
  }
  im.rect(0, 0, T, 2, '#8a5d36');
  im.rect(0, 2, T, 1, '#3f2817');
  im.rect(0, 12, T, 1, '#2a1a0e');
  im.rect(0, 13, T, 3, '#3a2414');
  return im;
}

function wallTop() {
  const im = new Img(T, T);
  im.rect(0, 0, T, T, '#3a2717');
  im.rect(0, 0, T, 1, '#4a3322');
  im.rect(0, 15, T, 1, '#24170d');
  return im;
}

function lamp() {
  const im = wallFace();
  // 은은한 불빛
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 6);
      if (d < 7) im.px(x, y, d < 4 ? '#fff2b366' : '#fff2b333');
    }
  // 유럽식 2구 벽등
  im.rect(7, 8, 2, 4, '#c9a040');
  im.rect(4, 8, 8, 1, '#c9a040');
  im.rect(4, 7, 1, 1, '#c9a040');
  im.rect(11, 7, 1, 1, '#c9a040');
  for (const x of [3, 10]) {
    im.rect(x, 3, 3, 4, '#f7d98b');
    im.rect(x, 3, 3, 1, '#c9a040');
    im.px(x + 1, 5, '#fffbe6');
  }
  return im;
}

function bookshelf() {
  const im = new Img(T, T);
  im.rect(0, 0, T, T, '#3f2817');
  im.rect(1, 1, 14, 14, '#2a1a0e');
  const colors = ['#8c2f39', '#2f5d8c', '#c9a227', '#3f7a3a', '#6e3f8c', '#b0643a'];
  let k = 0;
  for (const y0 of [1, 6, 11]) {
    for (let x = 1; x < 15; x += 2) {
      const h = 3 + ((x + y0) % 2);
      im.rect(x, y0 + (4 - h), 2, h, colors[k++ % colors.length]);
    }
    im.rect(0, y0 + 4, T, 1, '#5c3b23');
  }
  return im;
}

function door(right) {
  const im = new Img(T, T);
  im.rect(0, 0, T, T, '#1f140c');
  im.rect(0, 0, T, 4, '#2e2014');
  im.rect(0, 0, 3, T, '#8a5d36');
  im.rect(1, 0, 1, T, '#a87445');
  return right ? mirror(im) : im;
}

function doormat() {
  const im = new Img(T, T);
  im.rect(0, 2, T, 12, '#4a3f28');
  im.rect(1, 3, 14, 10, '#7a6a48');
  for (let y = 4; y < 13; y += 2) im.rect(1, y, 14, 1, '#665838');
  return im;
}

function rug(top, bottom, left, right) {
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let c = '#7a1f2b';
      if ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) c = '#94303d';
      if (x % 8 === 4 && y % 8 === 4) c = '#d4ad3a';
      const m = Math.min(top ? y : 99, bottom ? 15 - y : 99, left ? x : 99, right ? 15 - x : 99);
      if (m === 0 || m === 2) c = '#4d1219';
      if (m === 1) c = '#d4ad3a';
      im.px(x, y, c);
    }
  return im;
}

// 3인 소파 (가운데를 보도록 아래를 향함). part: 0=왼쪽, 1=가운데, 2=오른쪽
function sofa(part) {
  const im = new Img(T, T);
  im.rect(0, 13, T, 2, SHADOW);
  im.rect(0, 1, T, 5, '#2f5d50');
  im.rect(0, 1, T, 1, '#3f7a69');
  im.rect(0, 6, T, 7, '#4a8a77');
  im.rect(0, 12, T, 1, '#2f5d50');
  if (part > 0) im.rect(0, 6, 1, 6, '#244a40');
  if (part === 0) {
    im.rect(0, 2, 3, 11, '#2f5d50');
    im.rect(0, 2, 3, 1, '#3f7a69');
    im.rect(0, 1, 1, 12, '#1a332c');
  }
  if (part === 2) {
    im.rect(13, 2, 3, 11, '#2f5d50');
    im.rect(13, 2, 3, 1, '#3f7a69');
    im.rect(15, 1, 1, 12, '#1a332c');
  }
  return im;
}

function beanbag() {
  const im = new Img(T, T);
  im.ellipse(8, 13, 7, 2.5, SHADOW);
  im.ellipse(8, 9, 7, 6, '#8a3b1b');
  im.ellipse(8, 9, 6.2, 5.2, '#c0582c');
  im.ellipse(7, 7, 3.5, 2.5, '#d9733f');
  im.ellipse(8, 10, 3, 2, '#a84a22');
  return im;
}

// 안마의자. 기본 그림은 아래(down)를 바라봄 → 회전으로 다른 방향 생성
function massageChair(facing) {
  let im = new Img(T, T);
  im.ellipse(8, 9, 7, 7, SHADOW);
  im.rect(3, 1, 10, 6, '#2d2d35');
  im.rect(4, 2, 8, 1, '#45454f');
  im.rect(4, 4, 8, 1, '#45454f');
  im.rect(4, 6, 8, 6, '#3a3a44');
  im.rect(5, 7, 6, 4, '#45454f');
  im.rect(2, 4, 2, 9, '#25252c');
  im.rect(12, 4, 2, 9, '#25252c');
  im.px(12, 6, '#5fb0d0');
  im.rect(5, 12, 6, 3, '#2d2d35');
  im.rect(5, 14, 6, 1, '#1c1c22');
  const turns = { down: 0, left: 1, up: 2, right: 3 }[facing];
  for (let i = 0; i < turns; i++) im = rotateCW(im);
  return im;
}

function hangingChair() {
  const im = new Img(T, T);
  im.ellipse(8, 14, 7, 2, SHADOW);
  im.rect(2, 15, 13, 1, '#7a7a7a');
  im.rect(14, 1, 1, 15, '#8c8c8c');
  im.rect(8, 1, 7, 1, '#8c8c8c');
  im.rect(8, 1, 1, 3, '#8c8c8c');
  im.ellipse(7.5, 9, 5.8, 5.5, '#a88a4f');
  im.ellipse(7.5, 9, 5, 4.8, '#c8a96a');
  for (let y = 4; y < 15; y++)
    for (let x = 2; x < 14; x++) if ((x + y) % 3 === 0 && im.alpha(x, y) === 255) {
      const dx = (x + 0.5 - 7.5) / 5, dy = (y + 0.5 - 9) / 4.8;
      if (dx * dx + dy * dy <= 1) im.px(x, y, '#b09358');
    }
  im.ellipse(7.5, 10, 3.5, 3, '#efe6d2');
  im.ellipse(7, 9.5, 1.5, 1, '#ffffff');
  return im;
}

function plant() {
  const im = new Img(T, T);
  im.ellipse(8, 15, 5, 1.5, SHADOW);
  im.rect(5, 10, 6, 5, '#9a5b3a');
  im.rect(4, 10, 8, 1, '#b06d47');
  im.rect(10, 11, 1, 4, '#7a4429');
  im.ellipse(8, 6, 5, 4.5, '#2f6a2c');
  im.ellipse(6, 5, 3, 3, '#3f7a3a');
  im.ellipse(10, 7, 3, 2.5, '#3f7a3a');
  im.ellipse(8, 3, 2.5, 2, '#5a9a4a');
  im.px(5, 4, '#7fbf6a');
  im.px(9, 2, '#7fbf6a');
  return im;
}

function table() {
  const im = new Img(T, T);
  im.ellipse(8, 10, 7, 5, SHADOW);
  im.ellipse(8, 8, 7, 6.5, '#4a2e16');
  im.ellipse(8, 8, 6.3, 5.8, '#6e4522');
  im.ellipse(6.5, 6.5, 3, 2.5, '#8b5a2b');
  // 테이블 위 보드게임 상자와 주사위
  im.rect(4, 5, 6, 5, '#b03a3a');
  im.rect(5, 6, 4, 3, '#e2d6b5');
  im.rect(11, 9, 2, 2, '#ffffff');
  im.px(11, 9, '#333333');
  return im;
}

// 벽에 난 커튼 문 (단체 게임방 입구). right=true면 오른쪽 벽용
function curtain(right) {
  const im = new Img(T, T);
  im.rect(0, 0, T, T, '#3a2717');
  im.rect(2, 0, 12, T, '#1f140c');
  for (let x = 3; x < 13; x++) im.rect(x, 0, 1, T, x % 3 === 0 ? '#6e1824' : x % 3 === 1 ? '#a83040' : '#8c2030');
  im.rect(3, 7, 10, 2, '#d4ad3a');
  im.px(7, 9, '#d4ad3a');
  im.px(8, 9, '#d4ad3a');
  im.rect(1, 0, 1, T, '#8a5d36');
  im.rect(14, 0, 1, T, '#8a5d36');
  return right ? mirror(im) : im;
}

// 나무 의자. 기본 그림은 아래(down)를 바라봄
function chair(facing) {
  let im = new Img(T, T);
  im.ellipse(8, 9, 6.5, 6.5, SHADOW);
  im.rect(3, 1, 10, 3, '#4a2e16');
  im.rect(4, 1, 8, 1, '#8b5a2b');
  im.rect(3, 4, 10, 9, '#6e4522');
  im.rect(4, 5, 8, 7, '#7a1f2b');
  im.rect(5, 6, 3, 2, '#94303d');
  im.rect(3, 12, 2, 2, '#4a2e16');
  im.rect(11, 12, 2, 2, '#4a2e16');
  const turns = { down: 0, left: 1, up: 2, right: 3 }[facing];
  for (let i = 0; i < turns; i++) im = rotateCW(im);
  return im;
}

// 큰 보드게임 테이블 (가장자리는 나무, 가운데는 초록 펠트)
function bigTable(top, bottom, left, right) {
  const im = new Img(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const m = Math.min(top ? y : 99, bottom ? 15 - y : 99, left ? x : 99, right ? 15 - x : 99);
      let c = '#2f6a4f';
      if ((x * 7 + y * 3) % 11 === 0) c = '#356f54';
      if (m === 0) c = '#3a2414';
      else if (m === 1) c = '#8b5a2b';
      else if (m <= 3) c = '#6e4522';
      else if (m === 4) c = '#24503b';
      im.px(x, y, c);
    }
  if (bottom) im.rect(0, 15, T, 1, '#2a1a0e');
  return im;
}

function kiosk() {
  const im = new Img(T, T);
  im.ellipse(8, 14, 4, 1.5, SHADOW);
  im.rect(5, 13, 6, 2, '#555a66');
  im.rect(7, 10, 2, 3, '#777c88');
  im.rect(2, 1, 12, 10, '#2b2b33');
  im.rect(3, 2, 10, 8, '#5fb0d0');
  im.rect(4, 3, 8, 1, '#e8f6ff');
  for (const y of [5, 7]) {
    im.rect(4, y, 3, 1, '#d4ad3a');
    im.rect(8, y, 4, 1, '#bfe6f5');
  }
  im.px(7, 11, '#ff6b6b');
  return im;
}

function cola() {
  const im = new Img(T, T);
  im.ellipse(8, 14, 4, 1.5, SHADOW);
  im.rect(9, 0, 1, 5, '#ffffff');
  im.rect(10, 0, 1, 5, '#e05050');
  im.rect(5, 4, 6, 1, '#eeeeee');
  im.rect(5, 5, 6, 9, '#d03030');
  im.rect(6, 5, 1, 9, '#e85a5a');
  im.rect(5, 9, 6, 2, '#ffffff');
  im.rect(5, 13, 6, 1, '#a02020');
  return im;
}

function popcorn() {
  const im = new Img(T, T);
  im.ellipse(8, 14, 5, 1.5, SHADOW);
  for (let y = 7; y < 15; y++) {
    const inset = Math.floor((y - 7) / 4);
    for (let x = 3 + inset; x < 13 - inset; x++) im.px(x, y, Math.floor(x / 2) % 2 ? '#d03030' : '#ffffff');
  }
  im.ellipse(8, 5, 5.5, 3.5, '#fff3c4');
  for (const [x, y] of [[5, 4], [8, 3], [10, 5], [6, 6], [9, 6], [11, 4]]) im.px(x, y, '#f2d27a');
  return im;
}

const TILES = [
  ['floorA', () => floor(0)],
  ['floorB', () => floor(2)],
  ['wallTop', wallTop, true],
  ['wallFace', wallFace, true],
  ['lamp', lamp, true],
  ['bookshelf', bookshelf, true],
  ['doorL', () => door(false), true],
  ['doorR', () => door(true), true],
  ['doormat', doormat],
  ['rugTL', () => rug(1, 0, 1, 0)],
  ['rugT', () => rug(1, 0, 0, 0)],
  ['rugTR', () => rug(1, 0, 0, 1)],
  ['rugL', () => rug(0, 0, 1, 0)],
  ['rugC', () => rug(0, 0, 0, 0)],
  ['rugR', () => rug(0, 0, 0, 1)],
  ['rugBL', () => rug(0, 1, 1, 0)],
  ['rugB', () => rug(0, 1, 0, 0)],
  ['rugBR', () => rug(0, 1, 0, 1)],
  ['sofaL', () => sofa(0), true],
  ['sofaM', () => sofa(1), true],
  ['sofaR', () => sofa(2), true],
  ['beanbag', beanbag, true],
  ['massageDown', () => massageChair('down'), true],
  ['massageUp', () => massageChair('up'), true],
  ['massageLeft', () => massageChair('left'), true],
  ['massageRight', () => massageChair('right'), true],
  ['hanging', hangingChair, true],
  ['plant', plant, true],
  ['table', table, true],
  ['curtainL', () => curtain(false)],
  ['curtainR', () => curtain(true)],
  ['exitL', () => door(false)],
  ['exitR', () => door(true)],
  ['chairDown', () => chair('down'), true],
  ['chairUp', () => chair('up'), true],
  ['chairLeft', () => chair('left'), true],
  ['chairRight', () => chair('right'), true],
  ['btTL', () => bigTable(1, 0, 1, 0), true],
  ['btT', () => bigTable(1, 0, 0, 0), true],
  ['btTR', () => bigTable(1, 0, 0, 1), true],
  ['btL', () => bigTable(0, 0, 1, 0), true],
  ['btC', () => bigTable(0, 0, 0, 0), true],
  ['btR', () => bigTable(0, 0, 0, 1), true],
  ['btBL', () => bigTable(0, 1, 1, 0), true],
  ['btB', () => bigTable(0, 1, 0, 0), true],
  ['btBR', () => bigTable(0, 1, 0, 1), true],
  ['kiosk', kiosk],
  ['cola', cola],
  ['popcorn', popcorn],
];
const COLS = 8;
const GID = Object.fromEntries(TILES.map(([name], i) => [name, i + 1]));

function buildTileset() {
  const rows = Math.ceil(TILES.length / COLS);
  const sheet = new Img(COLS * T, rows * T);
  TILES.forEach(([, draw], i) => sheet.blit(draw(), (i % COLS) * T, Math.floor(i / COLS) * T));
  savePNG(sheet, OUT('tilesets/lobby.png'));
  return sheet;
}

// ───────────── 캐릭터 (16×24) ─────────────
// 시트 구성: 행 = 방향 [down, left, right, up], 열 = 자세 [idle, walk1, walk2, sit]
// body-*.png: 피부·머리·신발·외곽선 / outfit.png: 흰색 점프수트 (게임에서 setTint로 색칠)
const SK = '#f1c7a0', SKS = '#d9a57e', HR = '#4a2c1a', HRH = '#6e4428';
const EYE = '#2b1d14', MOUTH = '#c47a5a', SHOE = '#3b3b3b', LINE = '#2b1d14';
const OM = '#ffffff', OS = '#cfcfcf', OL = '#8a8a8a';

function drawHair(im, gender, dir) {
  const female = gender === 'female';
  if (dir === 'down') {
    if (female) {
      im.rect(2, 4, 2, 10, HR);
      im.rect(12, 4, 2, 10, HR);
    }
    im.rect(4, 1, 8, 3, HR);
    im.rect(3, 2, 1, 6, HR);
    im.rect(12, 2, 1, 6, HR);
    if (female) {
      im.rect(4, 4, 3, 1, HR);
      im.rect(9, 4, 3, 1, HR);
      im.px(4, 5, HR);
      im.px(11, 5, HR);
    } else {
      for (const x of [4, 5, 7, 10, 11]) im.px(x, 4, HR);
    }
    im.rect(6, 2, 3, 1, HRH);
  } else if (dir === 'up') {
    if (female) {
      im.rect(3, 1, 10, 13, HR);
      im.rect(2, 4, 1, 9, HR);
      im.rect(13, 4, 1, 9, HR);
    } else {
      im.rect(4, 1, 8, 9, HR);
      im.rect(3, 2, 1, 7, HR);
      im.rect(12, 2, 1, 7, HR);
    }
    im.rect(6, 2, 3, 1, HRH);
  } else {
    // left (right는 좌우 반전으로 만든다)
    if (female) {
      im.rect(9, 4, 4, 10, HR);
      im.rect(13, 5, 1, 8, HR);
    }
    im.rect(4, 1, 8, 3, HR);
    im.rect(8, 3, 5, 5, HR);
    im.rect(3, 2, 1, 3, HR);
    im.px(4, 4, HR);
    im.rect(6, 2, 3, 1, HRH);
    if (!female) im.rect(9, 6, 1, 2, SKS);
  }
  if (female) im.rect(dir === 'up' ? 10 : 11, 2, 2, 2, '#e86a8a');
}

function drawBase(im, gender, dir, pose) {
  // 얼굴
  im.rect(4, 3, 8, 7, SK);
  im.rect(5, 10, 6, 1, SK);
  im.rect(6, 11, 4, 1, SKS);
  if (dir === 'left') im.px(3, 7, SK);
  drawHair(im, gender, dir);
  if (dir === 'down') {
    im.px(6, 7, EYE);
    im.px(9, 7, EYE);
    im.rect(7, 9, 2, 1, MOUTH);
  } else if (dir === 'left') {
    im.px(5, 7, EYE);
    im.px(4, 9, MOUTH);
  }

  // 손과 신발
  if (dir === 'down' || dir === 'up') {
    const [l1, l2] = pose === 'walk1' ? [5, 6] : pose === 'walk2' ? [6, 5] : [6, 6];
    im.rect(3, 11 + l1, 2, 1, SK);
    im.rect(11, 11 + l2, 2, 1, SK);
    if (pose === 'sit') {
      if (dir === 'down') {
        im.rect(5, 20, 3, 2, SHOE);
        im.rect(8, 20, 3, 2, SHOE);
      }
    } else {
      const ly = pose === 'walk1' ? 21 : 22;
      const ry = pose === 'walk2' ? 21 : 22;
      im.rect(5, ly, 3, 2, SHOE);
      im.rect(8, ry, 3, 2, SHOE);
    }
  } else {
    const hx = pose === 'walk1' ? 5 : pose === 'walk2' ? 8 : 7;
    im.rect(hx, 17, 2, 1, SK);
    if (pose === 'idle') im.rect(5, 22, 5, 2, SHOE);
    if (pose === 'walk1') {
      im.rect(3, 22, 4, 2, SHOE);
      im.rect(8, 22, 3, 2, SHOE);
    }
    if (pose === 'walk2') {
      im.rect(4, 22, 4, 2, SHOE);
      im.rect(8, 22, 4, 2, SHOE);
    }
    if (pose === 'sit') im.rect(2, 22, 3, 2, SHOE);
  }
}

function drawOutfit(im, dir, pose) {
  // 몸통
  im.rect(5, 11, 6, 7, OM);
  im.rect(10, 11, 1, 7, OS);
  if (dir === 'down') {
    im.rect(7, 11, 2, 1, OL);
    im.rect(5, 13, 2, 2, OS); // 가슴 번호판
  }

  if (dir === 'down' || dir === 'up') {
    const [l1, l2] = pose === 'walk1' ? [5, 6] : pose === 'walk2' ? [6, 5] : [6, 6];
    im.rect(3, 11, 2, l1, OM);
    im.rect(11, 11, 2, l2, OS);
    if (pose === 'sit') {
      if (dir === 'down') {
        im.rect(5, 18, 6, 2, OM);
        im.rect(5, 19, 6, 1, OS);
      }
    } else {
      const lh = pose === 'walk1' ? 3 : 4;
      const rh = pose === 'walk2' ? 3 : 4;
      im.rect(5, 18, 3, lh, OM);
      im.rect(8, 18, 3, rh, OM);
      im.rect(8, 19, 1, rh - 1, OS);
      im.rect(10, 18, 1, rh, OS);
    }
  } else {
    const ax = pose === 'walk1' ? 5 : pose === 'walk2' ? 8 : 7;
    im.rect(ax, 11, 2, 6, OS);
    if (pose === 'idle') {
      im.rect(6, 18, 4, 4, OM);
      im.rect(9, 18, 1, 4, OS);
    }
    if (pose === 'walk1') {
      im.rect(4, 18, 3, 4, OM);
      im.rect(8, 18, 3, 4, OS);
    }
    if (pose === 'walk2') {
      im.rect(5, 18, 3, 4, OS);
      im.rect(8, 18, 3, 4, OM);
    }
    if (pose === 'sit') {
      im.rect(3, 17, 7, 2, OM);
      im.rect(3, 19, 2, 3, OM);
      im.rect(4, 19, 1, 3, OS);
    }
  }
}

// 두 겹을 합친 실루엣 바깥에 어두운 외곽선을 body 층에 그린다
function addOutline(base, outfit) {
  const filled = (x, y) => base.alpha(x, y) > 0 || outfit.alpha(x, y) > 0;
  const marks = [];
  for (let y = 0; y < base.h; y++)
    for (let x = 0; x < base.w; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) marks.push([x, y]);
    }
  for (const [x, y] of marks) base.px(x, y, LINE);
}

function buildCharacters() {
  const DIRS = ['down', 'left', 'right', 'up'];
  const POSES = ['idle', 'walk1', 'walk2', 'sit'];
  const outfitSheet = new Img(4 * 16, 4 * 24);
  for (const gender of ['male', 'female']) {
    const bodySheet = new Img(4 * 16, 4 * 24);
    DIRS.forEach((dir, row) =>
      POSES.forEach((pose, col) => {
        const d = dir === 'right' ? 'left' : dir;
        let b = new Img(16, 24);
        let o = new Img(16, 24);
        drawBase(b, gender, d, pose);
        drawOutfit(o, d, pose);
        if (dir === 'right') {
          b = mirror(b);
          o = mirror(o);
        }
        addOutline(b, o);
        bodySheet.blit(b, col * 16, row * 24);
        outfitSheet.blit(o, col * 16, row * 24);
      }),
    );
    savePNG(bodySheet, OUT(`sprites/body-${gender}.png`));
  }
  savePNG(outfitSheet, OUT('sprites/outfit.png'));
}

// ───────────── 로비 맵 (Tiled JSON) ─────────────
function buildMap(tilesetImg) {
  const W = 28, H = 20;
  const grid = () => new Array(W * H).fill(0);
  const floorL = grid(), rugL = grid(), wallsL = grid(), furnL = grid();
  const set = (layer, x, y, name) => (layer[y * W + x] = GID[name]);

  for (let y = 1; y < H; y++)
    for (let x = 1; x < W - 1; x++) set(floorL, x, y, (x * 3 + y * 5) % 7 === 0 ? 'floorB' : 'floorA');

  // 벽: 위쪽 2줄(윗면+벽면), 좌우, 아래(입구 문 포함)
  for (let x = 0; x < W; x++) {
    set(wallsL, x, 0, 'wallTop');
    set(wallsL, x, H - 1, 'wallTop');
    if (x > 0 && x < W - 1) set(wallsL, x, 1, 'wallFace');
  }
  for (let y = 0; y < H; y++) {
    set(wallsL, 0, y, 'wallTop');
    set(wallsL, W - 1, y, 'wallTop');
  }
  for (const x of [4, 9, 18, 23]) set(wallsL, x, 1, 'lamp');
  for (const x of [2, 3, 24, 25]) set(wallsL, x, 1, 'bookshelf');
  // 위쪽 가운데(11~16열)는 나중에 게시판 자리로 비워 둔다
  set(wallsL, 13, H - 1, 'doorL');
  set(wallsL, 14, H - 1, 'doorR');
  // 단체 게임방 문 4개 (왼쪽 벽 1·2번, 오른쪽 벽 3·4번)
  const roomDoors = [
    [0, 6, 1, 'right'],
    [0, 13, 2, 'right'],
    [W - 1, 6, 3, 'left'],
    [W - 1, 13, 4, 'left'],
  ];
  for (const [x, y, , facing] of roomDoors) set(wallsL, x, y, facing === 'right' ? 'curtainL' : 'curtainR');

  // 가운데 러그 (10~16열, 8~12행)
  for (let y = 8; y <= 12; y++)
    for (let x = 10; x <= 16; x++) {
      const v = y === 8 ? 'T' : y === 12 ? 'B' : '';
      const h = x === 10 ? 'L' : x === 16 ? 'R' : '';
      set(rugL, x, y, 'rug' + (v + h || 'C'));
    }
  set(rugL, 13, H - 2, 'doormat');
  set(rugL, 14, H - 2, 'doormat');

  // 좌석 12개 — 모두 가운데 테이블을 바라본다
  const seats = [
    [12, 6, 'sofa', 'down', 'sofaL'],
    [13, 6, 'sofa', 'down', 'sofaM'],
    [14, 6, 'sofa', 'down', 'sofaR'],
    [8, 8, 'massage', 'right', 'massageRight'],
    [8, 10, 'beanbag', 'right', 'beanbag'],
    [8, 12, 'massage', 'right', 'massageRight'],
    [18, 8, 'hanging', 'left', 'hanging'],
    [18, 10, 'beanbag', 'left', 'beanbag'],
    [18, 12, 'hanging', 'left', 'hanging'],
    [11, 14, 'massage', 'up', 'massageUp'],
    [13, 14, 'hanging', 'up', 'hanging'],
    [15, 14, 'beanbag', 'up', 'beanbag'],
  ];
  for (const [x, y, , , tile] of seats) set(furnL, x, y, tile);
  set(furnL, 13, 10, 'table');
  for (const [x, y] of [[1, 2], [26, 2], [1, 18], [26, 18]]) set(furnL, x, y, 'plant');

  let objId = 1;
  const objects = [
    { id: objId++, name: 'spawn', type: 'spawn', point: true, x: 14 * T, y: 17 * T + 12, width: 0, height: 0, rotation: 0, visible: true },
    ...seats.map(([x, y, kind, facing], i) => ({
      id: objId++,
      name: `seat-${i + 1}`,
      type: 'seat',
      x: x * T,
      y: y * T,
      width: T,
      height: T,
      rotation: 0,
      visible: true,
      properties: [
        { name: 'facing', type: 'string', value: facing },
        { name: 'kind', type: 'string', value: kind },
      ],
    })),
    // 단체 게임방 문: facing = 방에서 나왔을 때 바라보는 방향
    ...roomDoors.map(([x, y, room, facing]) => ({
      id: objId++,
      name: `room-door-${room}`,
      type: 'door',
      x: x * T,
      y: y * T,
      width: T,
      height: T,
      rotation: 0,
      visible: true,
      properties: [
        { name: 'facing', type: 'string', value: facing },
        { name: 'room', type: 'int', value: room },
      ],
    })),
  ];

  writeMap('lobby', W, H, [
    ['floor', floorL],
    ['rug', rugL],
    ['walls', wallsL],
    ['furniture', furnL],
  ], objects, tilesetImg);
}

function tiledObject(id, name, type, x, y, w, h, props = {}) {
  const o = { id, name, type, x, y, width: w, height: h, rotation: 0, visible: true };
  if (w === 0) o.point = true;
  const entries = Object.entries(props);
  if (entries.length)
    o.properties = entries.map(([k, v]) => ({ name: k, type: Number.isInteger(v) ? 'int' : 'string', value: v }));
  return o;
}

// 단체 게임방 (4개 방이 같은 맵을 쓴다)
function buildRoomMap(tilesetImg) {
  const W = 16, H = 12;
  const grid = () => new Array(W * H).fill(0);
  const floorL = grid(), rugL = grid(), wallsL = grid(), furnL = grid(), topL = grid();
  const set = (layer, x, y, name) => (layer[y * W + x] = GID[name]);

  for (let y = 1; y < H; y++)
    for (let x = 1; x < W - 1; x++) set(floorL, x, y, (x * 3 + y * 5) % 7 === 0 ? 'floorB' : 'floorA');
  for (let x = 0; x < W; x++) {
    set(wallsL, x, 0, 'wallTop');
    set(wallsL, x, H - 1, 'wallTop');
    if (x > 0 && x < W - 1) set(wallsL, x, 1, 'wallFace');
  }
  for (let y = 0; y < H; y++) {
    set(wallsL, 0, y, 'wallTop');
    set(wallsL, W - 1, y, 'wallTop');
  }
  for (const x of [3, 12]) set(wallsL, x, 1, 'lamp');
  for (const x of [6, 9]) set(wallsL, x, 1, 'bookshelf');
  set(wallsL, 7, H - 1, 'exitL');
  set(wallsL, 8, H - 1, 'exitR');
  set(rugL, 7, H - 2, 'doormat');
  set(rugL, 8, H - 2, 'doormat');

  // 러그 + 4×3 테이블 (6~9열, 5~7행)
  for (let y = 3; y <= 9; y++)
    for (let x = 4; x <= 11; x++) {
      const v = y === 3 ? 'T' : y === 9 ? 'B' : '';
      const h = x === 4 ? 'L' : x === 11 ? 'R' : '';
      set(rugL, x, y, 'rug' + (v + h || 'C'));
    }
  for (let y = 5; y <= 7; y++)
    for (let x = 6; x <= 9; x++) {
      const v = y === 5 ? 'T' : y === 7 ? 'B' : '';
      const h = x === 6 ? 'L' : x === 9 ? 'R' : '';
      set(furnL, x, y, 'bt' + (v + h || 'C'));
    }
  set(topL, 7, 6, 'kiosk');

  const seats = [
    [7, 4, 'down', 'chairDown'],
    [8, 4, 'down', 'chairDown'],
    [5, 6, 'right', 'chairRight'],
    [10, 6, 'left', 'chairLeft'],
    [7, 8, 'up', 'chairUp'],
    [8, 8, 'up', 'chairUp'],
  ];
  for (const [x, y, , tile] of seats) set(furnL, x, y, tile);
  for (const [x, y] of [[1, 2], [14, 2], [1, 10], [14, 10]]) set(furnL, x, y, 'plant');

  let id = 1;
  const objects = [
    tiledObject(id++, 'spawn', 'spawn', 8 * T, 9 * T + 12, 0, 0),
    tiledObject(id++, 'exit', 'exit', 7 * T, (H - 1) * T, 2 * T, T),
    tiledObject(id++, 'kiosk', 'kiosk', 7 * T, 6 * T, T, T),
    // 게임이 시작되면 테이블에 놓이는 콜라·팝콘 (frame = 타일셋에서 몇 번째 칸인지)
    tiledObject(id++, 'cola', 'prop', 6 * T + 8, 6 * T + 8, 0, 0, { frame: GID.cola - 1 }),
    tiledObject(id++, 'popcorn', 'prop', 9 * T + 8, 6 * T + 8, 0, 0, { frame: GID.popcorn - 1 }),
    ...seats.map(([x, y, facing], i) => tiledObject(id++, `seat-${i + 1}`, 'seat', x * T, y * T, T, T, { facing, kind: 'chair' })),
  ];
  writeMap('room', W, H, [
    ['floor', floorL],
    ['rug', rugL],
    ['walls', wallsL],
    ['furniture', furnL],
    ['tabletop', topL],
  ], objects, tilesetImg);
}

function writeMap(name, W, H, tileLayers, objects, tilesetImg) {
  const layers = tileLayers.map(([lname, data], i) => ({
    id: i + 1, name: lname, type: 'tilelayer', data, width: W, height: H, x: 0, y: 0, opacity: 1, visible: true,
  }));
  layers.push({ id: layers.length + 1, name: 'objects', type: 'objectgroup', draworder: 'topdown', objects, x: 0, y: 0, opacity: 1, visible: true });
  const map = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    compressionlevel: -1,
    width: W,
    height: H,
    tilewidth: T,
    tileheight: T,
    nextlayerid: layers.length + 1,
    nextobjectid: Math.max(...objects.map((o) => o.id)) + 1,
    layers,
    tilesets: [
      {
        firstgid: 1,
        name: 'lobby',
        image: '../tilesets/lobby.png',
        imagewidth: tilesetImg.w,
        imageheight: tilesetImg.h,
        tilewidth: T,
        tileheight: T,
        columns: COLS,
        tilecount: (tilesetImg.w / T) * (tilesetImg.h / T),
        margin: 0,
        spacing: 0,
        tiles: TILES.map(([, , collides], id) => (collides ? { id, properties: [{ name: 'collides', type: 'bool', value: true }] } : null)).filter(Boolean),
      },
    ],
  };
  const file = OUT(`maps/${name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 1));
  console.log('저장:', path.relative(ROOT, file));
}

const tilesetImg = buildTileset();
buildCharacters();
const force = process.argv.includes('--force-map');
for (const [name, build] of [['lobby', buildMap], ['room', buildRoomMap]]) {
  if (!fs.existsSync(OUT(`maps/${name}.json`)) || force) build(tilesetImg);
  else console.log(`${name} 맵은 이미 있어서 건너뜀 (덮어쓰려면 --force-map)`);
}
