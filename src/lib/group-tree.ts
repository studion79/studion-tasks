import type { Group } from "@/generated/prisma";

export type GroupLike = Pick<Group, "id" | "parentId" | "position" | "name">;

export type GroupHierarchyMeta = {
  depthById: Map<string, number>;
  siblingIndexById: Map<string, number>;
  siblingCountById: Map<string, number>;
  siblingsByParent: Map<string | null, string[]>;
};

export function sortGroupsByHierarchy<T extends GroupLike>(groups: T[]): T[] {
  if (!groups.length) return groups;

  const byId = new Map(groups.map((g) => [g.id, g]));
  const children = new Map<string | null, T[]>();

  const safeParentOf = (g: T): string | null => {
    if (!g.parentId) return null;
    if (!byId.has(g.parentId)) return null;
    if (g.parentId === g.id) return null;
    return g.parentId;
  };

  for (const group of groups) {
    const parent = safeParentOf(group);
    const arr = children.get(parent) ?? [];
    arr.push(group);
    children.set(parent, arr);
  }

  for (const [, arr] of children) {
    arr.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name);
    });
  }

  const ordered: T[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (group: T) => {
    if (visited.has(group.id)) return;
    if (visiting.has(group.id)) return;
    visiting.add(group.id);
    ordered.push(group);
    const kids = children.get(group.id) ?? [];
    for (const child of kids) visit(child);
    visiting.delete(group.id);
    visited.add(group.id);
  };

  const roots = children.get(null) ?? [];
  for (const root of roots) visit(root);

  // Any malformed orphan cycles fallback to stable order.
  if (ordered.length < groups.length) {
    for (const group of groups) {
      if (!visited.has(group.id)) ordered.push(group);
    }
  }

  return ordered;
}

export function buildGroupHierarchyMeta<T extends GroupLike>(groups: T[]): GroupHierarchyMeta {
  const ordered = sortGroupsByHierarchy(groups);
  const byId = new Map(ordered.map((g) => [g.id, g]));

  const safeParentOf = (g: T): string | null => {
    if (!g.parentId) return null;
    if (!byId.has(g.parentId)) return null;
    if (g.parentId === g.id) return null;
    return g.parentId;
  };

  const depthById = new Map<string, number>();
  const siblingsByParent = new Map<string | null, string[]>();

  const getDepth = (group: T, stack = new Set<string>()): number => {
    const cached = depthById.get(group.id);
    if (typeof cached === "number") return cached;
    const parentId = safeParentOf(group);
    if (!parentId) {
      depthById.set(group.id, 0);
      return 0;
    }
    if (stack.has(group.id)) {
      depthById.set(group.id, 0);
      return 0;
    }
    stack.add(group.id);
    const parent = byId.get(parentId);
    const depth = parent ? getDepth(parent as T, stack) + 1 : 0;
    depthById.set(group.id, depth);
    stack.delete(group.id);
    return depth;
  };

  for (const group of ordered) {
    getDepth(group);
    const parentKey = safeParentOf(group);
    const siblings = siblingsByParent.get(parentKey) ?? [];
    siblings.push(group.id);
    siblingsByParent.set(parentKey, siblings);
  }

  const siblingIndexById = new Map<string, number>();
  const siblingCountById = new Map<string, number>();
  for (const [, siblingIds] of siblingsByParent) {
    const count = siblingIds.length;
    siblingIds.forEach((id, idx) => {
      siblingIndexById.set(id, idx);
      siblingCountById.set(id, count);
    });
  }

  return {
    depthById,
    siblingIndexById,
    siblingCountById,
    siblingsByParent,
  };
}

export function isDescendantGroup<T extends GroupLike>(groups: T[], ancestorId: string, possibleChildId: string): boolean {
  const byId = new Map(groups.map((g) => [g.id, g]));
  let cursor = byId.get(possibleChildId);
  const seen = new Set<string>();
  while (cursor?.parentId) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);
    if (cursor.parentId === ancestorId) return true;
    cursor = byId.get(cursor.parentId);
  }
  return false;
}
