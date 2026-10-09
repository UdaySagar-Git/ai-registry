import {
  isSafePath,
  openFolderRegistry,
  type Resolution,
  registryPath,
  type SourceContext,
  type SourceHandle,
} from "#adapter/index.ts";
import { fail, translating } from "./errors.ts";
import { resolveRef } from "./resolve.ts";
import { snapshot } from "./snapshot.ts";
import { parseSource } from "./url.ts";

/**
 * A repository that is a file spec root. The clone is only a cache, so this is
 * the shared reader over a checkout plus a revision to pin.
 */
export async function connect(context: SourceContext): Promise<SourceHandle> {
  const spec = parseSource(context.source.location);
  if (spec.kind !== "git") {
    throw fail("invalid", `${context.source.location} is not a repository.`);
  }

  const ref = context.source.config.ref ?? spec.ref;
  const folder = context.source.config.path ?? spec.path ?? "";
  if (folder !== "" && !isSafePath(folder)) {
    throw fail("invalid", `${folder} is not a folder inside the repository.`);
  }
  // A checkout is one commit, so what it lists never changes.
  const files = openFolderRegistry({ immutable: true });
  const limits = {
    timeoutMs: context.limits.timeoutMs,
    timeoutSetting: context.limits.timeoutSetting,
    signal: context.signal,
  };

  return {
    resolve: (want, options): Promise<Resolution> =>
      translating(async () => {
        const resolved = await resolveRef(spec, ref, limits);
        const placed = await snapshot(() => context.cacheDir(), spec, ref, resolved.commit, limits);
        const clone = await registryPath(placed.root, folder, true);
        const resolution = await files.resolve(clone, want, options?.all);
        // The revision pins the source, not the content, so an unrelated commit
        // cannot re-identify bytes that never moved.
        return { ...resolution, sourceRevision: placed.commit ?? resolved.commit };
      }),

    localRoot: (artifact) => translating(() => files.localRoot(artifact)),

    fetch: (artifact, file) => translating(() => files.fetch(artifact, file)),

    async close(): Promise<void> {},
  };
}
