import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const KEY = 'wugui.onboarded';
export const needOnboarding = () => !localStorage.getItem(KEY);
const done = () => localStorage.setItem(KEY, '1');

/** 首次使用引导：3 步图文，跳过/完成都写标记 */
export function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(needOnboarding);
  if (!show) return null;
  const slides = [
    { t: t('onboard.s1t'), d: t('onboard.s1d'), icon: '📦' },
    { t: t('onboard.s2t'), d: t('onboard.s2d'), icon: '📷' },
    { t: t('onboard.s3t'), d: t('onboard.s3d'), icon: '🔍' },
  ];
  const s = slides[step];
  const finish = () => { done(); setShow(false); };
  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col items-center justify-center p-8">
      <button className="absolute top-4 right-5 text-sm text-gray-400" onClick={finish}>{t('onboard.skip')}</button>
      <div className="text-7xl mb-8">{s.icon}</div>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3 text-center">{s.t}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs leading-relaxed">{s.d}</p>
      <div className="flex gap-1.5 mt-10">
        {slides.map((_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${i === step ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`} />
        ))}
      </div>
      <button className="mt-8 px-10 py-3 rounded-xl bg-brand-600 text-white text-sm font-medium"
        onClick={() => (step < 2 ? setStep(step + 1) : finish())}>
        {step < 2 ? t('onboard.next') : t('onboard.done')}
      </button>
    </div>
  );
}
