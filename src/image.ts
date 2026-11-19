import i18n from './i18n';

/** 图片压缩：最长边缩到 maxDim，输出 JPEG Blob */
export async function compressImage(input: Blob, maxDim = 1024, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(input);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(i18n.t('image.processFailed')))),
        'image/jpeg',
        quality
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 生成列表用缩略图：默认 256px 最长边 JPEG，体积小、列表解码快 */
export function makeThumb(input: Blob, maxDim = 256): Promise<Blob> {
  return compressImage(input, maxDim, 0.8);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(i18n.t('image.loadFailed')));
    img.src = url;
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
