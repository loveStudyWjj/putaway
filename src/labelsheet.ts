import { qrPngDataUrl, categoryQrText } from './qr';
import type { Category } from './types';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/**
 * 批量目录二维码打印页：A4 150dpi（1240×1754），3×4 网格，
 * 每格 QR + 目录名 + 路径。返回 PNG Blob。
 */
export async function makeLabelSheet(cats: { cat: Category; path: string }[]): Promise<Blob> {
  const W = 1240, H = 1754, COLS = 3, ROWS = 4;
  const cellW = W / COLS, cellH = H / ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d4d4d8';
  ctx.setLineDash([8, 6]);
  for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, H); ctx.stroke(); }
  for (let i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(0, i * cellH); ctx.lineTo(W, i * cellH); ctx.stroke(); }
  ctx.setLineDash([]);

  const list = cats.slice(0, COLS * ROWS);
  for (let i = 0; i < list.length; i++) {
    const { cat, path } = list[i];
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = col * cellW, y = row * cellH;
    const qrUrl = await qrPngDataUrl(categoryQrText(cat.id));
    const img = await loadImg(qrUrl);
    const qrSize = cellW - 80;
    ctx.drawImage(img, x + 40, y + 30, qrSize, qrSize);
    ctx.fillStyle = '#1e1b4b';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const name = cat.name.length > 10 ? cat.name.slice(0, 9) + '…' : cat.name;
    ctx.fillText(name, x + cellW / 2, y + qrSize + 78);
    ctx.fillStyle = '#71717a';
    ctx.font = '20px system-ui, sans-serif';
    const p = path.length > 16 ? path.slice(0, 15) + '…' : path;
    ctx.fillText(p, x + cellW / 2, y + qrSize + 110);
  }
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}
