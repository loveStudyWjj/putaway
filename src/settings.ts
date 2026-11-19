export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const KEY = 'wugui.ai.settings';

// AI 配置只存在本机 localStorage（设置页填写），不内置任何接口地址/密钥/模型
export function loadSettings(): AiSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      baseUrl: String(saved.baseUrl ?? ''),
      apiKey: String(saved.apiKey ?? ''),
      model: String(saved.model ?? ''),
    };
  } catch {
    return { baseUrl: '', apiKey: '', model: '' };
  }
}

export function saveSettings(s: AiSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export interface NotifySettings {
  /** 'HH:MM' 24 小时制 */
  time: string;
  /** 到期前多少天提醒（0 = 当天） */
  days: number[];
}

const NKEY = 'wugui.notify.settings';
export const NOTIFY_DAY_OPTIONS = [30, 7, 1, 0];

export function loadNotifySettings(): NotifySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(NKEY) || '{}');
    const days = Array.isArray(saved.days)
      ? saved.days.filter((d: unknown) => NOTIFY_DAY_OPTIONS.includes(d as number))
      : [...NOTIFY_DAY_OPTIONS];
    return { time: /^[0-2]\d:[0-5]\d$/.test(saved.time ?? '') ? saved.time : '09:00', days };
  } catch {
    return { time: '09:00', days: [...NOTIFY_DAY_OPTIONS] };
  }
}

export function saveNotifySettings(s: NotifySettings) {
  localStorage.setItem(NKEY, JSON.stringify(s));
}
