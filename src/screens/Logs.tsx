import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listLogs } from '../db';
import type { LogEntry } from '../types';
import { useNav } from '../store';
import { TopBar, Empty } from '../ui';

const ACTION_LABEL: Record<string, string> = {
  save_item: '保存物品', delete_item: '删除物品', delete_items: '批量删除',
  delete_cat: '删除目录', restore: '恢复删除', move_items: '移动物品',
};

/** 操作记录：最近 100 条写操作 */
export function LogsScreen() {
  const { t, i18n } = useTranslation();
  const nav = useNav();
  const [rows, setRows] = useState<LogEntry[]>([]);
  useEffect(() => { void listLogs(100).then(setRows); }, []);
  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <TopBar title={t('logs.title')} onBack={nav.pop} />
      {rows.length === 0 ? <Empty title={t('logs.empty')} /> : (
        <div className="px-4 space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-baseline gap-2 bg-white dark:bg-gray-900 rounded-lg px-3 py-2">
              <span className="text-[11px] text-gray-400 shrink-0">
                {new Date(r.ts).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-xs font-medium text-brand-600 shrink-0">{ACTION_LABEL[r.action] ?? r.action}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
