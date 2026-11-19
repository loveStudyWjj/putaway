import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export type Screen =
  | { name: 'browse'; categoryId: string }
  | { name: 'itemForm'; itemId?: string; categoryId?: string; autoCapture?: boolean }
  | { name: 'item'; itemId: string }
  | { name: 'search' }
  | { name: 'settings' };

/** 栈内条目：带唯一 _k，保证每次 push 都是新组件实例（隐藏页保活、重进页全新） */
type StackEntry = Screen & { _k?: number };
let seq = 0;

const ROOT: Screen = { name: 'browse', categoryId: '' };

interface NavCtx {
  stack: StackEntry[];
  top: Screen;
  push: (s: Screen) => void;
  pop: () => void;
  replace: (s: Screen) => void;
  reset: (s?: Screen) => void;
}

const Nav = createContext<NavCtx>(null as any);
const Toast = createContext<{ toast: (msg: string) => void }>(null as any);
const Data = createContext<{ v: number; bump: () => void }>(null as any);

export const useNav = () => useContext(Nav);
export const useToast = () => useContext(Toast);
export const useDataVersion = () => useContext(Data);

export function Providers({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<StackEntry[]>([ROOT]);
  const [v, setV] = useState(0);
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const push = useCallback((s: Screen) => setStack((st) => [...st, { ...s, _k: ++seq }]), []);
  const pop = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const replace = useCallback((s: Screen) => setStack((st) => [...st.slice(0, -1), s]), []);
  const reset = useCallback((s: Screen = ROOT) => setStack([s]), []);
  const bump = useCallback(() => setV((x) => x + 1), []);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2500);
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
            <div className="fixed left-1/2 bottom-[calc(6rem+env(safe-area-inset-bottom))] -translate-x-1/2 z-[90] bg-gray-900/90 text-white text-sm px-4 py-2.5 rounded-full shadow-lg max-w-[85vw] text-center">
              {msg}
            </div>
          )}
        </Data.Provider>
      </Toast.Provider>
    </Nav.Provider>
  );
}
