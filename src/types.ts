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
  createdAt: number;
  updatedAt: number;
}

export interface ImageRec {
  id: string;
  blob: Blob;
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
