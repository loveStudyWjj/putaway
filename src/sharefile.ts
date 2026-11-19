import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

async function blobToBase64Raw(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 分享一个 Blob 为文件：原生走分享面板，web 走下载 */
export async function shareBlobFile(blob: Blob, fileName: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64Raw(blob);
    const w = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ url: w.uri, title: fileName });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
