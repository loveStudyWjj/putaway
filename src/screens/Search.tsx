import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, pathTextFromMap, categoryMap, searchItems, searchCategories, thumbOf } from '../db';
import type { Item, Category } from '../types';
import { useNav } from '../store';
import { setHeroEl } from '../viewnav';
import { TopBar, IconSearch, IconBox, IconPin, IconClose, IconFolder, Empty, BottomNav } from '../ui';

// 模块级记忆上次搜索词：从底部导航重新进搜索页时恢复
let lastQuery = '';

export function SearchScreen({ initialQuery }: { initialQuery?: string }) {
  const nav = useNav();
  const { t } = useTranslation();
  const [q, setQ] = useState(initialQuery ?? lastQuery);
  const [results, setResults] = useState<Item[]>([]);
  const [catResults, setCatResults] = useState<Category[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      lastQuery = q;
      const kw = q.trim();
      if (!kw) { setResults([]); setCatResults([]); setSearched(false); return; }
      const [list, cats, map] = await Promise.all([searchItems(kw), searchCategories(kw), categoryMap()]);
      setResults(list);
      setCatResults(cats);
      setSearched(true);
      // 目录 Map 已在手，内存里拼路径——避免逐条逐层查库
      const p: Record<string, string> = {};
      for (const it of list) p[it.id] = pathTextFromMap(map, it.categoryId);
      for (const c of cats) p[c.id] = pathTextFromMap(map, c.parentId);
      setPaths(p);
      const recs = await db.images.bulkGet(list.map((i) => i.imageIds[0]).filter(Boolean));
      const urls: Record<string, string> = {};
      for (const it of list) {
        const rec = recs.find((r) => r?.id === it.imageIds[0]);
        const blob = thumbOf(rec);
        if (it.imageIds[0] && blob) urls[it.id] = URL.createObjectURL(blob);
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

  const empty = searched && results.length === 0 && catResults.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <TopBar title={t('search.title')} onBack={nav.pop} />

      <div className="p-4">
        <div className="relative">
          <IconSearch className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl pl-11 pr-10 py-3 text-[15px] text-gray-900 dark:text-gray-100 outline-none focus:border-brand-500 placeholder:text-gray-300 dark:placeholder:text-gray-600"
          />
          {q && (
            <button onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 flex items-center justify-center active:bg-gray-200">
              <IconClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-4">
        {!searched ? (
          <Empty icon={<IconSearch className="w-16 h-16" />} title={t('search.hint')}
            desc={t('search.hintDesc')} />
        ) : empty ? (
          <Empty title={t('search.noResult', { q })} />
        ) : (
          <>
            {catResults.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-400 mb-2">{t('search.folders')}</p>
                <div className="space-y-2 mb-4">
                  {catResults.map((c) => (
                    <button key={c.id} onClick={() => nav.push({ name: 'browse', categoryId: c.id })}
                      className="w-full flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-3 shadow-sm active:scale-[0.99] transition-transform text-left">
                      <div className="w-14 h-14 rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 flex items-center justify-center shrink-0">
                        <IconFolder className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-gray-800 dark:text-gray-100 truncate"><Hl text={c.name} q={q} /></p>
                        <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-0.5">
                          <IconPin className="w-3 h-3 shrink-0" /> {paths[c.id] ?? t('common.root')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {results.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-400 mb-2">{t('search.items')}</p>
                <div className="space-y-2">
                  {results.map((it) => (
                    <button key={it.id} onClick={(e) => {
                      setHeroEl(e.currentTarget.querySelector('img'));
                      nav.push({ name: 'item', itemId: it.id });
                    }}
                      className="w-full flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-3 shadow-sm active:scale-[0.99] transition-transform text-left">
                      <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center text-gray-300 dark:text-gray-600 shrink-0">
                        {imgUrls[it.id]
                          ? <img src={imgUrls[it.id]} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                          : <IconBox className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-gray-800 dark:text-gray-100 truncate">
                          <Hl text={it.name} q={q} />
                          {it.quantity > 1 && <span className="text-gray-400 text-sm"> ×{it.quantity}</span>}
                          {it.lentTo && <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-normal">{t('browse.lentBadge')} · {it.lentTo}</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-0.5">
                          <IconPin className="w-3 h-3 shrink-0" /> {paths[it.id] ?? t('common.root')}
                        </p>
                        {it.description && (
                          <p className="text-xs text-gray-400 truncate mt-0.5"><Hl text={it.description} q={q} /></p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <BottomNav active="search"
        onHome={() => nav.reset()}
        onSearch={() => {}}
        onSettings={() => nav.replace({ name: 'settings' })} />
    </div>
  );
}

/** 命中词高亮：把文本中匹配 query 的部分包 <mark> */
function Hl({ text, q }: { text: string; q: string }) {
  const kw = q.trim();
  if (!kw) return <>{text}</>;
  const i = text.toLowerCase().indexOf(kw.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + kw.length)}</mark>
      {text.slice(i + kw.length)}
    </>
  );
}
