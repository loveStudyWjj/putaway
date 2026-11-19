import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, pathOf, deleteItem, restoreDeleted, getItemImages, expiryDaysLeft, buildSearchText, invalidateItemsCache } from '../db';
import { cancelExpiry } from '../notify';
import type { Item, Category } from '../types';
import { useNav, useToast, useDataVersion } from '../store';
import { CategoryPicker } from '../CategoryPicker';
import {
  TopBar, IconBtn, IconDots, IconEdit, IconTrash, IconMove, IconBox, IconPin, IconUser, IconClock,
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
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';

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

  if (!item) return <div className="min-h-screen bg-white dark:bg-gray-950" />;

  const attrs = Object.entries(item.attributes);
  const daysLeft = expiryDaysLeft(item);

  const expiryLine = () => {
    if (daysLeft === null) return null;
    const cls = daysLeft < 0 ? 'text-red-500' : daysLeft <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400';
    const text =
      daysLeft < 0 ? t('detail.expiredDays', { days: -daysLeft })
      : daysLeft === 0 ? t('detail.expiryToday')
      : t('detail.expiryInDays', { days: daysLeft });
    return (
      <p className={`mt-2 flex items-center gap-1.5 text-sm ${cls}`}>
        <IconClock className="w-4 h-4" /> {item.expiryDate} · {text}
      </p>
    );
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setCurImg(Math.round(el.scrollLeft / el.clientWidth));
  };

  const markReturned = async () => {
    const next = { ...item, lentTo: undefined, lentAt: undefined };
    await db.items.update(item.id, {
      lentTo: undefined, lentAt: undefined,
      searchText: buildSearchText(next), updatedAt: Date.now(),
    });
    invalidateItemsCache();
    bump();
    toast(t('detail.returned'));
  };

  const searchTag = (tag: string) => nav.push({ name: 'search', q: tag });

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 pb-[calc(6rem+env(safe-area-inset-bottom))]">
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
        <div className="w-full h-44 bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-gray-200 dark:text-gray-700">
          <IconBox className="w-16 h-16" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-snug">{item.name}</h2>
          {item.quantity > 1 && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-500 text-sm font-medium">
              ×{item.quantity}
            </span>
          )}
        </div>

        <button onClick={() => nav.push({ name: 'browse', categoryId: item.categoryId })}
          className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-500 active:opacity-60">
          <IconPin className="w-4 h-4" /> {pathTextJoin(path) || t('common.root')}
        </button>

        {/* 借出状态 */}
        {item.lentTo && (
          <div className="mt-3 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
            <IconUser className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              {t('detail.lentTo', { name: item.lentTo })}
              {item.lentAt && (
                <span className="text-amber-500/80 text-xs">
                  {t('detail.lentAt', { time: new Date(item.lentAt).toLocaleDateString(locale) })}
                </span>
              )}
            </span>
            <button onClick={markReturned} className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500 text-white active:opacity-70">
              {t('detail.returned')}
            </button>
          </div>
        )}

        {expiryLine()}

        {item.description && (
          <p className="mt-4 text-[15px] text-gray-600 dark:text-gray-300 leading-relaxed">{item.description}</p>
        )}

        {attrs.length > 0 && (
          <div className="mt-5">
            <p className="text-[13px] font-medium text-gray-400 mb-2">{t('detail.attributes')}</p>
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              {attrs.map(([k, val], i) => (
                <div key={k} className={`flex px-4 py-3 ${i % 2 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/60 dark:bg-gray-800/60'}`}>
                  <span className="w-24 shrink-0 text-sm text-gray-400">{k}</span>
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {item.tags.map((t) => (
              <button key={t} onClick={() => searchTag(t)}
                className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[13px] text-gray-600 dark:text-gray-300 active:bg-brand-50 active:text-brand-600">
                #{t}
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-gray-300 dark:text-gray-600">
          {t('detail.updatedAt', { time: new Date(item.updatedAt).toLocaleString(locale) })}
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-100 dark:border-gray-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2.5">
        <button onClick={() => setMoveOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-[15px] font-medium active:bg-gray-200">
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
          invalidateItemsCache();
          setMoveOpen(false);
          bump();
          toast(t('detail.moved'));
        }} />

      <Confirm open={delConfirm} danger title={t('detail.deleteTitle')}
        desc={t('detail.deleteDesc', { name: item.name })} okText={t('common.delete')}
        onCancel={() => setDelConfirm(false)}
        onOk={async () => {
          const snap = await deleteItem(item);
          cancelExpiry(item.id);
          bump();
          nav.pop();
          toast(t('detail.deleted'), {
            label: t('common.undo'),
            onClick: async () => { await restoreDeleted(snap); bump(); },
          });
        }} />
    </div>
  );
}

function pathTextJoin(path: Category[]) {
  return path.map((c) => c.name).join(' / ');
}
