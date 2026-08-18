/**
 * Apply the sole restty-owned Ghostty patch onto the pristine submodule
 * checkout at `reference/ghostty` (pin: eb72ec613…).
 *
 * Idempotent: skips if `pub const snapshot = terminal.snapshot` is already
 * present. Does not commit into the submodule — the working tree becomes
 * dirty until the next clean checkout.
 *
 * After apply (or when already applied), asserts the working-tree diff is
 * exactly one file / 4 insertions — enforces the sole-patch rule at build
 * time so a tampered patch file cannot silently widen the fork.
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
/** Expected `git diff --numstat HEAD` after a correct sole-patch apply. */
const EXPECTED_NUMSTAT = "4\t0\tsrc/lib_vt.zig";

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

function capture(command: string[], cwd: string): string {
  const proc = Bun.spawnSync(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    const err = new TextDecoder().decode(proc.stderr);
    console.error(err || `command failed: ${command.join(" ")}`);
    process.exit(proc.exitCode ?? 1);
  }
  return new TextDecoder().decode(proc.stdout);
}

/**
 * Fail the build if the submodule worktree is not exactly the sole patch.
 * Prevents a tampered/extra-hunk patch from silently widening the fork.
 */
function assertSolePatchShape(): void {
  if (!alreadyApplied()) {
    console.error("sole-patch shape check: marker missing after apply");
    process.exit(1);
  }

  const numstat = capture(["git", "diff", "--numstat", "HEAD"], ghosttyDir)
    .trim()
    .split("\n")
    .filter(Boolean);

  if (numstat.length !== 1 || numstat[0] !== EXPECTED_NUMSTAT) {
    console.error(
      "sole-patch shape check failed: expected exactly one hunk on src/lib_vt.zig " +
        `(4 insertions / 0 deletions), got:\n${numstat.join("\n") || "(empty)"}`,
    );
    console.error("git diff --stat:");
    run(["git", "diff", "--stat", "HEAD"], ghosttyDir);
    process.exit(1);
  }

  const diff = capture(["git", "diff", "HEAD", "--", "src/lib_vt.zig"], ghosttyDir);
  if (!diff.includes(`+${MARKER}`)) {
    console.error("sole-patch shape check failed: diff does not add the snapshot re-export");
    process.exit(1);
  }
}

const checkOnly = process.argv.includes("--check");

if (!existsSync(patchPath)) {
  console.error(`missing patch file: ${patchPath}`);
  process.exit(1);
}

if (alreadyApplied()) {
  console.log("ghostty lib_vt snapshot re-export already applied; verifying sole-patch shape...");
  assertSolePatchShape();
  console.log("sole-patch shape OK");
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

assertSolePatchShape();
console.log("Ghostty patch applied (sole-patch shape OK).");
