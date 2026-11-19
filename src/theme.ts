import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'wugui.theme';

const media = window.matchMedia?.('(prefers-color-scheme: dark)');

export function currentTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

function resolved(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return media?.matches ? 'dark' : 'light';
}

/** 状态栏颜色跟随有效主题：与顶栏（白 / gray-900）无缝衔接 */
function syncStatusBar(dark: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  // Capacitor 命名以状态栏背景为准：Light = 深色图标（浅底），Dark = 浅色图标（深底）
  StatusBar.setBackgroundColor({ color: dark ? '#111827' : '#ffffff' }).catch(() => {});
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

export function applyTheme(t: Theme) {
  const dark = resolved(t) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  syncStatusBar(dark);
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

export function initTheme() {
  applyTheme(currentTheme());
  media?.addEventListener?.('change', () => {
    if (currentTheme() === 'system') applyTheme('system');
  });
}
