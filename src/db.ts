import Dexie, { type Table } from 'dexie';
import { pinyin } from 'pinyin-pro';
import i18n from './i18n';
import type { Category, Item, ImageRec, TrashEntry, LogEntry } from './types';

/** 生成物品搜索串：名称+完整拼音(带空格/连写)+首字母+描述+标签+属性+借出人 */
export function buildSearchText(it: Pick<Item, 'name' | 'description' | 'tags' | 'attributes' | 'lentTo' | 'barcode'>): string {
  const name = it.name ?? '';
  let pyFull = '', pyJoin = '', pyFirst = '';
  try {
    pyFull = pinyin(name, { toneType: 'none' });        // "er ji"
    pyJoin = pyFull.replace(/\s+/g, '');                // "erji"
    pyFirst = pinyin(name, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, ''); // "ej"
  } catch { /* 非中文字符忽略 */ }
  return [
    name, pyFull, pyJoin, pyFirst,
    it.description ?? '',
    ...(it.tags ?? []),
    ...Object.keys(it.attributes ?? {}),
    ...Object.values(it.attributes ?? {}),
    it.lentTo ?? '',
    it.barcode ?? '',
  ].join(' ').toLowerCase();
}

class AppDB extends Dexie {
  categories!: Table<Category, string>;
  items!: Table<Item, string>;
  images!: Table<ImageRec, string>;
  trash!: Table<TrashEntry, string>;
  logs!: Table<LogEntry, number>;

  constructor() {
    super('wugui');
    this.version(1).stores({
      categories: 'id, parentId',
      items: 'id, categoryId, updatedAt',
      images: 'id',
    });
    // v2：物品单图 imageId → 多图 imageIds
    this.version(2)
      .stores({
        categories: 'id, parentId',
        items: 'id, categoryId, updatedAt',
        images: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('items')
          .toCollection()
          .modify((it: any) => {
            if (!Array.isArray(it.imageIds)) {
              it.imageIds = it.imageId ? [it.imageId] : [];
            }
            delete it.imageId;
          });
      });
    // v3：name 索引 + 回填 searchText（含拼音）
    this.version(3)
      .stores({
        categories: 'id, parentId',
        items: 'id, categoryId, updatedAt, name',
        images: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('items')
          .toCollection()
          .modify((it: Item) => {
            it.searchText = buildSearchText(it);
          });
      });
    // v4：回收站 + 操作日志
    this.version(4).stores({
      trash: 'id, deletedAt',
      logs: '++id, ts',
    });
    // v5：searchText 加入 barcode 字段，全量回填
    this.version(5).upgrade(async (tx) => {
      await tx.table('items').toCollection().modify((it: Item) => {
        it.searchText = buildSearchText(it);
      });
    });
  }
}

export const db = new AppDB();

export const uid = () => crypto.randomUUID();

// ---------- 物品全表缓存（搜索用；写路径负责失效） ----------

let itemsCache: Item[] | null = null;
export function invalidateItemsCache() {
  itemsCache = null;
}
async function allItems(): Promise<Item[]> {
  if (!itemsCache) itemsCache = await db.items.toArray();
  return itemsCache;
}

// ---------- 目录 ----------

