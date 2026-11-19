import 'fake-indexeddb/auto';
import { describe, it } from 'vitest';
import type { Item } from './types';

(globalThis as any).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).navigator ??= { language: 'zh-CN' };

const {
  db, uid, saveItem, searchItems, attentionItems, categoryMap, pathTextFromMap,
  recentItems, itemsIn, childrenOf, descendantIds, sortItems, invalidateItemsCache, itemCountsByCategory,
} = await import('./db');

const N = 1000;
const names = ['蓝牙耳机', '保温杯', '充电器', '螺丝刀套装', '瑜伽垫', '咖啡机', '键盘', '收纳盒', '药箱', '雨伞'];

function makeItem(i: number, catId: string): Item {
  const name = `${names[i % names.length]}-${i}`;
  return {
    id: uid(), name, categoryId: catId,
    description: `这是第 ${i} 件物品的测试描述`,
    attributes: { color: '红', size: 'M', barcode: `69000${i}` },
    quantity: (i % 5) + 1,
    tags: [`tag${i % 7}`, `批次${i % 20}`],
    imageIds: [],
    expiryDate: i % 10 === 0 ? new Date(Date.now() + (i % 40 - 10) * 86400000).toISOString().slice(0, 10) : undefined,
    lentTo: i % 15 === 0 ? `借友${i % 9}` : undefined,
    createdAt: Date.now() - i * 1000, updatedAt: Date.now() - i * 500,
  };
}

const time = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
  const t0 = performance.now();
  const r = await fn();
  console.log(`  ${label.padEnd(28)} ${(performance.now() - t0).toFixed(1)}ms`);
  return r;
};

describe('压测：1000 件物品', () => {
  it('全链路基准', async () => {
    // 5 层深目录 × 多分支
    const leafs: string[] = [];
    for (let i = 0; i < 50; i++) {
      let pid = '';
      for (let d = 0; d < 4; d++) {
        const c = { id: uid(), name: `目录${i}-L${d}`, parentId: pid, createdAt: Date.now() };
        await db.categories.add(c);
        pid = c.id;
      }
      leafs.push(pid);
    }
    console.log('\n===== 数据层基准（1000 物品 / 200 目录 / 4 层深）=====');
    await time('灌入 1000 件物品', async () => {
      for (let i = 0; i < N; i++) await saveItem(makeItem(i, leafs[i % 50]), []);
    });
    invalidateItemsCache();

    await time('searchItems("蓝牙")', () => searchItems('蓝牙'));
    await time('searchItems("erji") 拼音', () => searchItems('erji'));
    await time('searchItems("6900123") 条码', () => searchItems('6900123'));
    await time('searchItems 缓存二次', () => searchItems('咖啡'));
    await time('attentionItems 全量聚合', () => attentionItems());
    await time('categoryMap', () => categoryMap());
    await time('recentItems(10)', () => recentItems(10));
    await time('itemsIn(单目录)', () => itemsIn(leafs[0]));
    await time('descendantIds(50目录)', async () => {
      const roots = await childrenOf('');
      for (const r of roots.slice(0, 50)) await descendantIds(r.id);
    });
    const list = await itemsIn(leafs[0]);
    await time('sortItems×4 模式', async () => {
      sortItems(list, 'name'); sortItems(list, 'quantity');
      sortItems(list, 'expiry'); sortItems(list, 'updated');
    });
    const cnts = await time('itemCountsByCategory 单趟聚合', () => itemCountsByCategory());
    // 正确性：与逐目录 BFS 结果逐一比对
    let mismatch = 0;
    for (const leaf of leafs.slice(0, 20)) {
      const ids = await descendantIds(leaf);
      const expect = (await db.items.where('categoryId').anyOf(ids).count());
      if ((cnts[leaf] ?? 0) !== expect) mismatch++;
    }
    console.log(`  与 BFS 比对 20 个目录：mismatch=${mismatch}`);
    const map = await categoryMap();
    await time('pathTextFromMap×1000', () => {
      for (const id of leafs) pathTextFromMap(map, id);
    });
    console.log('====================================================\n');
  }, 120000);
});
