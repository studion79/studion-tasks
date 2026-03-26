#!/usr/bin/env node
/**
 * Génère les icônes PNG pour la PWA depuis public/icons/icon.svg
 * Usage : node scripts/generate-icons.js
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SRC = path.resolve(__dirname, "../public/icons/icon.svg");
const OUT = path.resolve(__dirname, "../public/icons");

const sizes = [192, 512];

async function run() {
  const svgBuffer = fs.readFileSync(SRC);

  for (const size of sizes) {
    // Regular icon
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(OUT, `icon-${size}.png`));
    console.log(`✓  icon-${size}.png`);

    // Maskable icon (same image — safe zone is center 80%)
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(OUT, `icon-maskable-${size}.png`));
    console.log(`✓  icon-maskable-${size}.png`);
  }

  // Apple touch icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(OUT, "apple-touch-icon.png"));
  console.log("✓  apple-touch-icon.png");

  console.log("\nIcônes générées dans public/icons/");
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
