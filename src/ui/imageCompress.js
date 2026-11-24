// 게시판 이미지 압축: 가로 최대 800px, 100KB 이하의 WebP(지원 안 되는 브라우저는 JPEG)로 줄여
// base64 문자열(data:image/...)로 돌려준다. (Firebase Storage는 결제 수단이 필요해서 쓰지 않는다)
const MAX_WIDTH = 800;
const MAX_BYTES = 100 * 1024;

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  let width = Math.min(MAX_WIDTH, bitmap.width);
  const canvas = document.createElement('canvas');
  // 화질을 낮춰 보고, 그래도 크면 크기를 줄여서 다시 시도한다
  for (let attempt = 0; attempt < 6; attempt++) {
    canvas.width = width;
    canvas.height = Math.round((bitmap.height * width) / bitmap.width);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // 투명한 부분은 흰색으로 (JPEG 대비)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      let blob = await toBlob(canvas, 'image/webp', quality);
      // WebP로 저장하지 못하는 브라우저(예: 예전 Safari)는 PNG를 돌려준다 → JPEG로
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
      if (blob && blob.size <= MAX_BYTES) return blobToDataUrl(blob);
    }
    width = Math.round(width * 0.75);
  }
  throw new Error('이미지를 100KB 이하로 줄이지 못했어요. 다른 이미지를 써 주세요.');
}
