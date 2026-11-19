import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import App from './App';
import './i18n';
import { initTheme } from './theme';
import './index.css';

initTheme();

if (Capacitor.isNativePlatform()) {
  // 状态栏样式/背景色由 theme.ts 随主题统一设置
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
} else if ('serviceWorker' in navigator) {
  // 浏览器/PWA 模式：注册离线缓存
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
