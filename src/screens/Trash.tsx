import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTrash, restoreTrash, purgeTrash, emptyTrash, invalidateItemsCache } from '../db';
import type { TrashEntry } from '../types';
import { useNav } from '../store';
import { TopBar, Empty, Confirm, IconTrash } from '../ui';
import { haptic } from '../haptics';

/** 回收站：删除快照列表，可恢复/彻底删除/清空 */
export function TrashScreen() {
  const { t } = useTranslation();
  const nav = useNav();
  const [rows, setRows] = useState<TrashEntry[]>([]);
  const [purge, setPurge] = useState<TrashEntry | null>(null);
  const [emptyAll, setEmptyAll] = useState(false);
  const load = () => listTrash().then(setRows);
  useEffect(() => { void load(); }, []);

  const kindLabel = (e: TrashEntry) =>
    e.kind === 'category' ? t('trash.kindCategory') : e.kind === 'items' ? t('trash.kindItems') : t('trash.kindItem');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <TopBar title={t('trash.title')} onBack={nav.pop} />
      <p className="px-4 py-2 text-xs text-gray-400">{t('trash.hint')}</p>
      {rows.length === 0 ? (
        <Empty title={t('trash.empty')} />
      ) : (
        <div className="px-4 space-y-2">
          {rows.map((e) => (
            <div key={e.id} className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl px-3 py-2.5 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{e.name || '—'}</p>
                <p className="text-[11px] text-gray-400">
                  {kindLabel(e)} · {e.snap.items.length} 件 · {new Date(e.deletedAt).toLocaleDateString()}
                </p>
              </div>
              <button className="text-xs text-brand-600 font-medium px-2 py-1"
                onClick={async () => { await restoreTrash(e.id); invalidateItemsCache(); haptic('success'); void load(); }}>
                {t('trash.restore')}
              </button>
              <button className="text-xs text-red-500 px-2 py-1" onClick={() => setPurge(e)}>
                {t('trash.purge')}
              </button>
            </div>
          ))}
          <button className="w-full text-center text-xs text-red-500 py-3" onClick={() => setEmptyAll(true)}>
            {t('trash.emptyAll')}
          </button>
        </div>
      )}
      <Confirm open={!!purge} title={t('trash.purgeConfirm', { name: purge?.name })} danger
        okText={t('trash.purge')} onOk={async () => { if (purge) await purgeTrash(purge.id); setPurge(null); void load(); }}
        onCancel={() => setPurge(null)} />
      <Confirm open={emptyAll} title={t('trash.emptyConfirm')} danger
        okText={t('trash.emptyAll')} onOk={async () => { await emptyTrash(); setEmptyAll(false); void load(); }}
        onCancel={() => setEmptyAll(false)} />
    </div>
  );
}
