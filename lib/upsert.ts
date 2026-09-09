/**
 * 整表同步（批量保存）公共逻辑。
 * 语义：提交项含 id 且库中已存在 → 更新；含 id 但库中不存在 → 新增；
 *       无 id → 新增；库中存在但未提交 → 删除。
 * 通过回调注入各模型的事务操作，避免为每个模型重复编排事务，同时保留 Prisma 类型安全。
 */

export interface UpsertItem {
  id?: number | null;
}

export interface UpsertCounts {
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
}

export interface UpsertCallbacks<T extends UpsertItem> {
  /** 返回库中所有行的 id */
  listIds: () => Promise<number[]>;
  /** 更新一行（按 id，data 为已映射的库字段） */
  updateById: (id: number, data: T) => Promise<unknown>;
  /** 新增一行 */
  create: (data: T) => Promise<unknown>;
  /** 批量删除（返回被删行数） */
  deleteMissing: (ids: number[]) => Promise<number>;
  /** 写入操作日志（可选） */
  writeLog?: (counts: UpsertCounts) => Promise<unknown>;
}

/**
 * 在事务内同步数据：返回增/改/删计数。
 * 注意：本函数自身不开启事务，调用方应在 prisma.$transaction 内使用，以保持原子性。
 */
export async function syncByUpsert<T extends UpsertItem>(
  items: T[],
  cb: UpsertCallbacks<T>
): Promise<UpsertCounts> {
  const existingIds = await cb.listIds();
  const submitIds = items.filter((it) => it.id != null).map((it) => it.id!);

  let createdCount = 0;
  let updatedCount = 0;
  for (const it of items) {
    if (it.id != null && existingIds.includes(it.id)) {
      await cb.updateById(it.id, it);
      updatedCount += 1;
    } else {
      await cb.create(it);
      createdCount += 1;
    }
  }

  const toDelete = existingIds.filter((id) => !submitIds.includes(id));
  let deletedCount = 0;
  if (toDelete.length > 0) {
    deletedCount = await cb.deleteMissing(toDelete);
  }

  const counts = { createdCount, updatedCount, deletedCount };
  if (cb.writeLog) await cb.writeLog(counts);
  return counts;
}