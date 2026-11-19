import React from 'react';
import { Providers, useNav } from './store';
import type { Screen } from './store';
import { BrowseScreen } from './screens/Browse';
import { ItemFormScreen } from './screens/ItemForm';
import { ItemDetailScreen } from './screens/ItemDetail';
import { SearchScreen } from './screens/Search';
import { SettingsScreen } from './screens/Settings';

function ScreenView({ s }: { s: Screen }) {
  switch (s.name) {
    case 'browse':
      return <BrowseScreen key={s.categoryId} categoryId={s.categoryId} />;
    case 'itemForm':
      return <ItemFormScreen key={s.itemId ?? `new-${s.categoryId}`} itemId={s.itemId} categoryId={s.categoryId} />;
    case 'item':
      return <ItemDetailScreen key={s.itemId} itemId={s.itemId} />;
    case 'search':
      return <SearchScreen />;
    case 'settings':
      return <SettingsScreen />;
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

export default function App() {
  return (
    <Providers>
      <Router />
    </Providers>
  );
}
