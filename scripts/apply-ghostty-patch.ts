/**
 * Apply the sole restty-owned Ghostty patch onto the pristine submodule
 * checkout at `reference/ghostty` (pin: 22d13172…).
 *
 * Idempotent: skips if `pub const snapshot = terminal.snapshot` is already
 * present. Does not commit into the submodule — the working tree becomes
 * dirty until the next clean checkout.
 *
 * Usage:
 *   bun run scripts/apply-ghostty-patch.ts
 *   bun run scripts/apply-ghostty-patch.ts --check
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const ghosttyDir = resolve(root, "reference/ghostty");
const libVtPath = resolve(ghosttyDir, "src/lib_vt.zig");
const patchPath = resolve(root, "patches/ghostty-lib-vt-snapshot-reexport.patch");

const MARKER = "pub const snapshot = terminal.snapshot";

function alreadyApplied(): boolean {
  if (!existsSync(libVtPath)) {
    throw new Error(`ghostty lib_vt missing at ${libVtPath} — init submodule first`);
  }
  return readFileSync(libVtPath, "utf8").includes(MARKER);
}

function run(command: string[], cwd: string): void {
  const proc = Bun.spawnSync(command, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode ?? 1);
  }
}

const checkOnly = process.argv.includes("--check");

if (!existsSync(patchPath)) {
  console.error(`missing patch file: ${patchPath}`);
  process.exit(1);
}

if (alreadyApplied()) {
  console.log("ghostty lib_vt snapshot re-export already applied; skipping");
  process.exit(0);
}

if (checkOnly) {
  console.log("ghostty patch not applied (would apply)");
  // Still verify the patch applies cleanly against pristine tree.
  run(["git", "apply", "--check", patchPath], ghosttyDir);
  process.exit(0);
}

console.log("Applying restty-owned Ghostty patch (lib_vt snapshot re-export)...");
run(["git", "apply", "--check", patchPath], ghosttyDir);
run(["git", "apply", patchPath], ghosttyDir);

if (!alreadyApplied()) {
  console.error("patch applied but marker not found — unexpected patch content");
  process.exit(1);
}

console.log("Ghostty patch applied.");
