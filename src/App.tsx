import React from 'react';
import { useTranslation } from 'react-i18next';
import { Providers, useNav } from './store';
import type { Screen } from './store';
import { BrowseScreen } from './screens/Browse';
import { ItemFormScreen } from './screens/ItemForm';
import { ItemDetailScreen } from './screens/ItemDetail';
import { SearchScreen } from './screens/Search';
import { SettingsScreen } from './screens/Settings';
import { QrScanScreen } from './screens/QrScan';
import { TrashScreen } from './screens/Trash';
import { LogsScreen } from './screens/Logs';
import { Onboarding } from './screens/Onboarding';

function ScreenView({ s }: { s: Screen }) {
  switch (s.name) {
    case 'browse':
      return <BrowseScreen key={s.categoryId} categoryId={s.categoryId} />;
    case 'itemForm':
      return <ItemFormScreen key={s.itemId ?? `new-${s.categoryId}`} itemId={s.itemId} categoryId={s.categoryId} />;
    case 'item':
      return <ItemDetailScreen key={s.itemId} itemId={s.itemId} />;
    case 'search':
      return <SearchScreen initialQuery={s.q} />;
    case 'qrscan':
      return <QrScanScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'trash':
      return <TrashScreen />;
    case 'logs':
      return <LogsScreen />;
  }
}

// 全栈渲染：非栈顶页面 display:none 保活——返回时状态（输入/结果/滚动位置）原样保留
function Router() {
  const { stack } = useNav();
  return (
    <>
      {stack.map((s, i) => (
        <div key={s._k ?? i} style={{ display: i === stack.length - 1 ? 'contents' : 'none' }}>
          <ScreenView s={s} />
        </div>
      ))}
    </>
  );
}

/** 顶层渲染兜底：页面异常不至于白屏，可一键回首页 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err?: Error }> {
  state = { err: undefined as Error | undefined };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) return <ErrorFallback onRestart={() => this.setState({ err: undefined })} />;
    return this.props.children;
  }
}

function ErrorFallback({ onRestart }: { onRestart: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-4 p-8">
      <p className="text-gray-700 dark:text-gray-200 font-medium">{t('error.title')}</p>
      <button
        onClick={() => {
          onRestart();
          location.reload();
        }}
        className="px-6 py-3 rounded-xl bg-brand-600 text-white text-sm font-medium">
        {t('error.restart')}
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <Router />
        <Onboarding />
      </Providers>
    </ErrorBoundary>
  );
}
