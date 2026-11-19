import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** 轻触反馈（web 端静默跳过） */
export function haptic(kind: 'light' | 'medium' | 'success' = 'light') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (kind === 'success') void Haptics.notification({ type: NotificationType.Success });
    else void Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch { /* noop */ }
}
