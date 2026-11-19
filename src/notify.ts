import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from './i18n';
import { loadNotifySettings, NOTIFY_DAY_OPTIONS } from './settings';
import { db } from './db';
import type { Item } from './types';

/** item.id + 提前槽位 → 稳定的 32 位通知 id（每物品最多 4 条：30d/7d/1d/当天） */
function notifId(itemId: string, slot: number): number {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) h = (h * 31 + itemId.charCodeAt(i)) | 0;
  return (Math.abs(h) % 500000000) * 4 + slot + 1;
}

const allIds = (itemId: string) =>
  NOTIFY_DAY_OPTIONS.map((_, i) => ({ id: notifId(itemId, i) }));

async function ensurePermission(): Promise<boolean> {
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === 'granted') return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

/** 按设置（提醒时间 + 提前量）为物品排本地提醒；无到期日/非原生端直接跳过 */
export async function scheduleExpiry(item: Item): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: allIds(item.id) });
    if (!item.expiryDate) return;
    const { time, days } = loadNotifySettings();
    if (!days.length) return;
    const now = Date.now();
    const list = NOTIFY_DAY_OPTIONS.map((d, i) => ({ d, id: notifId(item.id, i) }))
      .filter(({ d }) => days.includes(d))
      .map(({ d, id }) => {
        const at = new Date(`${item.expiryDate}T${time}:00`);
        at.setDate(at.getDate() - d);
        if (Number.isNaN(at.getTime()) || at.getTime() <= now) return null;
        return {
          id,
          title: i18n.t('notify.expiryTitle'),
          body:
            d === 0 ? i18n.t('notify.expiryBodyToday', { name: item.name })
            : d === 1 ? i18n.t('notify.expiryBodyTomorrow', { name: item.name })
            : i18n.t('notify.expiryBodyDays', { name: item.name, days: d }),
          schedule: { at },
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
    if (!list.length) return;
    if (!(await ensurePermission())) return;
    await LocalNotifications.schedule({ notifications: list });
  } catch {
    /* 通知失败不影响保存 */
  }
}

/** 删除物品时取消对应提醒 */
export async function cancelExpiry(itemId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: allIds(itemId) });
  } catch { /* ignore */ }
}

/** 提醒设置变更后重排所有物品的提醒 */
export async function rescheduleAllExpiries(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const items = await db.items.filter((it) => !!it.expiryDate).toArray();
    for (const it of items) await scheduleExpiry(it);
  } catch { /* ignore */ }
}
