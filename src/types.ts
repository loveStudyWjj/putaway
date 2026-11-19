export interface Category {
  id: string;
  name: string;
  /** 父目录 id，根目录为空字符串 '' */
  parentId: string;
  /** 可选封面图，关联 images 表 */
  imageId?: string;
  createdAt: number;
}

export interface Item {
  id: string;
  name: string;
  /** 所属目录 id，根目录为空字符串 '' */
  categoryId: string;
  description: string;
  attributes: Record<string, string>;
  quantity: number;
  tags: string[];
  /** 关联 images 表的照片列表 */
  imageIds: string[];
  /** 借给谁（未借出为空） */
  lentTo?: string;
  /** 借出时间戳 */
  lentAt?: number;
  /** 到期/保质期日期 'YYYY-MM-DD'（过期提醒 + 本地通知） */
  expiryDate?: string;
  /** 条码值（EAN/UPC 等，可选） */
  barcode?: string;
  /** 预生成的小写搜索串（名称+拼音+描述+标签+属性+借出人），保存时写入 */
  searchText?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImageRec {
  id: string;
  blob: Blob;
  /** 列表缩略图（~256px JPEG），详情页仍用 blob 原图 */
  thumb?: Blob;
}

/** 回收站条目：删除时的完整快照，可整包恢复 */
export interface TrashEntry {
  id: string;
  kind: 'item' | 'items' | 'category';
  /** 展示名（物品名或目录名） */
  name: string;
  deletedAt: number;
  snap: { cats: Category[]; items: Item[]; images: ImageRec[] };
}

/** 操作日志 */
export interface LogEntry {
  /** 自增主键 */
  id?: number;
  ts: number;
  action: string;
  text: string;
}

export interface AiResult {
  name: string;
  /** 建议分类路径，如 "厨房/调料" */
  categoryPath: string;
  description: string;
  quantity: number;
  attributes: Record<string, string>;
  tags: string[];
}
