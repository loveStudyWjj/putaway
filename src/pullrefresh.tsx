import React, { useEffect, useRef, useState } from 'react';

const TH = 56;   // 触发刷新的阻尼后距离 px
const MAX = 110; // 指示器最大位移
const DAMP = 0.45;

/**
 * 下拉刷新指示器。挂在页面根部即可，内部监听 window 触摸事件。
 * - 仅当所在页面可见（keep-alive 保活页 display:none 时自动失活）
 * - 仅当页面滚动在顶部且有弹层未打开时生效
 * - WCAG 2.5.1：下拉是路径手势，页面必须另有可点按钮执行同一动作（见 TopBar right）
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> | unknown }) {
  const marker = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const st = useRef({ y: 0, on: false, pull: 0 });
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const visible = () => {
      const el = marker.current;
      return !!el && el.offsetParent !== null;
    };
    const scrollEl = () => document.scrollingElement ?? document.documentElement;
    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1 || st.current.on || !visible()) return;
      if (scrollEl().scrollTop > 0 || document.querySelector('dialog[open]')) return;
      st.current.y = e.touches[0].clientY;
      st.current.on = true;
      setDragging(true);
    };
    const move = (e: TouchEvent) => {
      if (!st.current.on) return;
      if (scrollEl().scrollTop > 0) {
        st.current.on = false; st.current.pull = 0; setDragging(false); setPull(0); return;
      }
      const dy = e.touches[0].clientY - st.current.y;
      const p = dy > 0 ? Math.min(dy * DAMP, MAX) : 0;
      st.current.pull = p;
      setPull(p);
      // 拉过一小段后阻止浏览器回弹/滚动干扰（passive:false 才有效）
      if (p > 4 && e.cancelable) e.preventDefault();
    };
    const up = async () => {
      if (!st.current.on) return;
      st.current.on = false;
      setDragging(false);
      const reached = st.current.pull >= TH;
      st.current.pull = 0;
      if (reached) {
        setBusy(true);
        try {
          await Promise.all([cb.current(), new Promise((r) => setTimeout(r, 350))]);
        } finally {
          setBusy(false); setPull(0);
        }
      } else {
        setPull(0);
      }
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);

  const shown = busy ? TH + 10 : pull;
  const over = pull >= TH || busy;
  return (
    <>
      <div ref={marker} className="h-0 w-0" />
      {shown > 0.5 && (
        <div
          aria-hidden
          className={`pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+56px)] z-[60] -translate-x-1/2 ${
            dragging ? '' : 'transition-transform duration-200'
          }`}
          style={{ transform: `translate(-50%, ${shown}px)`, opacity: Math.min(1, shown / TH) }}
        >
          <div className="w-9 h-9 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round"
              className={`w-5 h-5 text-brand-600 dark:text-brand-400 ${
                busy ? 'animate-spin' : 'transition-transform duration-150'
              }`}
              style={busy ? undefined : { transform: `rotate(${over ? 180 : (pull / TH) * 180}deg)` }}
            >
              {busy ? (
                <path d="M21 12a9 9 0 11-9-9" />
              ) : (
                <path d="M12 5v14M5 12l7 7 7-7" />
              )}
            </svg>
          </div>
        </div>
      )}
    </>
  );
}
