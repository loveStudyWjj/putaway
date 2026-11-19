import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { loadSettings, saveSettings } from '../settings';
import { setLanguage, type Lang } from '../i18n';
import { db, exportData, importData } from '../db';
import { useNav, useToast, useDataVersion } from '../store';
import {
  TopBar, Field, inputCls, BottomNav, Confirm, IconSparkle, IconBox, Empty,
} from '../ui';

export function SettingsScreen() {
  const nav = useNav();
  const { toast } = useToast();
  const { bump } = useDataVersion();
  const { t, i18n } = useTranslation();
  const [s, setS] = useState(loadSettings());
  const [clearConfirm, setClearConfirm] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    saveSettings({ baseUrl: s.baseUrl.trim(), apiKey: s.apiKey.trim(), model: s.model.trim() });
    toast(t('settings.saved'));
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const json = await exportData();
      const fileName = `${t('settings.backupFileName')}-${new Date().toISOString().slice(0, 10)}.json`;
      if (Capacitor.isNativePlatform()) {
        const res = await Filesystem.writeFile({
          path: fileName, data: json,
          directory: Directory.Documents, encoding: Encoding.UTF8,
        });
        await Share.share({ title: t('settings.backupFileName'), url: res.uri });
        toast(t('settings.exportedDoc'));
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = fileName;
        a.click();
        toast(t('settings.exported'));
      }
    } catch (e: any) {
      toast(t('settings.exportFailed', { msg: e?.message ?? e }));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await importData(importText);
      bump();
      toast(t('settings.imported', { cats: r.cats, items: r.items }));
      setImportConfirm(false);
    } catch (e: any) {
      toast(t('settings.importFailed', { msg: e?.message ?? e }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <TopBar title={t('settings.title')} onBack={nav.pop} />

      <div className="p-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <Field label={t('settings.language')}>
            <div className="flex gap-2">
              {(['zh', 'en'] as Lang[]).map((l) => (
                <button key={l} onClick={() => setLanguage(l)}
                  className={`flex-1 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${
                    i18n.language.startsWith(l) ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                  }`}>
                  {l === 'zh' ? '中文' : 'English'}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <div className="flex items-center gap-2 mb-3">
            <IconSparkle className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">{t('settings.aiTitle')}</h2>
          </div>
          <Field label={t('settings.baseUrl')}>
            <input className={inputCls} value={s.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => setS({ ...s, baseUrl: e.target.value })} />
          </Field>
          <Field label={t('settings.apiKey')}>
            <input className={inputCls} type="password" value={s.apiKey}
              placeholder="sk-..."
              onChange={(e) => setS({ ...s, apiKey: e.target.value })} />
          </Field>
          <Field label={t('settings.model')}>
            <input className={inputCls} value={s.model}
              placeholder={t('settings.modelPlaceholder')}
              onChange={(e) => setS({ ...s, model: e.target.value })} />
          </Field>
          <button onClick={save}
            className="w-full py-3 rounded-xl bg-brand-600 text-white text-[15px] font-medium active:bg-brand-700">
            {t('settings.save')}
          </button>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            {t('settings.aiNote')}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <div className="flex items-center gap-2 mb-3">
            <IconBox className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">{t('settings.backup')}</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={doExport} disabled={busy}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium active:bg-gray-200 disabled:opacity-50">
              {t('settings.export')}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium active:bg-gray-200 disabled:opacity-50">
              {t('settings.import')}
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setImportText(await f.text());
                setImportConfirm(true);
              }} />
          </div>
          <button onClick={() => setClearConfirm(true)}
            className="w-full mt-3 py-3 rounded-xl border border-red-100 text-red-500 text-[15px] font-medium active:bg-red-50">
            {t('settings.clearAll')}
          </button>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">
          {t('settings.footer')}
        </p>
      </div>

      <Confirm open={importConfirm} title={t('settings.importTitle')}
        desc={t('settings.importDesc')} okText={t('settings.importOk')}
        onCancel={() => setImportConfirm(false)} onOk={doImport} />
      <Confirm open={clearConfirm} danger title={t('settings.clearTitle')}
        desc={t('settings.clearDesc')} okText={t('settings.clearOk')}
        onCancel={() => setClearConfirm(false)}
        onOk={async () => {
          await Promise.all([db.categories.clear(), db.items.clear(), db.images.clear()]);
          bump();
          toast(t('settings.cleared'));
          setClearConfirm(false);
        }} />

      <BottomNav active="settings"
        onHome={() => nav.reset()}
        onSearch={() => nav.replace({ name: 'search' })}
        onSettings={() => {}} />
    </div>
  );
}
