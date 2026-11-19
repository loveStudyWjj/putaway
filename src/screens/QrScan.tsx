import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../db';
import { useNav, useToast } from '../store';
import { decodeQrFromImage, decodeQrFromVideo, parseQrText } from '../qr';
import { TopBar, IconImage } from '../ui';
import { haptic } from '../haptics';
import { barcodeSupported, detectBarcodeFromVideo, lookupProduct, stashProduct } from '../barcode';

/** 扫码定位：目录二维码（找东西）+ 商品条码（建物品）双模式 */
export function QrScanScreen() {
  const nav = useNav();
  const { toast } = useToast();
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream>();
  const doneRef = useRef(false);
  const [camOk, setCamOk] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'qr' | 'barcode'>('qr');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const canBarcode = barcodeSupported();

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let detectBusy = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setCamOk(true);
        const tick = () => {
          if (doneRef.current || stopped) return;
          if (modeRef.current === 'qr') {
            const text = decodeQrFromVideo(v, canvasRef.current!);
            if (text) { haptic('success'); handleText(text); return; }
          } else if (!detectBusy) {
            detectBusy = true;
            void detectBarcodeFromVideo(v).then((code) => {
              detectBusy = false;
              if (code && !doneRef.current && !stopped) handleBarcode(code);
            });
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setCamOk(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const handleText = async (text: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const catId = parseQrText(text);
    if (!catId) {
      toast(t('scan.notFound'));
      setTimeout(() => { doneRef.current = false; }, 1500);
      return;
    }
    const cat = await db.categories.get(catId);
    if (!cat) {
      toast(t('scan.catMissing'));
      setTimeout(() => { doneRef.current = false; }, 1500);
      return;
    }
    nav.replace({ name: 'browse', categoryId: catId });
  };

  const handleBarcode = async (code: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    haptic('success');
    toast(t('barcode.found'));
    const info = await lookupProduct(code);
    stashProduct(info);
    nav.replace({ name: 'itemForm' });
  };

  const pickImage = async (f: File) => {
    const text = await decodeQrFromImage(f);
    if (text) await handleText(text);
    else toast(t('scan.notFound'));
  };

  return (
    <div className="min-h-screen bg-black">
      <TopBar title={mode === 'qr' ? t('scan.title') : t('barcode.scanTitle')} onBack={nav.pop} />

      {canBarcode && (
        <div className="mx-4 mt-3 flex rounded-xl bg-white/10 p-1">
          {(['qr', 'barcode'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === m ? 'bg-white text-gray-900' : 'text-white/70'}`}>
              {m === 'qr' ? t('scan.title') : t('barcode.scanTitle')}
            </button>
          ))}
        </div>
      )}

      <div className="relative mx-4 mt-4 rounded-2xl overflow-hidden bg-gray-900 aspect-[3/4]">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {camOk === false && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm px-8 text-center">
            {t('scan.noCamera')}
          </div>
        )}
        {camOk && (
          <>
            <div className="absolute inset-8 border-2 border-white/70 rounded-2xl" />
            <p className="absolute bottom-4 left-0 right-0 text-center text-white/80 text-sm">
              {mode === 'qr' ? t('scan.hint') : t('barcode.scanHint')}
            </p>
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <button onClick={() => fileRef.current?.click()}
        className="mx-auto mt-6 flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 text-white text-sm font-medium active:bg-white/20">
        <IconImage className="w-5 h-5" /> {t('scan.fromGallery')}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) pickImage(f);
        }} />
    </div>
  );
}
