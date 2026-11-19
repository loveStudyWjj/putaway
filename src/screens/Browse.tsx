import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  db, childrenOf, itemsIn, pathOf, deleteCategoryCascade, deleteItems, restoreDeleted,
  descendantIds, uid, setCategoryImage, removeCategoryImage, recentItems, moveItems,
  thumbOf, expiryState,
} from '../db';
import { compressImage, makeThumb } from '../image';
import { cancelExpiry } from '../notify';
import { qrPngDataUrl, categoryQrText } from '../qr';
import type { Category, Item } from '../types';
import { useNav, useToast, useDataVersion } from '../store';
import {
  TopBar, IconBtn, IconPlus, IconDots, IconFolder, IconBox, IconCamera, IconQr, IconCheck,
  Sheet, SheetBtn, Confirm, Empty, BottomNav, IconEdit, IconTrash, IconMove, IconImage, IconClose, IconUser, inputCls,
} from '../ui';
import { CategoryPicker } from '../CategoryPicker';

export function BrowseScreen({ categoryId }: { categoryId: string }) {
  const nav = useNav();
  const { toast } = useToast();
  const { v, bump } = useDataVersion();
  const { t, i18n } = useTranslation();

  const [path, setPath] = useState<Category[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [catImgUrls, setCatImgUrls] = useState<Record<string, string>>({});
  const [coverSheet, setCoverSheet] = useState(false);
  const [menu, setMenu] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  // 批量选择
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchDelConfirm, setBatchDelConfirm] = useState(false);
  // 二维码标签
  const [qrSheet, setQrSheet] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const longPress = useRef<ReturnType<typeof setTimeout>>();

  const isRoot = !categoryId;
  const current = path[path.length - 1];
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';

  useEffect(() => {
    let live = true;
    (async () => {
      const [p, c, it] = await Promise.all([
        pathOf(categoryId),
        childrenOf(categoryId),
        itemsIn(categoryId),
      ]);
      if (!live) return;
      setPath(p);
      setCats(c);
      setItems(it);
      // 根目录额外加载最近添加
      if (!categoryId) setRecent(await recentItems(10));
      // 每个子目录的物品数（含所有子孙目录）
      const cnt: Record<string, number> = {};
      await Promise.all(
        c.map(async (cat) => {
          const ids = await descendantIds(cat.id);
          cnt[cat.id] = await db.items.where('categoryId').anyOf(ids).count();
        })
      );
      if (!live) return;
      setCounts(cnt);
      // 物品缩略图（优先 thumb 小图）
      const urls: Record<string, string> = {};
      const allShown = [...it, ...(categoryId ? [] : await recentItems(10))];
      const firstIds = Array.from(new Set(allShown.map((i) => i.imageIds[0]).filter(Boolean)));
      const recs = await db.images.bulkGet(firstIds);
      allShown.forEach((item) => {
        const fid = item.imageIds[0];
        if (fid && !urls[item.id]) {
          const blob = thumbOf(recs.find((r) => r?.id === fid));
          if (blob) urls[item.id] = URL.createObjectURL(blob);
        }
      });
      setImgUrls((old) => {
        Object.values(old).forEach((u) => URL.revokeObjectURL(u));
        return urls;
      });
      // 目录封面缩略图
      const curl: Record<string, string> = {};
      const catImgs = await db.images.bulkGet(c.map((x) => x.imageId).filter(Boolean) as string[]);
      c.forEach((cat) => {
        if (cat.imageId) {
          const blob = thumbOf(catImgs.find((r) => r?.id === cat.imageId));
          if (blob) curl[cat.id] = URL.createObjectURL(blob);
        }
      });
      setCatImgUrls((old) => {
        Object.values(old).forEach((u) => URL.revokeObjectURL(u));
        return curl;
      });
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [categoryId, v]);

  useEffect(() => {
    return () => {
      Object.values(imgUrls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [imgUrls]);

  useEffect(() => {
    return () => {
      Object.values(catImgUrls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [catImgUrls]);

  const createCategory = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    await db.categories.add({ id: uid(), name: n, parentId: categoryId, createdAt: Date.now() });
    bump();
    toast(t('browse.created', { name: n }));
  };

  const renameCategory = async (name: string) => {
    const n = name.trim();
    if (!n || !current) return;
    await db.categories.update(current.id, { name: n });
    bump();
    toast(t('browse.renamed'));
  };

  const removeCategory = async () => {
    const snap = await deleteCategoryCascade(categoryId);
    snap.items.forEach((i) => cancelExpiry(i.id));
    bump();
    nav.pop();
    toast(t('browse.deleted'), {
      label: t('common.undo'),
      onClick: async () => { await restoreDeleted(snap); bump(); },
    });
  };

  const pickPhoto = async (source: 'camera' | 'photos') => {
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.Base64,
          source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
          quality: 90,
        });
        if (!photo.base64String) return;
        // 通过 sessionStorage 把临时照片交给表单页
        sessionStorage.setItem('wugui.pendingPhoto', `data:image/${photo.format || 'jpeg'};base64,${photo.base64String}`);
        nav.push({ name: 'itemForm', categoryId });
      }
    } catch (e: any) {
      if (e?.message && !/cancel/i.test(e.message)) toast(t('common.openFailed', { msg: e.message }));
    }
  };

  const pickCover = async (source: 'camera' | 'photos') => {
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
      const raw = new Blob([arr], { type: `image/${photo.format || 'jpeg'}` });
      const [blob, thumb] = await Promise.all([compressImage(raw, 512), makeThumb(raw, 256)]);
      await setCategoryImage(categoryId, blob, thumb);
      bump();
      toast(t('browse.coverSet'));
    } catch (e: any) {
      if (e?.message && !/cancel/i.test(e.message)) toast(t('common.openFailed', { msg: e.message }));
    }
  };

  const clearCover = async () => {
    await removeCategoryImage(categoryId);
    bump();
    toast(t('browse.coverRemoved'));
  };

  const showQr = async () => {
    setQrUrl(await qrPngDataUrl(categoryQrText(categoryId)));
    setQrSheet(true);
  };

  const shareQr = async () => {
    const name = `${current?.name ?? 'wugui'}-qr.png`;
    const b64 = qrUrl.split(',')[1];
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await Filesystem.writeFile({ path: name, data: b64, directory: Directory.Cache });
        await Share.share({ title: name, url: res.uri });
      } catch { /* 用户取消分享 */ }
    } else {
      const a = document.createElement('a');
      a.href = qrUrl;
      a.download = name;
      a.click();
    }
  };

  // ---- 批量选择 ----
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const batchMove = async (target: string) => {
    setBatchMoveOpen(false);
    await moveItems(Array.from(selected), target);
    const n = selected.size;
    exitSelect();
    bump();
    toast(t('browse.batchDone', { count: n }));
  };

  const batchDelete = async () => {
    const toDel = items.filter((i) => selected.has(i.id));
    const snap = await deleteItems(toDel);
    toDel.forEach((i) => cancelExpiry(i.id));
    exitSelect();
    setBatchDelConfirm(false);
    bump();
    toast(t('browse.deletedN', { count: snap.items.length }), {
      label: t('common.undo'),
      onClick: async () => { await restoreDeleted(snap); bump(); },
    });
  };

  const onItemPress = (it: Item) => {
    if (selecting) { toggleSelect(it.id); return; }
    nav.push({ name: 'item', itemId: it.id });
  };

  const startLongPress = (it: Item) => {
    longPress.current = setTimeout(() => {
      if (!selecting) {
        setSelecting(true);
        setSelected(new Set([it.id]));
      }
    }, 450);
  };
  const cancelLongPress = () => clearTimeout(longPress.current);

  const expiryBadge = (it: Item) => {
    const s = expiryState(it);
    if (!s) return null;
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
        s === 'expired' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'
      }`}>
        {s === 'expired' ? t('browse.expired') : t('browse.expirySoon')}
      </span>
    );
  };

  const itemCard = (it: Item, small = false) => (
    <button key={it.id}
      onClick={() => onItemPress(it)}
      onMouseDown={() => startLongPress(it)}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={() => startLongPress(it)}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      className={`relative bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm active:scale-[0.97] transition-transform text-left ${
        small ? 'w-28 shrink-0' : ''
      } ${selected.has(it.id) ? 'ring-2 ring-brand-500' : ''}`}>
      <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-600">
        {imgUrls[it.id]
          ? <img src={imgUrls[it.id]} className="w-full h-full object-cover" />
          : <IconBox className="w-8 h-8" />}
        {/* 借出角标 */}
        {it.lentTo && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-medium flex items-center gap-0.5">
            <IconUser className="w-2.5 h-2.5" />{t('browse.lentBadge')}
          </span>
        )}
        {/* 到期角标 */}
        <span className="absolute top-1.5 right-1.5">{expiryBadge(it)}</span>
        {/* 选择态 */}
        {selecting && (
          <span className={`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selected.has(it.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-white bg-black/20'
          }`}>
            {selected.has(it.id) && <IconCheck className="w-3 h-3" />}
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="text-[13px] font-medium text-gray-800 dark:text-gray-100 truncate">{it.name}</p>
        {it.quantity > 1 && <p className="text-[11px] text-gray-400">×{it.quantity}</p>}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopBar
        title={isRoot ? t('app.name') : current?.name ?? ''}
        sub={!isRoot ? path.map((c) => c.name).join('/') : undefined}
        onBack={isRoot ? undefined : nav.pop}
        right={
          <>
            <IconBtn label={t('browse.scanQr')} onClick={() => nav.push({ name: 'qrscan' })}>
              <IconQr />
            </IconBtn>
            <IconBtn label={t('browse.newCategory')} onClick={() => setNewCatOpen(true)}>
              <div className="relative">
                <IconFolder />
                <IconPlus className="w-3 h-3 absolute -right-0.5 -bottom-0.5 text-brand-600" />
              </div>
            </IconBtn>
            {!isRoot && (
              <IconBtn label={t('browse.catOptions')} onClick={() => setMenu(true)}>
                <IconDots />
              </IconBtn>
            )}
          </>
        }
      />

      {/* 面包屑 */}
      {path.length > 1 && (
        <div className="px-4 pt-3 flex items-center gap-1 text-xs text-gray-400 overflow-x-auto whitespace-nowrap">
          <button className="active:text-brand-600" onClick={() => nav.reset()}>{t('nav.home')}</button>
          {path.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span>/</span>
              <span className={i === path.length - 1 ? 'text-gray-600 dark:text-gray-300 font-medium' : ''}>{c.name}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <Empty title={t('common.loading')} />
      ) : cats.length === 0 && items.length === 0 && recent.length === 0 ? (
        <Empty
          title={isRoot ? t('browse.emptyRootTitle') : t('browse.emptyTitle')}
          desc={isRoot ? t('browse.emptyRootDesc') : t('browse.emptyDesc')}
        />
      ) : (
        <div className="px-4 py-3">
          {cats.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 mb-2 mt-1">{t('browse.categories')}</p>
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {cats.map((c) => (
                  <button key={c.id}
                    onClick={() => nav.push({ name: 'browse', categoryId: c.id })}
                    className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-3.5 shadow-sm active:scale-[0.98] transition-transform text-left">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {catImgUrls[c.id]
                        ? <img src={catImgUrls[c.id]} className="w-full h-full object-cover" />
                        : <IconFolder />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{t('browse.itemCount', { count: counts[c.id] ?? 0 })}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2 mt-1">
                <p className="text-xs font-medium text-gray-400">{t('browse.items')}</p>
                {!selecting && (
                  <button onClick={() => setSelecting(true)}
                    className="text-xs text-brand-600 font-medium active:opacity-60">
                    {t('browse.batch')}
                  </button>
                )}
                {selecting && (
                  <button
                    onClick={() => setSelected(new Set(items.map((i) => i.id)))}
                    className="text-xs text-brand-600 font-medium active:opacity-60">
                    {t('browse.selectAll')}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {items.map((it) => itemCard(it))}
              </div>
            </>
          )}

          {isRoot && recent.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 mb-2 mt-5">{t('browse.recent')}</p>
              <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
                {recent.map((it) => itemCard(it, true))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 添加物品 FAB（选择态隐藏） */}
      {!selecting && (
        <button onClick={() => setAddSheet(true)}
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 flex items-center justify-center active:scale-95 transition-transform">
          <IconPlus className="w-7 h-7" />
        </button>
      )}

      {/* 批量操作栏 */}
      {selecting && (
        <div className="fixed left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-xl flex items-center px-4 py-3 gap-2">
            <span className="text-sm text-gray-300">{t('common.selected', { count: selected.size })}</span>
            <div className="flex-1" />
            <button onClick={() => setBatchMoveOpen(true)} disabled={!selected.size}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-sm disabled:opacity-40">
              <IconMove className="w-4 h-4" />{t('common.move')}
            </button>
            <button onClick={() => setBatchDelConfirm(true)} disabled={!selected.size}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/80 text-sm disabled:opacity-40">
              <IconTrash className="w-4 h-4" />{t('common.delete')}
            </button>
            <button onClick={exitSelect} className="p-1.5 rounded-lg bg-white/10">
              <IconClose className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <BottomNav active="home"
        onHome={() => nav.reset()}
        onSearch={() => nav.push({ name: 'search' })}
        onSettings={() => nav.push({ name: 'settings' })} />

      {/* 添加方式 */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title={t('browse.addItem')}>
        <SheetBtn icon={<IconCamera />} label={t('browse.cameraAI')} sub={t('browse.cameraAIDesc')}
          onClick={() => { setAddSheet(false); pickPhoto('camera'); }} />
        <SheetBtn icon={<IconImage />} label={t('browse.pickGallery')} sub={t('browse.pickGalleryDesc')}
          onClick={() => { setAddSheet(false); pickPhoto('photos'); }} />
        <SheetBtn icon={<IconEdit />} label={t('browse.manual')}
          onClick={() => { setAddSheet(false); nav.push({ name: 'itemForm', categoryId }); }} />
      </Sheet>

      {/* 当前目录操作 */}
      <Sheet open={menu} onClose={() => setMenu(false)} title={current?.name}>
        <SheetBtn icon={<IconEdit />} label={t('browse.rename')} onClick={() => { setMenu(false); setRenaming(true); }} />
        <SheetBtn icon={<IconImage />} label={t('browse.setCover')} sub={t('browse.setCoverDesc')}
          onClick={() => { setMenu(false); setCoverSheet(true); }} />
        {current?.imageId && (
          <SheetBtn icon={<IconTrash />} label={t('browse.removeCover')}
            onClick={() => { setMenu(false); clearCover(); }} />
        )}
        <SheetBtn icon={<IconQr />} label={t('browse.qrLabel')} sub={t('browse.qrLabelDesc')}
          onClick={() => { setMenu(false); showQr(); }} />
        <MoveCategoryRow id={categoryId} onDone={() => { setMenu(false); bump(); toast(t('browse.moved')); }} />
        <SheetBtn danger icon={<IconTrash />} label={t('browse.deleteCat')} sub={t('browse.deleteCatSub')}
          onClick={() => { setMenu(false); setDelConfirm(true); }} />
      </Sheet>

      {/* 二维码标签 */}
      <Sheet open={qrSheet} onClose={() => setQrSheet(false)} title={t('browse.qrLabel')}>
        {qrUrl && <img src={qrUrl} className="w-48 h-48 mx-auto rounded-xl" />}
        <p className="text-xs text-gray-400 text-center mt-2 mb-3">{t('browse.qrLabelDesc')}</p>
        <button onClick={shareQr}
          className="w-full py-3 rounded-xl bg-brand-600 text-white text-[15px] font-medium active:bg-brand-700">
          {t('browse.shareQr')}
        </button>
      </Sheet>

      {/* 封面图来源 */}
      <Sheet open={coverSheet} onClose={() => setCoverSheet(false)} title={t('browse.setCover')}>
        <SheetBtn icon={<IconCamera />} label={t('common.camera')} onClick={() => { setCoverSheet(false); pickCover('camera'); }} />
        <SheetBtn icon={<IconImage />} label={t('common.gallery')} onClick={() => { setCoverSheet(false); pickCover('photos'); }} />
      </Sheet>

      <CategoryPicker open={batchMoveOpen} onClose={() => setBatchMoveOpen(false)}
        title={t('picker.moveTo')} onPick={batchMove} />
      <Confirm open={batchDelConfirm} danger title={t('browse.deleteCatTitle')}
        desc={t('browse.deletedN', { count: selected.size })} okText={t('common.delete')}
        onCancel={() => setBatchDelConfirm(false)} onOk={batchDelete} />

      <NameDialog open={newCatOpen} title={t('browse.newCategory')} placeholder={t('browse.newCatPlaceholder')}
        onCancel={() => setNewCatOpen(false)}
        onOk={(n) => { setNewCatOpen(false); createCategory(n); }} />
      <NameDialog open={renaming} title={t('browse.rename')} initial={current?.name}
        onCancel={() => setRenaming(false)}
        onOk={(n) => { setRenaming(false); renameCategory(n); }} />
      <Confirm open={delConfirm} danger title={t('browse.deleteCatTitle')}
        desc={t('browse.deleteCatDesc', { name: current?.name ?? '' })}
        okText={t('common.delete')} onCancel={() => setDelConfirm(false)} onOk={removeCategory} />
    </div>
  );
}

/** 目录移动行：内嵌 CategoryPicker */
function MoveCategoryRow({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  return (
    <>
      <SheetBtn icon={<IconMove />} label={t('browse.moveTo')}
        onClick={() => setOpen(true)} />
      <CategoryPicker
        open={open}
        excludeId={id}
        onClose={() => setOpen(false)}
        onPick={async (target) => {
          if (target === id) { toast(t('browse.cantMoveSelf')); return; }
          await db.categories.update(id, { parentId: target });
          setOpen(false);
          onDone();
        }} />
    </>
  );
}

/** 名称输入弹窗（新建/重命名通用） */
export function NameDialog({ open, title, placeholder, initial, onOk, onCancel }: {
  open: boolean; title: string; placeholder?: string; initial?: string;
  onOk: (name: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState('');
  const { t } = useTranslation();
  useEffect(() => {
    if (open) setVal(initial ?? '');
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-8" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && val.trim() && onOk(val)}
          placeholder={placeholder} className={inputCls} />
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-[15px] font-medium">{t('common.cancel')}</button>
          <button onClick={() => val.trim() && onOk(val)} disabled={!val.trim()}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-[15px] font-medium disabled:opacity-40">{t('common.ok')}</button>
        </div>
      </div>
    </div>
  );
}
