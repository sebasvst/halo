#!/usr/bin/env node
/**
 * Produces the portable artifact: a single self-contained `Halo-portable.exe`.
 *
 * Halo has no runtime dependencies beyond the WebView2 runtime that ships with
 * Windows 10/11, so the release executable can simply be copied and run from any
 * folder. When it is not running from an installed location (NSIS / Program
 * Files), the app stores its settings in `halo-portable/` next to the exe, so the
 * configuration travels with it (see `src-tauri/src/settings.rs`).
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcExe = path.join(root, "src-tauri", "target", "release", "halo.exe");
const outDir = path.join(root, "release");
const outExe = path.join(outDir, "Halo-portable.exe");
const outZip = path.join(outDir, "Halo-portable.zip");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!existsSync(srcExe)) {
  fail(`Release executable not found: ${srcExe}\nRun "npm run tauri:build" (or --no-bundle) first.`);
}

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

mkdirSync(outDir, { recursive: true });
rmSync(outExe, { force: true });
rmSync(outZip, { force: true });
copyFileSync(srcExe, outExe);

const size = statSync(outExe).size;
const sha256 = await new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  createReadStream(outExe)
    .on("data", (chunk) => hash.update(chunk))
    .on("end", () => resolve(hash.digest("hex")))
    .on("error", reject);
});

// A zip makes the portable build easy to move around; it must contain only the exe.
try {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -LiteralPath '${outExe}' -DestinationPath '${outZip}' -Force`,
    ],
    { stdio: "ignore" },
  );
} catch {
  console.warn("  (zip skipped — Compress-Archive unavailable)");
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
console.log(`✓ Portable build ${pkg.version}`);
console.log(`  ${outExe} (${mb(size)})`);
if (existsSync(outZip)) console.log(`  ${outZip} (${mb(statSync(outZip).size)})`);
console.log(`  sha256 ${sha256}`);
console.log("  Run it from any folder — settings are stored in .\\halo-portable\\");
