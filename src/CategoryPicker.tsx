import React, { useEffect, useState } from 'react';
import { db } from './db';
import type { Category } from './types';
import { Sheet, IconFolder } from './ui';

interface Node {
  cat: Category;
  depth: number;
}

/** 目录树选择弹层：选择目标位置 */
export function CategoryPicker({ open, onClose, onPick, excludeId, title = '选择位置' }: {
  open: boolean;
  onClose: () => void;
  onPick: (categoryId: string) => void;
  /** 禁选该目录及其子孙（移动目录时防环） */
  excludeId?: string;
  title?: string;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    (async () => {
      const all = await db.categories.toArray();
      const byParent = new Map<string, Category[]>();
      for (const c of all) {
        const arr = byParent.get(c.parentId) ?? [];
        arr.push(c);
        byParent.set(c.parentId, arr);
      }
      const flat: Node[] = [];
      const walk = (pid: string, depth: number) => {
        for (const c of (byParent.get(pid) ?? []).sort((a, b) => a.createdAt - b.createdAt)) {
          flat.push({ cat: c, depth });
          walk(c.id, depth + 1);
        }
      };
      walk('', 0);
      setNodes(flat);

      if (excludeId) {
        const ex = new Set<string>([excludeId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const c of all) {
            if (ex.has(c.parentId) && !ex.has(c.id)) {
              ex.add(c.id);
              grew = true;
            }
          }
        }
        setExcluded(ex);
      } else {
        setExcluded(new Set());
      }
    })();
  }, [open, excludeId]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="max-h-[55vh] overflow-y-auto -mx-1">
        <PickRow depth={0} name="根目录" disabled={false}
          onClick={() => onPick('')} />
        {nodes.map(({ cat, depth }) => (
          <PickRow key={cat.id} depth={depth + 1} name={cat.name}
            disabled={excluded.has(cat.id)}
            onClick={() => onPick(cat.id)} />
        ))}
        {nodes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">还没有目录</p>
        )}
      </div>
    </Sheet>
  );
}

function PickRow({ depth, name, disabled, onClick }: {
  depth: number; name: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left active:bg-gray-100 ${disabled ? 'opacity-30' : ''}`}
      style={{ paddingLeft: 12 + depth * 20 }}>
      <IconFolder className="w-5 h-5 text-brand-500 shrink-0" />
      <span className="text-[15px] text-gray-800 truncate">{name}</span>
    </button>
  );
}
