import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Item, ImageRec } from './types';

// node 环境下 i18n.ts 需要的最小浏览器桩（须在 db 模块加载前就绪，故用动态导入）
(globalThis as any).localStorage ??= {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
(globalThis as any).navigator ??= { language: 'zh-CN' };

const {
  db, uid, childrenOf, itemsIn, ensureCategoryPath, pathTextFromMap, categoryMap,
  descendantIds, saveItem, deleteItem, deleteItems, deleteCategoryCascade, restoreDeleted,
  searchItems, searchCategories, moveItems, recentItems, expiryDaysLeft, expiryState,
  exportData, importData, invalidateItemsCache, buildSearchText,
} = await import('./db');

function makeItem(name: string, categoryId = '', extra: Partial<Item> = {}): Item {
  return {
    id: uid(), name, categoryId, description: '', attributes: {}, tags: [],
    imageIds: [], quantity: 1, createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  };
}

async function clear() {
  await Promise.all([db.categories.clear(), db.items.clear(), db.images.clear()]);
  invalidateItemsCache();
}

beforeEach(clear);

describe('目录树', () => {
  it('ensureCategoryPath 建多层目录并返回末级', async () => {
    const id = await ensureCategoryPath('客厅/柜子/抽屉');
    expect(id).toBeTruthy();
    expect((await childrenOf(''))[0].name).toBe('客厅');
    const map = await categoryMap();
    expect(pathTextFromMap(map, id)).toBe('客厅/柜子/抽屉');
    // 幂等：重复调用不建重复目录
    await ensureCategoryPath('客厅/柜子/抽屉');
    expect((await childrenOf('')).length).toBe(1);
  });

  it('descendantIds 收集全部子孙', async () => {
    const a = await ensureCategoryPath('A/B/C');
    const ids = await descendantIds((await childrenOf(''))[0].id);
    expect(ids.length).toBe(3);
    expect(ids).toContain(a);
  });
});

describe('物品 + 搜索', () => {
  it('saveItem 保存照片并写 searchText；删除回收孤儿图', async () => {
    const it = makeItem('测试');
    await saveItem(it, [{ blob: new Blob(['x'], { type: 'image/jpeg' }), thumb: new Blob(['t']) }]);
    expect(await db.images.count()).toBe(1);
    const saved = (await db.items.get(it.id))!;
    expect(saved.searchText).toContain('测试');
    await deleteItem(saved);
    expect(await db.images.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
  });

  it('中文名可被拼音全拼/首字母搜到', async () => {
    await saveItem(makeItem('蓝牙耳机'), []);
    await saveItem(makeItem('Coffee Maker', '', { tags: ['厨房'] }), []);
    invalidateItemsCache();
    expect((await searchItems('erji')).map((i) => i.name)).toContain('蓝牙耳机');
    expect((await searchItems('ly')).map((i) => i.name)).toContain('蓝牙耳机'); // 蓝牙首字母
    expect((await searchItems('coffee')).length).toBe(1);
    expect((await searchItems('厨房')).length).toBe(1); // 标签命中
  });

  it('searchCategories 匹配目录名（含拼音）', async () => {
    await ensureCategoryPath('办公室/抽屉');
    expect((await searchCategories('office')).length).toBe(0);
    expect((await searchCategories('bangong')).map((c) => c.name)).toContain('办公室');
    expect((await searchCategories('抽屉')).map((c) => c.name)).toContain('抽屉');
  });

  it('buildSearchText 含借出人', async () => {
    const it = makeItem('Switch', '', { lentTo: '小明' });
    expect(buildSearchText(it)).toContain('小明');
  });
});

describe('删除 + 撤销', () => {
  it('deleteItem 快照可完整恢复', async () => {
    const it = makeItem('相机', '', { tags: ['数码'] });
    await saveItem(it, [{ blob: new Blob(['img']) }]);
    const snap = await deleteItem(it);
    expect(await db.items.count()).toBe(0);
    await restoreDeleted(snap);
    expect(await db.items.count()).toBe(1);
    expect(await db.images.count()).toBe(1);
    expect((await searchItems('相机')).length).toBe(1);
  });

  it('级联删除目录返回快照并可恢复', async () => {
    const deep = await ensureCategoryPath('A/B');
    const it = makeItem('镜头', deep);
    await saveItem(it, [{ blob: new Blob(['x']) }]);
    const root = (await childrenOf(''))[0];
    const snap = await deleteCategoryCascade(root.id);
    expect(await db.categories.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
    expect(snap.cats.length).toBe(2);
    await restoreDeleted(snap);
    expect(await db.categories.count()).toBe(2);
    expect(await db.items.count()).toBe(1);
    expect(await db.images.count()).toBe(1);
  });

  it('deleteItems 批量删除', async () => {
    const a = makeItem('a');
    const b = makeItem('b');
    await saveItem(a, []);
    await saveItem(b, []);
    const snap = await deleteItems([a, b]);
    expect(snap.items.length).toBe(2);
    await restoreDeleted(snap);
    expect(await db.items.count()).toBe(2);
  });
});

describe('移动 / 最近 / 到期', () => {
  it('moveItems 批量改目录', async () => {
    const cat = await ensureCategoryPath('箱子');
    const a = makeItem('a');
    const b = makeItem('b');
    await saveItem(a, []);
    await saveItem(b, []);
    await moveItems([a.id, b.id], cat);
    expect((await itemsIn(cat)).length).toBe(2);
  });

  it('recentItems 按 updatedAt 倒序', async () => {
    const old = makeItem('old', '', { updatedAt: 1000 });
    const fresh = makeItem('fresh', '', { updatedAt: 2000 });
    await db.items.bulkPut([old, fresh]);
    const r = await recentItems(5);
    expect(r[0].name).toBe('fresh');
  });

  it('expiryDaysLeft / expiryState', () => {
    const past = makeItem('x', '', { expiryDate: '2000-01-01' });
    const soon = makeItem('y', '', { expiryDate: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10) });
    const far = makeItem('z', '', { expiryDate: '2999-01-01' });
    expect(expiryState(past)).toBe('expired');
    expect(expiryState(soon)).toBe('soon');
    expect(expiryState(far)).toBeNull();
    expect(expiryDaysLeft(makeItem('n'))).toBeNull();
  });
});

describe('备份', () => {
  it('导出→导入完整往返（含缩略图）', async () => {
    const cat = await ensureCategoryPath('导出/测试');
    const it = makeItem('物品甲', cat, { tags: ['t1'], lentTo: 'Bob', expiryDate: '2030-05-01' });
    await saveItem(it, [
      { blob: new Blob(['hello-img'], { type: 'image/jpeg' }), thumb: new Blob(['thumb'], { type: 'image/jpeg' }) },
    ]);
    const json = await exportData();

    await clear();
    const r = await importData(json);
    expect(r.items).toBe(1);
    const back = (await db.items.get(it.id))!;
    expect(back.name).toBe('物品甲');
    expect(back.lentTo).toBe('Bob');
    expect(back.imageIds.length).toBe(1);
    const img = (await db.images.get(back.imageIds[0])) as ImageRec;
    expect(await img.blob.text()).toBe('hello-img');
    expect(await img.thumb!.text()).toBe('thumb');
    expect(pathTextFromMap(await categoryMap(), back.categoryId)).toBe('导出/测试');
  });

  it('兼容 v1 备份（imageId 单图）', async () => {
    const json = JSON.stringify({
      version: 1,
      categories: [{ id: 'c1', name: '旧目录', parentId: '', createdAt: 1 }],
      items: [{ id: 'i1', name: '旧物', categoryId: 'c1', imageId: 'g1', description: '', attributes: {}, tags: [], quantity: 1, createdAt: 1, updatedAt: 1 }],
      images: [{ id: 'g1', type: 'image/jpeg', base64: btoa('bin') }],
    });
    const r = await importData(json);
    expect(r.items).toBe(1);
    const it = (await db.items.get('i1'))!;
    expect(it.imageIds).toEqual(['g1']);
    expect(it.searchText).toContain('旧物');
  });
});
