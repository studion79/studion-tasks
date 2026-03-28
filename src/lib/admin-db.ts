import path from "path";

function sanitizeFileUrl(fileUrl: string): string {
  const withoutPrefix = fileUrl.replace(/^file:/, "");
  const withoutQuery = withoutPrefix.split("?")[0];
  if (path.isAbsolute(withoutQuery)) return withoutQuery;
  return path.resolve(process.cwd(), withoutQuery);
}

export function resolveDatabaseFilePath(): string {
  const raw = process.env.LIBSQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) return path.resolve(process.cwd(), "prisma/dev.db");
  if (raw.startsWith("file:")) return sanitizeFileUrl(raw);
  return path.resolve(process.cwd(), "prisma/dev.db");
}
