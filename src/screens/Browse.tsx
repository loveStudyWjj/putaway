import React, { useEffect, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import {
  db, childrenOf, itemsIn, pathOf, deleteCategoryCascade, descendantIds, uid,
  setCategoryImage, removeCategoryImage,
} from '../db';
import { compressImage } from '../image';
import type { Category, Item } from '../types';
import { useNav, useToast, useDataVersion } from '../store';
import {
  TopBar, IconBtn, IconPlus, IconDots, IconFolder, IconBox, IconCamera,
  Sheet, SheetBtn, Confirm, Empty, BottomNav, IconEdit, IconTrash, IconMove, IconImage, inputCls,
} from '../ui';
import { CategoryPicker } from '../CategoryPicker';

export function BrowseScreen({ categoryId }: { categoryId: string }) {
  const nav = useNav();
  const { toast } = useToast();
  const { v, bump } = useDataVersion();

  const [path, setPath] = useState<Category[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
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

  const isRoot = !categoryId;
  const current = path[path.length - 1];

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
      // 物品缩略图（取第一张照片）
      const urls: Record<string, string> = {};
      const firstIds = it.map((i) => i.imageIds[0]).filter(Boolean);
      const recs = await db.images.bulkGet(firstIds);
      it.forEach((item) => {
        const fid = item.imageIds[0];
        if (fid) {
          const rec = recs.find((r) => r?.id === fid);
          if (rec) urls[item.id] = URL.createObjectURL(rec.blob);
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
          const rec = catImgs.find((r) => r?.id === cat.imageId);
          if (rec) curl[cat.id] = URL.createObjectURL(rec.blob);
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
    toast(`已创建「${n}」`);
  };

  const renameCategory = async (name: string) => {
    const n = name.trim();
    if (!n || !current) return;
    await db.categories.update(current.id, { name: n });
    bump();
    toast('已重命名');
  };

  const removeCategory = async () => {
    await deleteCategoryCascade(categoryId);
    bump();
    toast('已删除');
    nav.pop();
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
      if (e?.message && !/cancel/i.test(e.message)) toast(`打开失败：${e.message}`);
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
      const blob = await compressImage(new Blob([arr], { type: `image/${photo.format || 'jpeg'}` }), 512);
      await setCategoryImage(categoryId, blob);
      bump();
      toast('已设置封面');
    } catch (e: any) {
      if (e?.message && !/cancel/i.test(e.message)) toast(`打开失败：${e.message}`);
    }
  };

  const clearCover = async () => {
    await removeCategoryImage(categoryId);
    bump();
    toast('已移除封面');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopBar
        title={isRoot ? '物归处' : current?.name ?? ''}
        sub={!isRoot ? path.map((c) => c.name).join('/') : undefined}
        onBack={isRoot ? undefined : nav.pop}
        right={
          <>
            <IconBtn label="新建目录" onClick={() => setNewCatOpen(true)}>
              <div className="relative">
                <IconFolder />
                <IconPlus className="w-3 h-3 absolute -right-0.5 -bottom-0.5 text-brand-600" />
              </div>
            </IconBtn>
            {!isRoot && (
              <IconBtn label="目录选项" onClick={() => setMenu(true)}>
                <IconDots />
              </IconBtn>
            )}
          </>
        }
      />

      {/* 面包屑 */}
      {path.length > 1 && (
        <div className="px-4 pt-3 flex items-center gap-1 text-xs text-gray-400 overflow-x-auto whitespace-nowrap">
          <button className="active:text-brand-600" onClick={() => nav.reset()}>首页</button>
          {path.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span>/</span>
              <span className={i === path.length - 1 ? 'text-gray-600 font-medium' : ''}>{c.name}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <Empty title="加载中…" />
      ) : cats.length === 0 && items.length === 0 ? (
        <Empty
          title={isRoot ? '开始整理你的物品吧' : '这里是空的'}
          desc={isRoot ? '先创建一个目录，比如「卧室」「书房」，再把物品放进去' : '点击下方按钮添加物品或子目录'}
        />
      ) : (
        <div className="px-4 py-3">
          {cats.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 mb-2 mt-1">目录</p>
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {cats.map((c) => (
                  <button key={c.id}
                    onClick={() => nav.push({ name: 'browse', categoryId: c.id })}
                    className="flex items-center gap-3 bg-white rounded-2xl p-3.5 shadow-sm active:scale-[0.98] transition-transform text-left">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 overflow-hidden">
                      {catImgUrls[c.id]
                        ? <img src={catImgUrls[c.id]} className="w-full h-full object-cover" />
                        : <IconFolder />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{counts[c.id] ?? 0} 件物品</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {items.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 mb-2 mt-1">物品</p>
              <div className="grid grid-cols-3 gap-2.5">
                {items.map((it) => (
                  <button key={it.id}
                    onClick={() => nav.push({ name: 'item', itemId: it.id })}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.97] transition-transform text-left">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center text-gray-300">
                      {imgUrls[it.id]
                        ? <img src={imgUrls[it.id]} className="w-full h-full object-cover" />
                        : <IconBox className="w-8 h-8" />}
                    </div>
                    <div className="p-2">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{it.name}</p>
                      {it.quantity > 1 && <p className="text-[11px] text-gray-400">×{it.quantity}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 添加物品 FAB */}
      <button onClick={() => setAddSheet(true)}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 flex items-center justify-center active:scale-95 transition-transform">
        <IconPlus className="w-7 h-7" />
      </button>

      <BottomNav active="home"
        onHome={() => nav.reset()}
        onSearch={() => nav.push({ name: 'search' })}
        onSettings={() => nav.push({ name: 'settings' })} />

      {/* 添加方式 */}
      <Sheet open={addSheet} onClose={() => setAddSheet(false)} title="添加物品">
        <SheetBtn icon={<IconCamera />} label="拍照识别" sub="拍照后 AI 自动填写物品信息"
          onClick={() => { setAddSheet(false); pickPhoto('camera'); }} />
        <SheetBtn icon={<IconImage />} label="从相册选择" sub="上传图片让 AI 识别"
          onClick={() => { setAddSheet(false); pickPhoto('photos'); }} />
        <SheetBtn icon={<IconEdit />} label="手动填写"
          onClick={() => { setAddSheet(false); nav.push({ name: 'itemForm', categoryId }); }} />
      </Sheet>

      {/* 当前目录操作 */}
      <Sheet open={menu} onClose={() => setMenu(false)} title={current?.name}>
        <SheetBtn icon={<IconEdit />} label="重命名目录" onClick={() => { setMenu(false); setRenaming(true); }} />
        <SheetBtn icon={<IconImage />} label="设置封面图" sub="在父级目录中显示"
          onClick={() => { setMenu(false); setCoverSheet(true); }} />
        {current?.imageId && (
          <SheetBtn icon={<IconTrash />} label="移除封面图"
            onClick={() => { setMenu(false); clearCover(); }} />
        )}
        <MoveCategoryRow id={categoryId} onDone={() => { setMenu(false); bump(); toast('已移动'); }} />
        <SheetBtn danger icon={<IconTrash />} label="删除目录" sub="子目录和物品将一并删除"
          onClick={() => { setMenu(false); setDelConfirm(true); }} />
      </Sheet>

      {/* 封面图来源 */}
      <Sheet open={coverSheet} onClose={() => setCoverSheet(false)} title="设置封面图">
        <SheetBtn icon={<IconCamera />} label="拍照" onClick={() => { setCoverSheet(false); pickCover('camera'); }} />
        <SheetBtn icon={<IconImage />} label="从相册选择" onClick={() => { setCoverSheet(false); pickCover('photos'); }} />
      </Sheet>

      <NameDialog open={newCatOpen} title="新建目录" placeholder="例如：卧室 / 数码配件"
        onCancel={() => setNewCatOpen(false)}
        onOk={(n) => { setNewCatOpen(false); createCategory(n); }} />
      <NameDialog open={renaming} title="重命名目录" initial={current?.name}
        onCancel={() => setRenaming(false)}
        onOk={(n) => { setRenaming(false); renameCategory(n); }} />
      <Confirm open={delConfirm} danger title="删除这个目录？"
        desc={`「${current?.name ?? ''}」及其所有子目录、物品、照片都会被删除，不可恢复。`}
        okText="删除" onCancel={() => setDelConfirm(false)} onOk={removeCategory} />
    </div>
  );
}

/** 目录移动行：内嵌 CategoryPicker */
function MoveCategoryRow({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  return (
    <>
      <SheetBtn icon={<IconMove />} label="移动到…"
        onClick={() => setOpen(true)} />
      <CategoryPicker
        open={open}
        excludeId={id}
        onClose={() => setOpen(false)}
        onPick={async (target) => {
          if (target === id) { toast('不能移动到自身'); return; }
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
  useEffect(() => {
    if (open) setVal(initial ?? '');
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-8" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && val.trim() && onOk(val)}
          placeholder={placeholder} className={inputCls} />
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium">取消</button>
          <button onClick={() => val.trim() && onOk(val)} disabled={!val.trim()}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-[15px] font-medium disabled:opacity-40">确定</button>
        </div>
      </div>
    </div>
  );
}
