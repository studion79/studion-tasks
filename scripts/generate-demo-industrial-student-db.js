#!/usr/bin/env node
/**
 * Generate a standalone SQLite DB with 2 showcase projects:
 * - Industrial production
 * - Engineering student exam planning
 *
 * Usage:
 *   node scripts/generate-demo-industrial-student-db.js
 *   node scripts/generate-demo-industrial-student-db.js /absolute/path/demo.db
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function runStep(label, cmd, args, env) {
  console.log(`\n> ${label}`);
  const result = spawnSync(cmd, args, {
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Failed step: ${label}`);
  }
}

function main() {
  const rawTarget = process.argv[2] || "artifacts/task-app-demo-industrie-etudiant.db";
  const targetPath = path.isAbsolute(rawTarget)
    ? rawTarget
    : path.resolve(process.cwd(), rawTarget);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

  const env = {
    ...process.env,
    LIBSQL_DATABASE_URL: `file:${targetPath}`,
  };

  runStep("Apply migrations", process.execPath, [path.resolve(__dirname, "apply-migrations.js")], env);
  runStep("Seed showcase projects", process.execPath, [path.resolve(__dirname, "seed-demo-industrial-student.js")], env);

  const stat = fs.statSync(targetPath);
  console.log("\nOK: demo DB generated");
  console.log(`File : ${targetPath}`);
  console.log(`Size : ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
}

try {
  main();
} catch (error) {
  console.error("\nERROR:", error.message || error);
  process.exit(1);
}
