import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from './i18n';
import type { Item } from './types';

/** item.id → 稳定的 32 位通知 id */
function notifId(itemId: string): number {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) h = (h * 31 + itemId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147480000 || 1;
}

async function ensurePermission(): Promise<boolean> {
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === 'granted') return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

/** 为物品的到期日排一个当天上午 9 点的本地提醒；无到期日/非原生端直接跳过 */
export async function scheduleExpiry(item: Item): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const id = notifId(item.id);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
    if (!item.expiryDate) return;
    const at = new Date(item.expiryDate + 'T09:00:00');
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return;
    if (!(await ensurePermission())) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: i18n.t('notify.expiryTitle'),
          body: i18n.t('notify.expiryBody', { name: item.name }),
          schedule: { at },
        },
      ],
    });
  } catch {
    /* 通知失败不影响保存 */
  }
}

/** 删除物品时取消对应提醒 */
export async function cancelExpiry(itemId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: notifId(itemId) }] });
  } catch { /* ignore */ }
}
