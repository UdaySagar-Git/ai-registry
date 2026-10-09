import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "vitest";
import { assertAdapterCompliance } from "#adapter/index.ts";
import { test } from "#test/kit/fixtures.ts";
import { sourceContext } from "#test/kit/source-context.ts";
import { skillBody, writeSpecRoot } from "#test/kit/spec-root.ts";
import adapter from "./index.ts";

test("meets the public adapter contract against a repository", async ({ tmp, git }) => {
  const work = join(tmp, "work");
  await git.init(work);
  await writeSpecRoot(work, [
    {
      namespace: "kit",
      kind: "skill",
      name: "lint",
      versions: [{ version: "1.0.0", files: { "SKILL.md": skillBody("lint") } }],
    },
  ]);
  await git.commit(work);
  const bare = join(tmp, "kit.git");
  await git(tmp, "clone", "-q", "--bare", work, bare);

  const location = pathToFileURL(bare).href;
  const context = sourceContext(
    { registry: "kit", location, config: {}, key: "sha256:k" },
    join(tmp, "cache"),
  );
  await expect(assertAdapterCompliance(adapter, context)).resolves.toBeUndefined();
});
