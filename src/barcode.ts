/** 商品条码识别（BarcodeDetector，Chrome/Android WebView 内置；不支持时优雅降级） */

interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): {
    detect(src: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
  };
  getSupportedFormats?(): Promise<string[]>;
}

export function barcodeSupported(): boolean {
  return typeof (window as any).BarcodeDetector === 'function';
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

/** 从视频帧识别商品条码，命中返回条码值 */
export async function detectBarcodeFromVideo(video: HTMLVideoElement): Promise<string | null> {
  const Ctor = (window as any).BarcodeDetector as BarcodeDetectorCtor | undefined;
  if (!Ctor || !video.videoWidth) return null;
  try {
    const det = new Ctor({ formats: FORMATS });
    const res = await det.detect(video);
    return res[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

/** 从图片识别条码（相册选图路径） */
export async function detectBarcodeFromImage(blob: Blob): Promise<string | null> {
  const Ctor = (window as any).BarcodeDetector as BarcodeDetectorCtor | undefined;
  if (!Ctor) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const res = await new Ctor({ formats: FORMATS }).detect(bmp);
    bmp.close();
    return res[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

export interface ProductInfo {
  barcode: string;
  name?: string;
  brand?: string;
  category?: string;
}

/** OpenFoodFacts 查商品（免费无 key；网络失败/未收录返回基本信息） */
export async function lookupProduct(barcode: string): Promise<ProductInfo> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories`,
      { signal: ctl.signal }
    );
    clearTimeout(timer);
    const j = await r.json();
    const p = j?.product;
    return {
      barcode,
      name: p?.product_name || undefined,
      brand: (p?.brands || '').split(',')[0].trim() || undefined,
      category: (p?.categories || '').split(',')[0].trim() || undefined,
    };
  } catch {
    return { barcode };
  }
}

/** 暂存识别结果，ItemForm 打开时消费（跨页面传参） */
const KEY = 'wugui.pendingProduct';
export function stashProduct(p: ProductInfo) {
  sessionStorage.setItem(KEY, JSON.stringify(p));
}
export function takeProduct(): ProductInfo | null {
  const s = sessionStorage.getItem(KEY);
  if (!s) return null;
  sessionStorage.removeItem(KEY);
  try { return JSON.parse(s); } catch { return null; }
}
