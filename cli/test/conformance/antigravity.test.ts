import { conformance } from "#test/conformance/kit.ts";

// `agy agents` lists agents without a session; listing skills needs a signed-in one.
conformance({
  id: "antigravity",
  env: () => ({ AGY_CLI_DISABLE_AUTO_UPDATE: "true" }),
  probes: [{ scope: "user", argv: ["agy", "agents"], expect: [/^reviewer$/m, /^planner$/m] }],
});
