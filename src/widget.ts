import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { attentionItems, db } from './db';
import i18n from './i18n';

/** 把关注统计写入 SharedPreferences，桌面 Widget 读取（原生专用） */
export async function pushWidgetStats(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const [a, total] = await Promise.all([attentionItems(), db.items.count()]);
    const text = i18n.t('widget.stats', {
      expired: a.expired.length, soon: a.soon.length, lent: a.lent.length, total,
    });
    await Preferences.set({ key: 'widget_stats', value: text });
  } catch { /* 桌面无 widget 时静默 */ }
}
