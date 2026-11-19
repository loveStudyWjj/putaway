import QRCode from 'qrcode';
import jsQR from 'jsqr';

/** 目录二维码内容格式 */
export const QR_PREFIX = 'wugui://c/';

export function categoryQrText(categoryId: string): string {
  return QR_PREFIX + categoryId;
}

/** 解析扫码内容 → 目录 id；非本应用码返回 null */
export function parseQrText(text: string): string | null {
  const t = text.trim();
  if (t.startsWith(QR_PREFIX)) return t.slice(QR_PREFIX.length) || null;
  return null;
}

/** 生成目录二维码 PNG dataURL（512px，留边） */
export function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 512, margin: 2, color: { dark: '#1e1b4b', light: '#ffffff' } });
}

/** 从图片 Blob 解码二维码内容；失败返回 null */
export async function decodeQrFromImage(blob: Blob): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data.data, data.width, data.height)?.data ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 从 video 帧解码（扫码页逐帧调用） */
export function decodeQrFromVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (!video.videoWidth) return null;
  const w = Math.min(video.videoWidth, 640);
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, w, h);
  try {
    const data = ctx.getImageData(0, 0, w, h);
    return jsQR(data.data, w, h)?.data ?? null;
  } catch {
    return null;
  }
}
