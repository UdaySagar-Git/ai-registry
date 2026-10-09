import { dirname, join, relative } from "node:path";
import { assertUnredirected } from "#adapter/files.ts";
import { isWithin } from "#adapter/paths.ts";
import { type Roots, stagingDir, toolHome, toolHomeRoot } from "#core/store/paths.ts";

/** Harness roots may be shared; only scope-owned and staging trees are guarded here. */
export async function guardManagedPath(
  path: string,
  roots: Roots,
  includeLeaf = true,
  env: NodeJS.ProcessEnv = process.env,
  /** Folders this pass already checked, for a caller guarding many paths at once. */
  verified?: Set<string>,
): Promise<void> {
  const scope = dirname(roots.artifacts);
  if (isWithin(scope, path)) {
    await assertUnredirected(
      roots.scope === "project" ? roots.cwd : scope,
      path,
      includeLeaf,
      verified,
    );
  } else {
    const home = toolHome(env);
    // Resolve only the explicitly configured root, never a link below it.
    const selected = toolHomeRoot(env);
    const staging = isWithin(selected, path) ? join(home, relative(selected, path)) : path;
    if (isWithin(stagingDir(env), staging)) {
      await assertUnredirected(home, staging, includeLeaf, verified);
    }
  }
}
