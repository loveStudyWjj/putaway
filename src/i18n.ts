import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh';
import en from './locales/en';

export type Lang = 'zh' | 'en';
const LANG_KEY = 'wugui.lang';

const saved = localStorage.getItem(LANG_KEY);
const sys: Lang = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const initial: Lang = saved === 'zh' || saved === 'en' ? saved : sys;

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export function setLanguage(l: Lang) {
  localStorage.setItem(LANG_KEY, l);
  i18n.changeLanguage(l);
}

export function currentLang(): Lang {
  return i18n.language?.startsWith('zh') ? 'zh' : 'en';
}

export default i18n;
