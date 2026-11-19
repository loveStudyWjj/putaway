import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, pathOf, deleteItem, getItemImages } from '../db';
import type { Item, Category } from '../types';
import { useNav, useToast, useDataVersion } from '../store';
import { CategoryPicker } from '../CategoryPicker';
import {
  TopBar, IconBtn, IconDots, IconEdit, IconTrash, IconMove, IconBox, IconPin,
  Sheet, SheetBtn, Confirm,
} from '../ui';

export function ItemDetailScreen({ itemId }: { itemId: string }) {
  const nav = useNav();
  const { toast } = useToast();
  const { v, bump } = useDataVersion();
  const { t, i18n } = useTranslation();
  const [item, setItem] = useState<Item | null>(null);
  const [path, setPath] = useState<Category[]>([]);
  const [imgUrls, setImgUrls] = useState<string[]>([]);
  const [curImg, setCurImg] = useState(0);
  const [menu, setMenu] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const it = await db.items.get(itemId);
      if (!it) { toast(t('detail.itemNotFound')); nav.pop(); return; }
      setItem(it);
      setPath(await pathOf(it.categoryId));
      const blobs = await getItemImages(it);
      setImgUrls((old) => {
        old.forEach((u) => URL.revokeObjectURL(u));
        return blobs.map((b) => URL.createObjectURL(b));
      });
      setCurImg(0);
    })();
  }, [itemId, v]);

  useEffect(() => () => {
    imgUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [imgUrls]);

  if (!item) return <div className="min-h-screen bg-white" />;

  const attrs = Object.entries(item.attributes);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setCurImg(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="min-h-screen bg-white pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <TopBar title={item.name} onBack={nav.pop}
        right={<IconBtn label={t('detail.more')} onClick={() => setMenu(true)}><IconDots /></IconBtn>} />

      {imgUrls.length > 0 ? (
        <div className="relative">
          <div ref={scroller} onScroll={onScroll}
            className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth" style={{ scrollbarWidth: 'none' }}>
            {imgUrls.map((u, i) => (
              <img key={i} src={u}
                className="w-full shrink-0 snap-center max-h-80 object-cover" />
            ))}
          </div>
          {imgUrls.length > 1 && (
            <>
              <span className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded-full bg-black/50 text-white text-xs">
                {curImg + 1}/{imgUrls.length}
              </span>
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                {imgUrls.map((_, i) => (
                  <span key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === curImg ? 'bg-white' : 'bg-white/40'}`} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="w-full h-44 bg-gray-50 flex items-center justify-center text-gray-200">
          <IconBox className="w-16 h-16" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900 leading-snug">{item.name}</h2>
          {item.quantity > 1 && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-sm font-medium">
              ×{item.quantity}
            </span>
          )}
        </div>

        <button onClick={() => nav.push({ name: 'browse', categoryId: item.categoryId })}
          className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 active:opacity-60">
          <IconPin className="w-4 h-4" /> {pathTextJoin(path) || t('common.root')}
        </button>

        {item.description && (
          <p className="mt-4 text-[15px] text-gray-600 leading-relaxed">{item.description}</p>
        )}

        {attrs.length > 0 && (
          <div className="mt-5">
            <p className="text-[13px] font-medium text-gray-400 mb-2">{t('detail.attributes')}</p>
            <div className="rounded-2xl border border-gray-100 overflow-hidden">
              {attrs.map(([k, val], i) => (
                <div key={k} className={`flex px-4 py-3 ${i % 2 ? 'bg-white' : 'bg-gray-50/60'}`}>
                  <span className="w-24 shrink-0 text-sm text-gray-400">{k}</span>
                  <span className="flex-1 text-sm text-gray-800">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {item.tags.map((t) => (
              <span key={t} className="px-2.5 py-1 rounded-full bg-gray-100 text-[13px] text-gray-600">
                #{t}
              </span>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-gray-300">
          {t('detail.updatedAt', { time: new Date(item.updatedAt).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US') })}
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2.5">
        <button onClick={() => setMoveOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium active:bg-gray-200">
          <IconMove className="w-5 h-5" /> {t('detail.move')}
        </button>
        <button onClick={() => nav.push({ name: 'itemForm', itemId: item.id })}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-brand-600 text-white text-[15px] font-medium active:bg-brand-700">
          <IconEdit className="w-5 h-5" /> {t('detail.edit')}
        </button>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <SheetBtn danger icon={<IconTrash />} label={t('detail.deleteItem')}
          onClick={() => { setMenu(false); setDelConfirm(true); }} />
      </Sheet>

      <CategoryPicker open={moveOpen} onClose={() => setMoveOpen(false)} title={t('picker.moveTo')}
        onPick={async (id) => {
          if (id === item.categoryId) { setMoveOpen(false); return; }
          await db.items.update(item.id, { categoryId: id, updatedAt: Date.now() });
          setMoveOpen(false);
          bump();
          toast(t('detail.moved'));
        }} />

      <Confirm open={delConfirm} danger title={t('detail.deleteTitle')}
        desc={t('detail.deleteDesc', { name: item.name })} okText={t('common.delete')}
        onCancel={() => setDelConfirm(false)}
        onOk={async () => {
          await deleteItem(item);
          bump();
          toast(t('detail.deleted'));
          nav.pop();
        }} />
    </div>
  );
}

function pathTextJoin(path: Category[]) {
  return path.map((c) => c.name).join(' / ');
}
