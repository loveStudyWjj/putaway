import Dexie, { type Table } from 'dexie';
import i18n from './i18n';
import type { Category, Item, ImageRec } from './types';

class AppDB extends Dexie {
  categories!: Table<Category, string>;
  items!: Table<Item, string>;
  images!: Table<ImageRec, string>;

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
  }
}

export const db = new AppDB();

export const uid = () => crypto.randomUUID();

// ---------- 目录 ----------

export async function childrenOf(parentId: string): Promise<Category[]> {
  const list = await db.categories.where('parentId').equals(parentId).toArray();
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function itemsIn(categoryId: string): Promise<Item[]> {
  const list = await db.items.where('categoryId').equals(categoryId).toArray();
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
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

/** 级联删除目录：子目录 + 所有物品 + 物品照片 + 目录封面图 */
export async function deleteCategoryCascade(categoryId: string): Promise<void> {
  const catIds = await descendantIds(categoryId);
  const [items, cats] = await Promise.all([
    db.items.where('categoryId').anyOf(catIds).toArray(),
    db.categories.bulkGet(catIds),
  ]);
  const imageIds = [
    ...items.flatMap((i) => i.imageIds),
    ...cats.filter((c): c is Category => !!c && !!c.imageId).map((c) => c.imageId!),
  ];
  await db.transaction('rw', db.categories, db.items, db.images, async () => {
    await db.images.bulkDelete(imageIds);
    await db.items.bulkDelete(items.map((i) => i.id));
    await db.categories.bulkDelete(catIds);
  });
}

/** 设置目录封面图（自动替换旧图） */
export async function setCategoryImage(categoryId: string, blob: Blob): Promise<void> {
  const cat = await db.categories.get(categoryId);
  if (!cat) return;
  const nid = uid();
  await db.transaction('rw', db.categories, db.images, async () => {
    await db.images.put({ id: nid, blob });
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

/** 按 imageIds 顺序取所有照片 */
export async function getItemImages(item: Item): Promise<Blob[]> {
  const recs = await db.images.bulkGet(item.imageIds);
  return recs.filter((r): r is ImageRec => !!r).map((r) => r.blob);
}

export interface PhotoToSave {
  /** 已有图片的 imageId；新图片为 undefined */
  id?: string;
  blob?: Blob;
}

/**
 * 保存物品及其照片列表：
 * - photos 中带 id 的保留，blob 的新建
 * - item.imageIds 中原有、photos 中不存在的图片会被删除
 */
export async function saveItem(item: Item, photos: PhotoToSave[]): Promise<void> {
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
        await db.images.put({ id: nid, blob: p.blob });
        ids.push(nid);
      }
    }
    item.imageIds = ids;
    item.updatedAt = Date.now();
    await db.items.put(item);
  });
}

export async function deleteItem(item: Item): Promise<void> {
  await db.transaction('rw', db.items, db.images, async () => {
    if (item.imageIds.length) await db.images.bulkDelete(item.imageIds);
    await db.items.delete(item.id);
  });
}

export async function searchItems(q: string): Promise<Item[]> {
  const kw = q.trim().toLowerCase();
  if (!kw) return [];
  const all = await db.items.toArray();
  return all.filter((it) => {
    const hay = [
      it.name,
      it.description,
      ...it.tags,
      ...Object.keys(it.attributes),
      ...Object.values(it.attributes),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(kw);
  });
}

// ---------- 备份 ----------

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function exportData(): Promise<string> {
  const [categories, items, images] = await Promise.all([
    db.categories.toArray(),
    db.items.toArray(),
    db.images.toArray(),
  ]);
  const imgs = await Promise.all(
    images.map(async (r) => ({ id: r.id, type: r.blob.type, base64: await blobToBase64(r.blob) }))
  );
  return JSON.stringify({ version: 1, exportedAt: Date.now(), categories, items, images: imgs });
}

export async function importData(json: string): Promise<{ cats: number; items: number }> {
  const data = JSON.parse(json);
  if (!Array.isArray(data.categories) || !Array.isArray(data.items)) {
    throw new Error(i18n.t('db.badBackup'));
  }
  // 兼容旧版备份：imageId → imageIds
  const items: Item[] = data.items.map((it: any) => ({
    ...it,
    imageIds: Array.isArray(it.imageIds) ? it.imageIds : it.imageId ? [it.imageId] : [],
    imageId: undefined,
  }));
  const images: ImageRec[] = (data.images ?? []).map((r: any) => ({
    id: r.id,
    blob: base64ToBlob(r.base64, r.type || 'image/jpeg'),
  }));
  await db.transaction('rw', db.categories, db.items, db.images, async () => {
    await Promise.all([db.categories.clear(), db.items.clear(), db.images.clear()]);
    await db.categories.bulkAdd(data.categories);
    await db.items.bulkAdd(items);
    await db.images.bulkAdd(images);
  });
  return { cats: data.categories.length, items: data.items.length };
}
