#!/usr/bin/env node
/**
 * Generate a standalone demo SQLite database with 2 complete projects.
 *
 * Usage:
 *   node scripts/generate-demo-db.js
 *   node scripts/generate-demo-db.js /absolute/path/demo.db
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function runStep(label, cmd, args, env) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, {
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Étape échouée: ${label}`);
  }
}

function main() {
  const rawTarget = process.argv[2] || "artifacts/task-app-demo-2-projects.db";
  const targetPath = path.isAbsolute(rawTarget)
    ? rawTarget
    : path.resolve(process.cwd(), rawTarget);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  const env = {
    ...process.env,
    LIBSQL_DATABASE_URL: `file:${targetPath}`,
  };

  runStep("Apply migrations", process.execPath, [path.resolve(__dirname, "apply-migrations.js")], env);
  runStep("Seed demo project #1", process.execPath, [path.resolve(__dirname, "seed-demo.js")], env);
  runStep("Enrich demo project #1", process.execPath, [path.resolve(__dirname, "update-demo.js")], env);
  runStep("Seed demo project #2", process.execPath, [path.resolve(__dirname, "seed-demo-second.js")], env);

  const stat = fs.statSync(targetPath);
  console.log("\n✅ Base de démonstration générée");
  console.log(`   Fichier: ${targetPath}`);
  console.log(`   Taille : ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
}

try {
  main();
} catch (error) {
  console.error("\n❌", error.message || error);
  process.exit(1);
}
