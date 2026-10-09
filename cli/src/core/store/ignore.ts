import { dirname, join } from "node:path";
import { writeAtomic } from "#core/fs/atomic.ts";
import { exists } from "#core/fs/tree.ts";
import type { Roots } from "./paths.ts";

/**
 * `.registry/` is meant to be committed, so what is machine-local is named here
 * rather than in the project's own ignore file, which is theirs.
 */
const CONTENTS = [
  "# Files of yours that were in an install's way, moved aside.",
  "backups/",
  "# Uncomment to stop committing installed copies; `aireg install` restores them.",
  "# artifacts/",
  "",
].join("\n");

/** Create-only: once it is there, what a project shares is the project's call. */
export async function ensureScopeIgnore(roots: Pick<Roots, "scope" | "artifacts">): Promise<void> {
  if (roots.scope === "user") return;
  const path = join(dirname(roots.artifacts), ".gitignore");
  if (await exists(path)) return;
  await writeAtomic(path, CONTENTS);
}
