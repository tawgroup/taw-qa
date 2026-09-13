/**
 * Hợp đồng đặt tên giữa hai bên không nói chuyện trực tiếp với nhau: agent viết
 * spec đặt tên thực thể, còn bước dọn đi tìm lại chúng. Chỉ prefix này nối hai
 * bên, nên nó nằm ở đây chứ không chép tay vào mỗi chỗ.
 */
export function prefixFor(prNumber: number): string {
  return `tawqa-pr${prNumber}-`;
}

export function nameFor(prNumber: number, label: string): string {
  return `${prefixFor(prNumber)}${label}`;
}

export function isOwnedByRun(name: string, prNumber: number): boolean {
  return name.startsWith(prefixFor(prNumber));
}

const ANY_RUN_RE = /^tawqa-pr(\d+)-/;

/** Rác của run khác: dọn được thì tốt, nhưng không phải việc của run này. */
export function ownedByAnyRun(name: string): number | null {
  const m = name.match(ANY_RUN_RE);
  return m ? Number(m[1]) : null;
}

export type Entity = { kind: string; id: string; name: string };

export type CleanupPlan = {
  /** Thuộc run này, phải xoá. */
  mine: Entity[];
  /** Của run khác, để nguyên và báo cáo. */
  strays: Entity[];
};

export function planCleanup(
  entities: Entity[],
  prNumber: number,
): CleanupPlan {
  const mine: Entity[] = [];
  const strays: Entity[] = [];
  for (const e of entities) {
    if (isOwnedByRun(e.name, prNumber)) mine.push(e);
    else if (ownedByAnyRun(e.name) !== null) strays.push(e);
  }
  return { mine, strays };
}

/** Dòng cho mục `### Không dọn được`. Không đổi verdict, chỉ để người đọc biết. */
export function notCleanedLines(failed: Entity[]): string[] {
  return failed.map((e) => `${e.kind} \`${e.name}\` (id \`${e.id}\`)`);
}
