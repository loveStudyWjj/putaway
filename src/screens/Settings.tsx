import React, { useRef, useState } from 'react';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { loadSettings, saveSettings } from '../settings';
import { db, exportData, importData } from '../db';
import { useNav, useToast, useDataVersion } from '../store';
import {
  TopBar, Field, inputCls, BottomNav, Confirm, IconSparkle, IconBox, Empty,
} from '../ui';

export function SettingsScreen() {
  const nav = useNav();
  const { toast } = useToast();
  const { bump } = useDataVersion();
  const [s, setS] = useState(loadSettings());
  const [clearConfirm, setClearConfirm] = useState(false);
  const [importConfirm, setImportConfirm] = useState(false);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    saveSettings({ baseUrl: s.baseUrl.trim(), apiKey: s.apiKey.trim(), model: s.model.trim() });
    toast('设置已保存');
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const json = await exportData();
      const fileName = `物归处备份-${new Date().toISOString().slice(0, 10)}.json`;
      if (Capacitor.isNativePlatform()) {
        const res = await Filesystem.writeFile({
          path: fileName, data: json,
          directory: Directory.Documents, encoding: Encoding.UTF8,
        });
        await Share.share({ title: '物归处备份', url: res.uri });
        toast('已导出到「文档」目录');
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = fileName;
        a.click();
        toast('已导出');
      }
    } catch (e: any) {
      toast(`导出失败：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await importData(importText);
      bump();
      toast(`已恢复 ${r.cats} 个目录、${r.items} 件物品`);
      setImportConfirm(false);
    } catch (e: any) {
      toast(`导入失败：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <TopBar title="设置" onBack={nav.pop} />

      <div className="p-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <IconSparkle className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">AI 识别</h2>
          </div>
          <Field label="接口地址 Base URL">
            <input className={inputCls} value={s.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => setS({ ...s, baseUrl: e.target.value })} />
          </Field>
          <Field label="API Key">
            <input className={inputCls} type="password" value={s.apiKey}
              placeholder="sk-..."
              onChange={(e) => setS({ ...s, apiKey: e.target.value })} />
          </Field>
          <Field label="视觉模型名称">
            <input className={inputCls} value={s.model}
              placeholder="需要支持图片输入的模型"
              onChange={(e) => setS({ ...s, model: e.target.value })} />
          </Field>
          <button onClick={save}
            className="w-full py-3 rounded-xl bg-brand-600 text-white text-[15px] font-medium active:bg-brand-700">
            保存设置
          </button>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            仅「拍照识别」时联网调用接口，其余功能完全离线。模型需支持图片输入（视觉能力）。
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mt-4">
          <div className="flex items-center gap-2 mb-3">
            <IconBox className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">数据备份</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={doExport} disabled={busy}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium active:bg-gray-200 disabled:opacity-50">
              导出备份
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-[15px] font-medium active:bg-gray-200 disabled:opacity-50">
              导入备份
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
            清空全部数据
          </button>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">
          物归处 v1.0 · 数据保存在本机
        </p>
      </div>

      <Confirm open={importConfirm} title="导入备份？"
        desc="将覆盖当前所有目录和物品，确定继续吗？" okText="导入"
        onCancel={() => setImportConfirm(false)} onOk={doImport} />
      <Confirm open={clearConfirm} danger title="清空全部数据？"
        desc="所有目录、物品、照片都会被删除，不可恢复。建议先导出备份。" okText="全部删除"
        onCancel={() => setClearConfirm(false)}
        onOk={async () => {
          await Promise.all([db.categories.clear(), db.items.clear(), db.images.clear()]);
          bump();
          toast('已清空');
          setClearConfirm(false);
        }} />

      <BottomNav active="settings"
        onHome={() => nav.reset()}
        onSearch={() => nav.replace({ name: 'search' })}
        onSettings={() => {}} />
    </div>
  );
}
