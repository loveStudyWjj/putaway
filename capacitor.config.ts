import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wugui.app',
  appName: '物归处',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    // Android 15 强制 edge-to-edge 时，把 WebView 缩进系统栏内
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // 浅色 UI：LIGHT 风格 = 深色状态栏图标（插件命名以状态栏背景为准）
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: false,
    },
  },
};

export default config;
