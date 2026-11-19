import React from 'react';

// ---------- 图标（内联 SVG，描边风格） ----------
type Ip = { className?: string };
const I = (d: string | React.ReactNode) =>
  function Icon({ className = 'w-6 h-6' }: Ip) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" className={className}>
        {typeof d === 'string' ? <path d={d} /> : d}
      </svg>
    );
  };

export const IconBack = I('M15 18l-6-6 6-6');
export const IconPlus = I('M12 5v14M5 12h14');
export const IconSearch = I('M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z');
export const IconCamera = I(
  <>
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </>
);
export const IconImage = I(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </>
);
export const IconFolder = I('M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z');
export const IconBox = I(
  <>
    <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
    <path d="M3.3 7.3L12 12l8.7-4.7M12 22V12" />
  </>
);
export const IconDots = I(
  <>
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </>
);
export const IconSettings = I(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </>
);
export const IconClose = I('M18 6L6 18M6 6l12 12');
export const IconEdit = I('M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z');
export const IconTrash = I('M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6');
export const IconHome = I('M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10');
export const IconSparkle = I('M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9zM19 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z');
export const IconMove = I('M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20');
export const IconPin = I('M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0zM15 10a3 3 0 11-6 0 3 3 0 016 0z');

// ---------- 顶栏 ----------
export function TopBar({ title, onBack, right, sub }: {
  title: string; sub?: string; onBack?: () => void; right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center h-14 px-2 gap-1">
        {onBack ? (
          <button onClick={onBack} className="p-2 -ml-1 rounded-full active:bg-gray-100 text-gray-700">
            <IconBack />
          </button>
        ) : (
          <div className="w-10" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate">{title}</h1>
          {sub && <p className="text-xs text-gray-400 truncate -mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-0.5">{right}</div>
      </div>
    </header>
  );
}

export function IconBtn({ onClick, children, label }: {
  onClick: () => void; children: React.ReactNode; label?: string;
}) {
  return (
    <button onClick={onClick} aria-label={label}
      className="p-2 rounded-full active:bg-gray-100 text-gray-600">
      {children}
    </button>
  );
}

// ---------- 底部动作面板 ----------
export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-[slideUp_.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}>
        {title && <p className="text-sm font-medium text-gray-500 mb-2 px-1">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function SheetBtn({ onClick, icon, label, sub, danger }: {
  onClick: () => void; icon?: React.ReactNode; label: string; sub?: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-gray-100 text-left ${danger ? 'text-red-600' : 'text-gray-800'}`}>
      {icon && <span className={danger ? 'text-red-500' : 'text-gray-400'}>{icon}</span>}
      <span className="flex-1">
        <span className="block text-[15px]">{label}</span>
        {sub && <span className="block text-xs text-gray-400 mt-0.5">{sub}</span>}
      </span>
    </button>
  );
}

// ---------- 确认弹窗 ----------
export function Confirm({ open, title, desc, okText = '确定', danger, onOk, onCancel }: {
  open: boolean; title: string; desc?: string; okText?: string; danger?: boolean;
  onOk: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-8" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {desc && <p className="text-sm text-gray-500 mt-2 leading-relaxed">{desc}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium active:bg-gray-200">
            取消
          </button>
          <button onClick={onOk}
            className={`flex-1 py-2.5 rounded-xl text-white text-[15px] font-medium ${danger ? 'bg-red-500 active:bg-red-600' : 'bg-brand-600 active:bg-brand-700'}`}>
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- 空状态 / 加载 ----------
export function Empty({ icon, title, desc }: { icon?: React.ReactNode; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="text-gray-200 mb-3">{icon ?? <IconBox className="w-16 h-16" />}</div>
      <p className="text-gray-500 font-medium">{title}</p>
      {desc && <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">{desc}</p>}
    </div>
  );
}

export function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M12 2a10 10 0 019.54 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- 底部导航 ----------
export function BottomNav({ active, onHome, onSearch, onSettings }: {
  active: 'home' | 'search' | 'settings';
  onHome: () => void; onSearch: () => void; onSettings: () => void;
}) {
  const Btn = ({ on, onClick, icon, label }: any) => (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${on ? 'text-brand-600' : 'text-gray-400'}`}>
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 flex pb-[env(safe-area-inset-bottom)]">
      <Btn on={active === 'home'} onClick={onHome} icon={<IconHome className="w-6 h-6" />} label="首页" />
      <Btn on={active === 'search'} onClick={onSearch} icon={<IconSearch className="w-6 h-6" />} label="搜索" />
      <Btn on={active === 'settings'} onClick={onSettings} icon={<IconSettings className="w-6 h-6" />} label="设置" />
    </nav>
  );
}

// ---------- 表单小组件 ----------
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-medium text-gray-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[15px] text-gray-900 outline-none focus:border-brand-500 focus:bg-white placeholder:text-gray-300';
