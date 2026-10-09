import { expect, it } from "vitest";
import { assertAdapterConfig } from "#adapter/config.ts";
import git from "./index.ts";

it("takes the ref and path it reads from config, and refuses any other key", () => {
  const check = (config: Record<string, string>) =>
    assertAdapterConfig(git.id, git.configSchema, config);
  expect(() => check({ ref: "main", path: "kit" })).not.toThrow();
  expect(() => check({ branch: "main" })).toThrow(/does not take `branch`/);
});