export async function childrenOf(parentId: string): Promise<Category[]> {
  const list = await db.categories.where('parentId').equals(parentId).toArray();
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function itemsIn(categoryId: string): Promise<Item[]> {
  const list = await db.items.where('categoryId').equals(categoryId).toArray();
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 全量目录表 → Map（目录通常很少，一次加载在内存里拼路径，避免逐层查询） */
export async function categoryMap(): Promise<Map<string, Category>> {
  const all = await db.categories.toArray();
  return new Map(all.map((c) => [c.id, c]));
}

/** 用目录 Map 在内存中拼 "a/b/c" 路径 */
export function pathTextFromMap(map: Map<string, Category>, categoryId: string): string {
  const names: string[] = [];
  let cur = categoryId;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const c = map.get(cur);
    if (!c) break;
    names.unshift(c.name);
    cur = c.parentId;
  }
  return names.join('/') || i18n.t('common.root');
}

/** 从当前目录向上的面包屑链（含自身，根在前） */
export async function pathOf(categoryId: string): Promise<Category[]> {
  const path: Category[] = [];
  let cur = categoryId;
  while (cur) {
    const c = await db.categories.get(cur);
    if (!c) break;
    path.unshift(c);
    cur = c.parentId;
  }
  return path;
}

export async function pathText(categoryId: string): Promise<string> {
  const p = await pathOf(categoryId);
  return p.map((c) => c.name).join('/') || i18n.t('common.root');
}

/** 自身 + 所有子孙目录 id */
export async function descendantIds(categoryId: string): Promise<string[]> {
  const ids = [categoryId];
  const queue = [categoryId];
  while (queue.length) {
    const kids = await db.categories.where('parentId').equals(queue.shift()!).toArray();
    for (const k of kids) {
      ids.push(k.id);
      queue.push(k.id);
    }
  }
  return ids;
}

/** categoryId 是否为 ancestorId 的子孙（或相同），用于移动目录时防环 */
export async function isDescendant(categoryId: string, ancestorId: string): Promise<boolean> {
  let cur = categoryId;
  while (cur) {
    if (cur === ancestorId) return true;
    const c = await db.categories.get(cur);
    if (!c) break;
    cur = c.parentId;
  }
  return false;
}

/** 目录名（含拼音）搜索 */
export async function searchCategories(q: string): Promise<Category[]> {
  const kw = q.trim().toLowerCase();
  if (!kw) return [];
  const all = await db.categories.toArray();
  return all.filter((c) => {
    if (c.name.toLowerCase().includes(kw)) return true;
    try {
      return pinyin(c.name, { toneType: 'none' }).replace(/\s+/g, '').includes(kw)
        || pinyin(c.name, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, '').includes(kw);
    } catch {
      return false;
    }
  });
}

/** 设置目录封面图（自动替换旧图） */
export async function setCategoryImage(categoryId: string, blob: Blob, thumb?: Blob): Promise<void> {
  const cat = await db.categories.get(categoryId);
  if (!cat) return;
  const nid = uid();
  await db.transaction('rw', db.categories, db.images, async () => {
    await db.images.put({ id: nid, blob, thumb });
    if (cat.imageId) await db.images.delete(cat.imageId);
    await db.categories.update(categoryId, { imageId: nid });
  });
}

/** 移除目录封面图 */
export async function removeCategoryImage(categoryId: string): Promise<void> {
  const cat = await db.categories.get(categoryId);
  if (!cat?.imageId) return;
  const old = cat.imageId;
  await db.transaction('rw', db.categories, db.images, async () => {
    await db.images.delete(old);
    await db.categories.update(categoryId, { imageId: undefined });
  });
}

/** 按 "a/b/c" 路径确保目录存在，返回末级 id */
export async function ensureCategoryPath(path: string): Promise<string> {
  const parts = path.split('/').map((s) => s.trim()).filter(Boolean);
  let parent = '';
  for (const name of parts) {
    const kids = await childrenOf(parent);
    let found = kids.find((k) => k.name === name);
    if (!found) {
      found = { id: uid(), name, parentId: parent, createdAt: Date.now() };
      await db.categories.add(found);
    }
    parent = found.id;
  }
  return parent;
}

// ---------- 物品 ----------

/** 按 imageIds 顺序取所有照片（原图） */
export async function getItemImages(item: Item): Promise<Blob[]> {
  const recs = await db.images.bulkGet(item.imageIds);
  return recs.filter((r): r is ImageRec => !!r).map((r) => r.blob);
}

/** 列表缩略图：有 thumb 用 thumb，否则回退原图（老数据） */
export function thumbOf(rec?: ImageRec): Blob | undefined {
  return rec ? rec.thumb ?? rec.blob : undefined;
}

/** 最近更新的物品 */
export function recentItems(limit = 10): Promise<Item[]> {
  return db.items.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export interface PhotoToSave {
  /** 已有图片的 imageId；新图片为 undefined */
  id?: string;
  blob?: Blob;
  /** 新图对应的缩略图 */
  thumb?: Blob;
}

/**
 * 保存物品及其照片列表：
 * - photos 中带 id 的保留，blob 的新建
 * - item.imageIds 中原有、photos 中不存在的图片会被删除
 * - 同时重算 searchText（拼音搜索索引）
 */
export async function saveItem(item: Item, photos: PhotoToSave[]): Promise<void> {
  item.searchText = buildSearchText(item);
  await db.transaction('rw', db.items, db.images, async () => {
    const keepIds = new Set(photos.filter((p) => p.id).map((p) => p.id));
    const removed = (item.imageIds ?? []).filter((id) => !keepIds.has(id));
    if (removed.length) await db.images.bulkDelete(removed);
    const ids: string[] = [];
    for (const p of photos) {
      if (p.id) {
        ids.push(p.id);
      } else if (p.blob) {
        const nid = uid();
        await db.images.put({ id: nid, blob: p.blob, thumb: p.thumb });
        ids.push(nid);
      }
    }
    item.imageIds = ids;
    item.updatedAt = Date.now();
    await db.items.put(item);
  });
  invalidateItemsCache();
  void log('save_item', item.name);
}

/** 批量移动物品到目标目录 */
export async function moveItems(itemIds: string[], targetCatId: string): Promise<void> {
  await db.items.where('id').anyOf(itemIds).modify({ categoryId: targetCatId, updatedAt: Date.now() });
  invalidateItemsCache();
  void log('move_items', `${itemIds.length} items`);
}

// ---------- 删除 + 撤销快照 ----------

export interface DeletedSnapshot {
  cats: Category[];
  items: Item[];
  images: ImageRec[];
}

/** 撤销删除：把快照数据整体写回；父引用已失效的重新挂到根目录（防孤儿） */
export async function restoreDeleted(snap: DeletedSnapshot): Promise<void> {
  const restoredCatIds = new Set(snap.cats.map((c) => c.id));
  const existIds = new Set((await db.categories.toArray()).map((c) => c.id));
  const okParent = (pid: string) => pid === '' || restoredCatIds.has(pid) || existIds.has(pid);
  for (const c of snap.cats) if (!okParent(c.parentId)) c.parentId = '';
  for (const it of snap.items) if (!okParent(it.categoryId)) it.categoryId = '';
  await db.transaction('rw', db.categories, db.items, db.images, async () => {
    if (snap.images.length) await db.images.bulkPut(snap.images);
    if (snap.items.length) await db.items.bulkPut(snap.items);
    if (snap.cats.length) await db.categories.bulkPut(snap.cats);
  });
  invalidateItemsCache();
  void log('restore', `${snap.items.length} items`);
}

/** 删除物品（返回快照用于撤销；同步进回收站） */
export async function deleteItem(item: Item): Promise<DeletedSnapshot> {
  const images = (await db.images.bulkGet(item.imageIds)).filter((r): r is ImageRec => !!r);
  await db.transaction('rw', db.items, db.images, async () => {
    if (item.imageIds.length) await db.images.bulkDelete(item.imageIds);
    await db.items.delete(item.id);
  });
  const snap = { cats: [] as Category[], items: [item], images };
  invalidateItemsCache();
  void toTrash('item', item.name, snap);
  void log('delete_item', item.name);
  return snap;
}

/** 批量删除物品（返回快照用于撤销；同步进回收站） */
export async function deleteItems(items: Item[]): Promise<DeletedSnapshot> {
  const imageIds = items.flatMap((i) => i.imageIds);
  const images = (await db.images.bulkGet(imageIds)).filter((r): r is ImageRec => !!r);
  await db.transaction('rw', db.items, db.images, async () => {
    if (imageIds.length) await db.images.bulkDelete(imageIds);
    await db.items.bulkDelete(items.map((i) => i.id));
  });
  const snap = { cats: [] as Category[], items, images };
  invalidateItemsCache();
  void toTrash('items', i18n.t('trash.batchName', { n: items.length }), snap);
  void log('delete_items', `${items.length} items`);
  return snap;
}

/** 级联删除目录（返回快照用于撤销；同步进回收站）：子目录 + 所有物品 + 物品照片 + 目录封面图 */
export async function deleteCategoryCascade(categoryId: string): Promise<DeletedSnapshot> {
  const catIds = await descendantIds(categoryId);
  const [items, cats] = await Promise.all([
    db.items.where('categoryId').anyOf(catIds).toArray(),
    db.categories.bulkGet(catIds),
  ]);
  const imageIds = [
    ...items.flatMap((i) => i.imageIds),
    ...cats.filter((c): c is Category => !!c && !!c.imageId).map((c) => c.imageId!),
  ];
  const images = (await db.images.bulkGet(imageIds)).filter((r): r is ImageRec => !!r);
  await db.transaction('rw', db.categories, db.items, db.images, async () => {
    await db.images.bulkDelete(imageIds);
    await db.items.bulkDelete(items.map((i) => i.id));
    await db.categories.bulkDelete(catIds);
  });
  const snap = { cats: cats.filter((c): c is Category => !!c), items, images };
  invalidateItemsCache();
  const root = cats.find((c) => c?.id === categoryId);
  void toTrash('category', root?.name ?? '', snap);
  void log('delete_cat', root?.name ?? categoryId);
  return snap;
}

// ---------- 搜索 ----------

export async function searchItems(q: string): Promise<Item[]> {
  const kw = q.trim().toLowerCase();
  if (!kw) return [];
  const all = await allItems();
  return all.filter((it) => {
    const hay = it.searchText ?? buildSearchText(it);
    return hay.includes(kw);
  });
}

// ---------- 到期 ----------

/** 距到期日天数（负数=已过期）；无到期日返回 null */
export function expiryDaysLeft(it: Item, now = Date.now()): number | null {
  if (!it.expiryDate) return null;
  const t = new Date(it.expiryDate + 'T23:59:59').getTime();
  if (Number.isNaN(t)) return null;
  // floor：到期当天为 0（ceil 会把当天算成 1、昨天算成 -0 导致漏判过期）
  return Math.floor((t - now) / 86400000);
}

/** 到期状态：expired 已过期 / soon 30天内 / null */
export function expiryState(it: Item): 'expired' | 'soon' | null {
  const d = expiryDaysLeft(it);
  if (d === null || d > 30) return null;
  return d < 0 ? 'expired' : 'soon';
}

// ---------- 备份 ----------

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/** 导出 JSON 备份；图片分批转 base64，onProgress 报告 0~1 进度 */
export async function exportData(onProgress?: (p: number) => void): Promise<string> {
  const [categories, items, images] = await Promise.all([
    db.categories.toArray(),
    db.items.toArray(),
    db.images.toArray(),
  ]);
  const imgs: any[] = [];
  const CHUNK = 12;
  for (let i = 0; i < images.length; i += CHUNK) {
    const batch = await Promise.all(
      images.slice(i, i + CHUNK).map(async (r) => ({
        id: r.id,
        type: r.blob.type,
        base64: await blobToBase64(r.blob),
        thumbType: r.thumb?.type,
        thumbBase64: r.thumb ? await blobToBase64(r.thumb) : undefined,
      }))
    );
    imgs.push(...batch);
    onProgress?.(Math.min(1, (i + CHUNK) / Math.max(1, images.length)));
    await new Promise((r) => setTimeout(r)); // 让出主线程，避免大图库卡 UI
  }
  return JSON.stringify({ version: 2, exportedAt: Date.now(), categories, items, images: imgs });
}

export async function importData(
  json: string,
  onProgress?: (p: number) => void
): Promise<{ cats: number; items: number }> {
  const data = JSON.parse(json);
  if (!Array.isArray(data.categories) || !Array.isArray(data.items)) {
    throw new Error(i18n.t('db.badBackup'));
  }
  // 兼容旧版备份：imageId → imageIds
  const items: Item[] = data.items.map((it: any) => ({
    ...it,
    imageIds: Array.isArray(it.imageIds) ? it.imageIds : it.imageId ? [it.imageId] : [],
    imageId: undefined,
    searchText: it.searchText ?? buildSearchText(it),
  }));
  const images: ImageRec[] = [];
  const rawImgs: any[] = data.images ?? [];
  const CHUNK = 20;
  for (let i = 0; i < rawImgs.length; i += CHUNK) {
    images.push(
      ...rawImgs.slice(i, i + CHUNK).map((r: any) => ({
        id: r.id,
        blob: base64ToBlob(r.base64, r.type || 'image/jpeg'),
        thumb: r.thumbBase64 ? base64ToBlob(r.thumbBase64, r.thumbType || 'image/jpeg') : undefined,
      }))
    );
    onProgress?.(Math.min(1, (i + CHUNK) / Math.max(1, rawImgs.length)));
    await new Promise((r) => setTimeout(r));
  }
  await db.transaction('rw', db.categories, db.items, db.images, db.trash, db.logs, async () => {
    await Promise.all([db.categories.clear(), db.items.clear(), db.images.clear(), db.trash.clear(), db.logs.clear()]);
    await db.categories.bulkAdd(data.categories);
    await db.items.bulkAdd(items);
    await db.images.bulkAdd(images);
  });
  invalidateItemsCache();
  return { cats: data.categories.length, items: data.items.length };
}

/** 导出 CSV（仅物品清单，不含图片） */
export async function exportCsv(): Promise<string> {
  const [items, map] = await Promise.all([db.items.toArray(), categoryMap()]);
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const attrKeys = Array.from(new Set(items.flatMap((i) => Object.keys(i.attributes))));
  const head = ['name', 'path', 'quantity', 'description', 'tags', 'lentTo', 'expiryDate', 'updatedAt', ...attrKeys];
  const lines = [head.map(esc).join(',')];
  for (const it of items) {
    lines.push(
      [
        it.name,
        pathTextFromMap(map, it.categoryId),
        String(it.quantity),
        it.description,
        it.tags.join(' '),
        it.lentTo ?? '',
        it.expiryDate ?? '',
        new Date(it.updatedAt).toISOString(),
        ...attrKeys.map((k) => it.attributes[k] ?? ''),
      ]
        .map(esc)
        .join(',')
    );
  }
  return '﻿' + lines.join('\r\n'); // BOM 让 Excel 正确识别 UTF-8
}

// ---------- 回收站（30 天自动清理） ----------

const TRASH_TTL = 30 * 86400000;

async function toTrash(kind: TrashEntry['kind'], name: string, snap: DeletedSnapshot) {
  try {
    await db.trash.put({ id: uid(), kind, name, deletedAt: Date.now(), snap });
    // 顺手清超期
    await db.trash.where('deletedAt').below(Date.now() - TRASH_TTL).delete();
  } catch { /* 回收站失败不阻塞删除 */ }
}

export function listTrash(): Promise<TrashEntry[]> {
  return db.trash.orderBy('deletedAt').reverse().toArray();
}

export async function restoreTrash(id: string): Promise<void> {
  const t = await db.trash.get(id);
  if (!t) return;
  await restoreDeleted(t.snap);
  await db.trash.delete(id);
}

export function purgeTrash(id: string): Promise<void> {
  return db.trash.delete(id);
}

export function emptyTrash(): Promise<void> {
  return db.trash.clear();
}

// ---------- 操作日志（保留最近 200 条） ----------

export async function log(action: string, text: string): Promise<void> {
  try {
    await db.logs.add({ ts: Date.now(), action, text });
    const excess = await db.logs.count() - 200;
    if (excess > 0) {
      const oldest = await db.logs.orderBy('ts').limit(excess).primaryKeys();
      await db.logs.bulkDelete(oldest);
    }
  } catch { /* 日志失败不阻塞 */ }
}

export function listLogs(limit = 100): Promise<LogEntry[]> {
  return db.logs.orderBy('ts').reverse().limit(limit).toArray();
}

// ---------- 关注聚合（临期/已过期/借出） ----------

export interface Attention {
  expired: Item[];
  soon: Item[];
  lent: Item[];
}

export async function attentionItems(): Promise<Attention> {
  const all = await allItems();
  const expired: Item[] = [], soon: Item[] = [], lent: Item[] = [];
  for (const it of all) {
    const d = expiryDaysLeft(it);
    if (d !== null && d < 0) expired.push(it);
    else if (d !== null && d <= 30) soon.push(it);
    if (it.lentTo) lent.push(it);
  }
  const byDate = (a: Item, b: Item) => (expiryDaysLeft(a) ?? 0) - (expiryDaysLeft(b) ?? 0);
  expired.sort(byDate); soon.sort(byDate); lent.sort((a, b) => (a.lentAt ?? 0) - (b.lentAt ?? 0));
  return { expired, soon, lent };
}

// ---------- 数量步进 ----------

export async function adjustQuantity(itemId: string, delta: number): Promise<number> {
  const it = await db.items.get(itemId);
  if (!it) return 0;
  const q = Math.min(9999, Math.max(1, it.quantity + delta));
  if (q !== it.quantity) {
    await db.items.update(itemId, { quantity: q, updatedAt: Date.now() });
    invalidateItemsCache();
  }
  return q;
}

// ---------- 排序 ----------

export type ItemSort = 'updated' | 'name' | 'quantity' | 'expiry';
export type CatSort = 'created' | 'name';

const SORT_KEY = 'wugui.sort';
export function loadSort(): { items: ItemSort; cats: CatSort } {
  try {
    const s = JSON.parse(localStorage.getItem(SORT_KEY) || '{}');
    return {
      items: ['updated', 'name', 'quantity', 'expiry'].includes(s.items) ? s.items : 'updated',
      cats: s.cats === 'name' ? 'name' : 'created',
    };
  } catch {
    return { items: 'updated', cats: 'created' };
  }
}
export function saveSort(s: { items: ItemSort; cats: CatSort }) {
  localStorage.setItem(SORT_KEY, JSON.stringify(s));
}

export function sortItems(list: Item[], mode: ItemSort): Item[] {
  const arr = [...list];
  if (mode === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else if (mode === 'quantity') arr.sort((a, b) => b.quantity - a.quantity);
  else if (mode === 'expiry') {
    arr.sort((a, b) => {
      const da = expiryDaysLeft(a), db_ = expiryDaysLeft(b);
      if (da === null && db_ === null) return 0;
      if (da === null) return 1;
      if (db_ === null) return -1;
      return da - db_;
    });
  } else arr.sort((a, b) => b.updatedAt - a.updatedAt);
  return arr;
}

export function sortCats(list: Category[], mode: CatSort): Category[] {
  const arr = [...list];
  if (mode === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else arr.sort((a, b) => a.createdAt - b.createdAt);
  return arr;
}
