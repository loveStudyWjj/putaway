import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import App from './App';
import './i18n';
import { initTheme } from './theme';
import './index.css';

initTheme();

if (Capacitor.isNativePlatform()) {
  // Capacitor 命名以状态栏背景为准：Light = 浅色背景 = 深色图标
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
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
