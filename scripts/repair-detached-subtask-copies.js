#!/usr/bin/env node
/* eslint-disable no-console */
const { createClient } = require("@libsql/client");

function normalizeBaseTitle(title) {
  if (!title) return "";
  return String(title).replace(/\s+\((copy|copie)\)\s*$/i, "").trim();
}

function isCopyTitle(title) {
  return /\s+\((copy|copie)\)\s*$/i.test(String(title ?? ""));
}

async function main() {
  const url = process.env.LIBSQL_DATABASE_URL || "file:prisma/dev.db";
  const client = createClient({ url });

  try {
    const topLevel = await client.execute(
      'SELECT id, title, groupId FROM "Task" WHERE parentId IS NULL AND archivedAt IS NULL'
    );
    const subtasks = await client.execute(
      'SELECT id, title, parentId, groupId FROM "Task" WHERE parentId IS NOT NULL AND archivedAt IS NULL'
    );

    /** @type {Map<string, Set<string>>} */
    const parentIdsByGroupAndTitle = new Map();

    for (const row of subtasks.rows) {
      const groupId = String(row.groupId ?? "");
      const parentId = String(row.parentId ?? "");
      const title = String(row.title ?? "");
      if (!groupId || !parentId || !title) continue;
      const key = `${groupId}::${normalizeBaseTitle(title)}`;
      if (!parentIdsByGroupAndTitle.has(key)) parentIdsByGroupAndTitle.set(key, new Set());
      parentIdsByGroupAndTitle.get(key).add(parentId);
    }

    const repairs = [];
    for (const row of topLevel.rows) {
      const taskId = String(row.id ?? "");
      const groupId = String(row.groupId ?? "");
      const title = String(row.title ?? "");
      if (!taskId || !groupId || !title || !isCopyTitle(title)) continue;
      const key = `${groupId}::${normalizeBaseTitle(title)}`;
      const parentIds = parentIdsByGroupAndTitle.get(key);
      if (!parentIds || parentIds.size !== 1) continue;
      const [parentId] = [...parentIds];
      if (!parentId || parentId === taskId) continue;
      repairs.push({ taskId, parentId, title });
    }

    if (repairs.length === 0) {
      console.log("No detached subtask copy candidates found.");
      return;
    }

    for (const repair of repairs) {
      const countRes = await client.execute({
        sql: 'SELECT COUNT(*) as c FROM "Task" WHERE parentId = ? AND archivedAt IS NULL',
        args: [repair.parentId],
      });
      const position = Number(countRes.rows[0]?.c ?? 0) || 0;
      await client.execute({
        sql: 'UPDATE "Task" SET parentId = ?, position = ? WHERE id = ?',
        args: [repair.parentId, position, repair.taskId],
      });
    }

    console.log(`Repaired ${repairs.length} detached subtask copy/copies.`);
    repairs.forEach((repair) => {
      console.log(`- ${repair.title} -> parent ${repair.parentId}`);
    });
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("Failed to repair detached subtask copies:", error);
  process.exit(1);
});
