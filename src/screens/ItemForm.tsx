import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { db, uid, saveItem, pathText, ensureCategoryPath, getItemImages } from '../db';
import type { Item } from '../types';
import { useNav, useToast, useDataVersion } from '../store';
import { compressImage, makeThumb, blobToBase64 } from '../image';
import { scheduleExpiry } from '../notify';
import { recognizeItem } from '../ai';
import { takeProduct } from '../barcode';
import { loadSettings } from '../settings';
import { CategoryPicker } from '../CategoryPicker';
import {
  TopBar, Field, inputCls, IconCamera, IconImage, IconSparkle, IconPlus, IconClose, Spinner,
  Sheet, SheetBtn,
} from '../ui';

interface PhotoEntry {
  /** 已存在的 imageId（编辑态）；新图为 undefined */
  id?: string;
  blob: Blob;
  thumb?: Blob;
  url: string;
}

export function ItemFormScreen({ itemId, categoryId }: { itemId?: string; categoryId?: string }) {
  const nav = useNav();
  const { toast } = useToast();
  const { bump } = useDataVersion();
  const { t } = useTranslation();

  const [item, setItem] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catLabel, setCatLabel] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestPath, setSuggestPath] = useState('');
  const [addSheet, setAddSheet] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickSource = useRef<'camera' | 'photos'>('photos');
  const aiRan = useRef(false);
  const photoUrls = useRef<string[]>([]);

  const trackUrl = (u: string) => {
    photoUrls.current.push(u);
    return u;
  };

  // 载入：编辑模式取物品，新建模式建草稿
  useEffect(() => {
    (async () => {
      if (itemId) {
        const it = await db.items.get(itemId);
        if (!it) { toast(t('form.itemNotFound')); nav.pop(); return; }
        setItem(it);
        const blobs = await getItemImages(it);
        setPhotos(
          blobs.map((blob, i) => ({ id: it.imageIds[i], blob, url: trackUrl(URL.createObjectURL(blob)) }))
        );
        setCatLabel(await pathText(it.categoryId));
      } else {
        setItem({
          id: uid(), name: '', categoryId: categoryId ?? '',
          description: '', attributes: {}, quantity: 1, tags: [],
          imageIds: [], createdAt: Date.now(), updatedAt: Date.now(),
        });
        setCatLabel(await pathText(categoryId ?? ''));
      }
    })();
  }, [itemId, categoryId]);

  // 浏览页传来的待识别照片
  useEffect(() => {
    if (!item || itemId) return;
    const pending = sessionStorage.getItem('wugui.pendingPhoto');
    if (!pending) return;
    sessionStorage.removeItem('wugui.pendingPhoto');
    (async () => {
      const blob = await (await fetch(pending)).blob();
      await applyPhoto(blob, true);
    })();
  }, [item]);

  // 扫码页识别到的商品条码 → 预填名称/品牌/类目
  useEffect(() => {
    if (!item || itemId) return;
    const p = takeProduct();
    if (!p) return;
    setItem((it) => it && {
      ...it,
      name: p.name || it.name,
      barcode: p.barcode,
      attributes: {
        ...it.attributes,
        barcode: p.barcode,
        ...(p.brand ? { brand: p.brand } : {}),
        ...(p.category ? { category: p.category } : {}),
      },
    });
    if (!p.name) toast(t(navigator.onLine === false ? 'barcode.offline' : 'barcode.lookupFail'));
  }, [item]);

  useEffect(
    () => () => {
      photoUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const applyPhoto = async (raw: Blob, runAi: boolean) => {
    setCompressing(true);
    try {
      const [blob, thumb] = await Promise.all([compressImage(raw), makeThumb(raw)]);
      const entry: PhotoEntry = { blob, thumb, url: trackUrl(URL.createObjectURL(blob)) };
      setPhotos((prev) => [...prev, entry]);
      // 仅新建物品时自动识别；编辑已有物品需手动点「AI 识别」
      if (runAi && !itemId && !aiRan.current) {
        aiRan.current = true;
        runRecognize(blob);
      }
    } catch (e: any) {
      toast(e?.message ?? t('form.photoFailed'));
    } finally {
      setCompressing(false);
    }
  };

  const pickNative = async (source: 'camera' | 'photos') => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        quality: 90,
      });
      if (!photo.base64String) return;
      const bin = atob(photo.base64String);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await applyPhoto(new Blob([arr], { type: `image/${photo.format || 'jpeg'}` }), true);
    } catch (e: any) {
      if (e?.message && !/cancel/i.test(e.message)) toast(t('common.openFailed', { msg: e.message }));
    }
  };

  const pick = (source: 'camera' | 'photos') => {
    if (Capacitor.isNativePlatform()) {
      pickNative(source);
    } else {
      pickSource.current = source;
      const el = fileRef.current!;
      if (source === 'camera') el.setAttribute('capture', 'environment');
      else el.removeAttribute('capture');
      el.click();
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const [gone] = next.splice(idx, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return next;
    });
  };

  const runRecognize = async (blob?: Blob) => {
    const b = blob ?? photos[photos.length - 1]?.blob;
    if (!b || aiLoading) return;
    setAiLoading(true);
    try {
      const b64 = await blobToBase64(b);
      const r = await recognizeItem(b64, loadSettings());
      setItem((it) => {
        if (!it) return it;
        return {
          ...it,
          name: it.name || r.name,
          description: it.description || r.description,
          quantity: it.quantity > 1 ? it.quantity : r.quantity,
          attributes: { ...r.attributes, ...it.attributes },
          tags: Array.from(new Set([...r.tags, ...it.tags])).slice(0, 8),
        };
      });
      if (r.categoryPath) setSuggestPath(r.categoryPath);
      toast(t('form.recogDone'));
    } catch (e: any) {
      aiRan.current = false;
      toast(e?.message ?? t('form.recogFailed'));
    } finally {
      setAiLoading(false);
    }
  };

  const save = async () => {
    if (!item) return;
    if (!item.name.trim()) { toast(t('form.nameRequired')); return; }
    setSaving(true);
    try {
      // 借了/还了的时间戳维护
      const next = { ...item };
      if (next.lentTo?.trim() && !next.lentAt) next.lentAt = Date.now();
      if (!next.lentTo?.trim()) { next.lentTo = undefined; next.lentAt = undefined; }
      await saveItem(next, photos.map((p) => (p.id ? { id: p.id } : { blob: p.blob, thumb: p.thumb })));
      scheduleExpiry(next);
      bump();
      toast(t('form.saved'));
      nav.pop();
    } catch (e: any) {
      toast(t('form.saveFailed', { msg: e?.message ?? e }));
      setSaving(false);
    }
  };

  const setAttr = (k: string, v: string) =>
    setItem((it) => it && { ...it, attributes: { ...it.attributes, [k]: v } });
  const delAttr = (k: string) =>
    setItem((it) => {
      if (!it) return it;
      const a = { ...it.attributes };
      delete a[k];
      return { ...it, attributes: a };
    });
  const renameAttr = (oldK: string, newK: string, v: string) =>
    setItem((it) => {
      if (!it || !newK.trim() || newK === oldK) return it;
      const entries = Object.entries(it.attributes).map(([k, val]) => (k === oldK ? [newK.trim(), v] : [k, val]));
      return { ...it, attributes: Object.fromEntries(entries) };
    });

  const [tagDraft, setTagDraft] = useState('');
  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    setItem((it) => it && { ...it, tags: Array.from(new Set([...it.tags, t])).slice(0, 8) });
    setTagDraft('');
  };

  if (!item) return <div className="min-h-screen bg-white dark:bg-gray-950" />;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <TopBar title={itemId ? t('form.editTitle') : t('form.addTitle')} onBack={nav.pop}
        right={<button onClick={save} disabled={saving}
          className="px-4 py-1.5 mr-1 rounded-full bg-brand-600 text-white text-sm font-medium disabled:opacity-50">
          {saving ? t('common.saving') : t('common.save')}
        </button>} />

      {/* 照片区 */}
      <div className="p-4">
        {photos.length > 0 || compressing ? (
          <>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <div key={p.id ?? i} className="relative shrink-0 w-36 aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img src={p.url} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  {aiLoading && i === photos.length - 1 && (
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white gap-1.5">
                      <Spinner className="w-6 h-6" />
                      <span className="text-[11px]">{t('form.recognizing')}</span>
                    </div>
                  )}
                  <button onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center">
                    <IconClose className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {compressing && (
                <div className="shrink-0 w-36 aspect-square rounded-2xl bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center gap-1.5 text-gray-400">
                  <Spinner className="w-6 h-6" />
                  <span className="text-[11px]">{t('form.processing')}</span>
                </div>
              )}
              <button onClick={() => setAddSheet(true)}
                className="shrink-0 w-36 aspect-square rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1.5 text-gray-300 dark:text-gray-600 active:border-brand-500 active:text-brand-500">
                <IconPlus className="w-7 h-7" />
                <span className="text-xs">{t('form.addPhoto')}</span>
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => runRecognize()} disabled={aiLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-500 text-[13px] font-medium disabled:opacity-60">
                <IconSparkle className="w-4 h-4" /> {aiLoading ? t('form.aiBtnLoading') : t('form.aiBtn')}
              </button>
            </div>
          </>
        ) : (
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-brand-50 dark:bg-brand-500/15 text-brand-600 flex items-center justify-center">
              <IconCamera className="w-7 h-7" />
            </div>
            <p className="text-sm text-gray-400">{t('form.photoHint')}</p>
            <div className="flex gap-2">
              <button onClick={() => pick('camera')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium">
                <IconCamera className="w-4 h-4" /> {t('common.camera')}
              </button>
              <button onClick={() => pick('photos')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium">
                <IconImage className="w-4 h-4" /> {t('common.gallery')}
              </button>
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) applyPhoto(f, true);
            e.target.value = '';
          }} />
      </div>

      <div className="px-4">
        <Field label={t('form.name')}>
          <input className={inputCls} value={item.name} placeholder={t('form.namePlaceholder')}
            onChange={(e) => setItem({ ...item, name: e.target.value })} />
        </Field>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label={t('form.location')}>
              <button onClick={() => setPickerOpen(true)}
                className={`${inputCls} text-left flex items-center justify-between`}>
                <span className="truncate">{catLabel}</span>
                <span className="text-gray-400 text-xs shrink-0 ml-2">{t('form.change')}</span>
              </button>
            </Field>
          </div>
          <Field label={t('form.quantity')}>
            <div className="flex items-center gap-3 h-[46px]">
              <button onClick={() => setItem({ ...item, quantity: Math.max(1, item.quantity - 1) })}
                className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-lg text-gray-600 dark:text-gray-300 active:bg-gray-200">−</button>
              <span className="w-8 text-center font-medium dark:text-gray-100">{item.quantity}</span>
              <button onClick={() => setItem({ ...item, quantity: item.quantity + 1 })}
                className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-lg text-gray-600 dark:text-gray-300 active:bg-gray-200">＋</button>
            </div>
          </Field>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label={t('form.lentTo')}>
              <input className={inputCls} value={item.lentTo ?? ''} placeholder={t('form.lentToPlaceholder')}
                onChange={(e) => setItem({ ...item, lentTo: e.target.value })} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label={t('form.expiry')}>
              <input className={inputCls} type="date" value={item.expiryDate ?? ''}
                onChange={(e) => setItem({ ...item, expiryDate: e.target.value })} />
            </Field>
          </div>
        </div>
        {item.expiryDate && (
          <p className="text-xs text-gray-400 -mt-2 mb-4">{t('form.expiryHint')}</p>
        )}

        {suggestPath && (
          <button
            onClick={async () => {
              const id = await ensureCategoryPath(suggestPath);
              setItem({ ...item, categoryId: id });
              setCatLabel(await pathText(id));
              setSuggestPath('');
              toast(t('form.movedTo', { path: suggestPath }));
            }}
            className="w-full mb-4 flex items-center gap-2 px-3.5 py-3 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-500 text-sm text-left active:bg-brand-100">
            <IconSparkle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{t('form.aiSuggest')}<b>{suggestPath}</b>{t('form.aiSuggestHint')}</span>
          </button>
        )}

        <Field label={t('form.description')}>
          <textarea className={`${inputCls} resize-none`} rows={2} value={item.description}
            placeholder={t('form.descPlaceholder')}
            onChange={(e) => setItem({ ...item, description: e.target.value })} />
        </Field>

        {/* 属性 */}
        <div className="mb-4">
          <span className="block text-[13px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('form.attributes')}</span>
          {Object.entries(item.attributes).map(([k, v], i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input className={`${inputCls} !w-[38%]`} defaultValue={k} placeholder={t('form.attrName')}
                onBlur={(e) => renameAttr(k, e.target.value, item.attributes[k])} />
              <input className={inputCls} value={v} placeholder={t('form.attrValue')}
                onChange={(e) => setAttr(k, e.target.value)} />
              <button onClick={() => delAttr(k)} className="p-2 text-gray-300 active:text-red-500 shrink-0">
                <IconClose className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={() => setAttr(t('form.attrDefault', { n: Object.keys(item.attributes).length + 1 }), '')}
            className="flex items-center gap-1 text-sm text-brand-600 dark:text-brand-500 py-1.5 active:opacity-60">
            <IconPlus className="w-4 h-4" /> {t('form.addAttr')}
          </button>
        </div>

        {/* 标签 */}
        <div className="mb-6">
          <span className="block text-[13px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('form.tags')}</span>
          <div className="flex flex-wrap gap-2 mb-2">
            {item.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[13px] text-gray-600 dark:text-gray-300">
                {t}
                <button onClick={() => setItem({ ...item, tags: item.tags.filter((x) => x !== t) })}>
                  <IconClose className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={tagDraft} placeholder={t('form.tagPlaceholder')}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
            <button onClick={addTag} className="px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm shrink-0">{t('form.addTag')}</button>
          </div>
        </div>
      </div>

      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title={t('form.addPhotoSheet')}>
        <SheetBtn icon={<IconCamera />} label={t('common.camera')}
          onClick={() => { setAddSheet(false); pick('camera'); }} />
        <SheetBtn icon={<IconImage />} label={t('common.gallery')}
          onClick={() => { setAddSheet(false); pick('photos'); }} />
      </Sheet>

      <CategoryPicker open={pickerOpen} onClose={() => setPickerOpen(false)}
        title={t('picker.storageLocation')}
        onPick={async (id) => {
          setItem({ ...item, categoryId: id });
          setCatLabel(await pathText(id));
          setPickerOpen(false);
        }} />
    </div>
  );
}
