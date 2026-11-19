import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, pathText, searchItems } from '../db';
import type { Item } from '../types';
import { useNav } from '../store';
import { TopBar, IconSearch, IconBox, IconPin, IconClose, Empty, BottomNav } from '../ui';

// 模块级记忆上次搜索词：进详情页返回后恢复搜索状态
let lastQuery = '';

export function SearchScreen() {
  const nav = useNav();
  const { t } = useTranslation();
  const [q, setQ] = useState(lastQuery);
  const [results, setResults] = useState<Item[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      lastQuery = q;
      const kw = q.trim();
      if (!kw) { setResults([]); setSearched(false); return; }
      const list = await searchItems(kw);
      setResults(list);
      setSearched(true);
      const p: Record<string, string> = {};
      await Promise.all(list.map(async (it) => { p[it.id] = await pathText(it.categoryId); }));
      setPaths(p);
      const recs = await db.images.bulkGet(list.map((i) => i.imageIds[0]).filter(Boolean));
      const urls: Record<string, string> = {};
      for (const it of list) {
        const rec = recs.find((r) => r?.id === it.imageIds[0]);
        if (it.imageIds[0] && rec) urls[it.id] = URL.createObjectURL(rec.blob);
      }
      setImgUrls((old) => {
        Object.values(old).forEach((u) => URL.revokeObjectURL(u));
        return urls;
      });
    }, 250);
  }, [q]);

  useEffect(() => () => {
    Object.values(imgUrls).forEach((u) => URL.revokeObjectURL(u));
  }, [imgUrls]);

  return (
    <div className="min-h-screen bg-gray-50 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <TopBar title={t('search.title')} onBack={nav.pop} />

      <div className="p-4">
        <div className="relative">
          <IconSearch className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full bg-white border border-gray-200 rounded-2xl pl-11 pr-10 py-3 text-[15px] outline-none focus:border-brand-500 placeholder:text-gray-300"
          />
          {q && (
            <button onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center active:bg-gray-200">
              <IconClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4">
        {!searched ? (
          <Empty icon={<IconSearch className="w-16 h-16" />} title={t('search.hint')}
            desc={t('search.hintDesc')} />
        ) : results.length === 0 ? (
          <Empty title={t('search.noResult', { q })} />
        ) : (
          <div className="space-y-2">
            {results.map((it) => (
              <button key={it.id} onClick={() => nav.push({ name: 'item', itemId: it.id })}
                className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 shadow-sm active:scale-[0.99] transition-transform text-left">
                <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center text-gray-300 shrink-0">
                  {imgUrls[it.id]
                    ? <img src={imgUrls[it.id]} className="w-full h-full object-cover" />
                    : <IconBox className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-gray-800 truncate">
                    {it.name}
                    {it.quantity > 1 && <span className="text-gray-400 text-sm"> ×{it.quantity}</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-0.5">
                    <IconPin className="w-3 h-3 shrink-0" /> {paths[it.id] ?? t('common.root')}
                  </p>
                  {it.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{it.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="search"
        onHome={() => nav.reset()}
        onSearch={() => {}}
        onSettings={() => nav.replace({ name: 'settings' })} />
    </div>
  );
}
