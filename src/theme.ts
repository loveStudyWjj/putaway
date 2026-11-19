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

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', resolved(t) === 'dark');
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
