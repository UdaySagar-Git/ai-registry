import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  openFolderRegistry,
  type PublishInput,
  type PublishResult,
  REGISTRY_DOCUMENT,
  type Resolution,
  registryPath,
  type SourceContext,
  type SourceHandle,
} from "#adapter/index.ts";
import { fail, translating } from "./errors.ts";
import { writeOffer } from "./publish.ts";

export async function connect(context: SourceContext): Promise<SourceHandle> {
  const root = context.source.location;
  if (!isAbsolute(root)) {
    throw fail("invalid", `${root} was not expanded to an absolute path.`);
  }
  if (!existsSync(root)) throw fail("not_found", `The folder ${root} does not exist.`);
  // A bare repository has no working tree to read; git reads it by URL.
  if (
    !existsSync(join(root, REGISTRY_DOCUMENT)) &&
    existsSync(join(root, "HEAD")) &&
    existsSync(join(root, "objects"))
  ) {
    throw fail(
      "invalid",
      `${root} is a bare git repository.`,
      undefined,
      `Add it by its URL instead: ${pathToFileURL(root).href}`,
    );
  }

  await translating(() => registryPath(root, "", true));
  const files = openFolderRegistry();

  return {
    resolve: (want, options): Promise<Resolution> =>
      translating(() => files.resolve(root, want, options?.all)),

    /**
     * The version directory is already content the spec describes, so it is
     * copied from where it sits rather than staged into a second store first.
     */
    localRoot: (artifact) => translating(() => files.localRoot(artifact)),

    fetch: (artifact, file) => translating(() => files.fetch(artifact, file)),

    /** Written in place, and read by the next resolve. */
    async publish(changes: readonly PublishInput[]): Promise<PublishResult> {
      return translating(async () => {
        const written = await writeOffer(
          root,
          changes,
          new Date().toISOString(),
          context.exclusive,
        );
        files.forget();
        return { unchanged: written.unchanged, location: root };
      });
    },

    async close(): Promise<void> {},
  };
}
