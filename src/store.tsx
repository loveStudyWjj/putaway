import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export type Screen =
  | { name: 'browse'; categoryId: string }
  | { name: 'itemForm'; itemId?: string; categoryId?: string; autoCapture?: boolean }
  | { name: 'item'; itemId: string }
  | { name: 'search'; q?: string }
  | { name: 'qrscan' }
  | { name: 'settings' };

/** 栈内条目：带唯一 _k，保证每次 push 都是新组件实例（隐藏页保活、重进页全新） */
type StackEntry = Screen & { _k?: number };
let seq = 0;

const ROOT: Screen = { name: 'browse', categoryId: '' };
/** 保活栈上限：超过时丢弃根之上的最旧页（防止深导航内存线性增长） */
const MAX_STACK = 12;

interface NavCtx {
  stack: StackEntry[];
  top: Screen;
  push: (s: Screen) => void;
  pop: () => void;
  replace: (s: Screen) => void;
  reset: (s?: Screen) => void;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

const Nav = createContext<NavCtx>(null as any);
const Toast = createContext<{ toast: (msg: string, action?: ToastAction) => void }>(null as any);
const Data = createContext<{ v: number; bump: () => void }>(null as any);

export const useNav = () => useContext(Nav);
export const useToast = () => useContext(Toast);
export const useDataVersion = () => useContext(Data);

export function Providers({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<StackEntry[]>([ROOT]);
  const [v, setV] = useState(0);
  const [msg, setMsg] = useState('');
  const [action, setAction] = useState<ToastAction>();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const push = useCallback(
    (s: Screen) =>
      setStack((st) => {
        const next = [...st, { ...s, _k: ++seq }];
        // 超出上限时移除根目录之上最早的一层（保证返回路径终点仍是首页）
        if (next.length > MAX_STACK) next.splice(1, next.length - MAX_STACK);
        return next;
      }),
    []
  );
  const pop = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const replace = useCallback((s: Screen) => setStack((st) => [...st.slice(0, -1), s]), []);
  const reset = useCallback((s: Screen = ROOT) => setStack([s]), []);
  const bump = useCallback(() => setV((x) => x + 1), []);
  const toast = useCallback((m: string, act?: ToastAction) => {
    setMsg(m);
    setAction(act);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setMsg(''); setAction(undefined); }, act ? 6000 : 2500);
  }, []);

  // 安卓返回键：弹栈，栈空则退出
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      setStack((st) => {
        if (st.length > 1) return st.slice(0, -1);
        CapApp.exitApp();
        return st;
      });
    });
    return () => {
      h.then((l) => l.remove());
    };
  }, []);

  return (
    <Nav.Provider value={{ stack, top: stack[stack.length - 1], push, pop, replace, reset }}>
      <Toast.Provider value={{ toast }}>
        <Data.Provider value={{ v, bump }}>
          {children}
          {msg && (
            <div className="fixed left-1/2 bottom-[calc(6rem+env(safe-area-inset-bottom))] -translate-x-1/2 z-[90] flex items-center gap-3 bg-gray-900/90 text-white text-sm pl-4 pr-2 py-2 rounded-full shadow-lg max-w-[85vw]">
              <span className="truncate">{msg}</span>
              {action && (
                <button
                  onClick={() => {
                    action.onClick();
                    setMsg('');
                    setAction(undefined);
                    clearTimeout(timer.current);
                  }}
                  className="shrink-0 px-3 py-1 rounded-full bg-white/15 text-brand-100 font-medium active:bg-white/25">
                  {action.label}
                </button>
              )}
            </div>
          )}
        </Data.Provider>
      </Toast.Provider>
    </Nav.Provider>
  );
}
