import type { Item } from './types';

/**
 * 物品位置分享卡（1080×1350）：顶部照片 + 名称 + 存放位置 + 品牌落款。
 * photo 可为空（无图时画纯色占位）。
 */
export async function makeShareCard(item: Item, photo: Blob | null, path: string, brand: string): Promise<Blob> {
  const W = 1080, H = 1350, PHOTO_H = 780;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  if (photo) {
    const url = URL.createObjectURL(photo);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = rej;
        el.src = url;
      });
      // cover 裁剪
      const scale = Math.max(W / img.width, PHOTO_H / img.height);
      const sw = W / scale, sh = PHOTO_H / scale;
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, PHOTO_H);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    ctx.fillStyle = '#eef2ff';
    ctx.fillRect(0, 0, W, PHOTO_H);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '200px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('📦', W / 2, PHOTO_H / 2 + 70);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 56px system-ui, sans-serif';
  const name = item.name.length > 14 ? item.name.slice(0, 13) + '…' : item.name;
  ctx.fillText(name, W / 2, PHOTO_H + 110);

  ctx.fillStyle = '#4f46e5';
  ctx.font = '36px system-ui, sans-serif';
  const p = path.length > 22 ? path.slice(0, 21) + '…' : path;
  ctx.fillText(`📍 ${p}`, W / 2, PHOTO_H + 185);

  const meta: string[] = [];
  if (item.quantity > 1) meta.push(`×${item.quantity}`);
  meta.push(...item.tags.slice(0, 3).map((t) => `#${t}`));
  if (meta.length) {
    ctx.fillStyle = '#71717a';
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillText(meta.join('  '), W / 2, PHOTO_H + 250);
  }

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText(brand, W / 2, H - 50);

  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}
