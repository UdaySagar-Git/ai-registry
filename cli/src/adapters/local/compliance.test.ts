import { join } from "node:path";
import { expect } from "vitest";
import { assertAdapterCompliance } from "#adapter/index.ts";
import { test } from "#test/kit/fixtures.ts";
import { sourceContext } from "#test/kit/source-context.ts";
import { skillBody, writeSpecRoot } from "#test/kit/spec-root.ts";
import local from "./index.ts";

test("meets the public adapter contract against a registry folder", async ({ tmp }) => {
  const root = join(tmp, "registry");
  await writeSpecRoot(root, [
    {
      namespace: "kit",
      kind: "skill",
      name: "lint",
      versions: [{ version: "1.0.0", files: { "SKILL.md": skillBody("lint") } }],
    },
  ]);
  const context = sourceContext(
    { registry: "kit", location: root, config: {}, key: "sha256:k" },
    join(tmp, "cache"),
  );
  await expect(assertAdapterCompliance(local, context)).resolves.toBeUndefined();
});
