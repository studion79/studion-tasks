#!/usr/bin/env node
import fs from "node:fs";
import { execSync } from "node:child_process";

const EXCLUDED_PATHS = [
  "/generated/",
  "src/lib/i18n/client.ts",
  "src/lib/i18n/pick.ts",
  "src/lib/i18n/useClientLocale.ts",
];

function isExcluded(file) {
  return EXCLUDED_PATHS.some((fragment) => file.includes(fragment));
}

function listFiles() {
  return execSync("rg --files src", { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const files = listFiles().filter((file) => !isExcluded(file));
  const messages = fs.readFileSync("src/lib/i18n/messages.ts", "utf8");

  const violations = [];
  const keySet = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      if (/\btr\((locale|appLocale)\b/.test(line)) {
        violations.push(`${file}:${lineNumber} legacy tr(...) call`);
      }
      if (/locale\s*===\s*"en"\s*\?/.test(line) || /isEn\s*\?/.test(line)) {
        violations.push(`${file}:${lineNumber} inline locale ternary`);
      }
    });

    for (const match of content.matchAll(/trKey\([^,]+,\s*"([^"]+)"\)/g)) {
      keySet.add(match[1]);
    }
  }

  const missingKeys = [...keySet].filter((key) => !messages.includes(`"${key}"`));
  if (missingKeys.length > 0) {
    violations.push(`Missing i18n keys in messages.ts:\n${missingKeys.map((key) => `  - ${key}`).join("\n")}`);
  }

  if (violations.length > 0) {
    console.error("i18n audit failed:");
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exit(1);
  }

  console.log("i18n audit passed");
}

main();
