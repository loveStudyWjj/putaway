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
