import { conformance } from "#test/conformance/kit.ts";

conformance({
  id: "grok",
  env: (home) => ({ GROK_HOME: `${home}/.grok`, GROK_DISABLE_AUTOUPDATER: "1" }),
  probes: [
    {
      scope: "user",
      argv: ["grok", "inspect", "--json"],
      expect: [/\.grok\/skills\/lint\/SKILL\.md/, /\.grok\/skills\/ship\/SKILL\.md/, /"reviewer"/],
    },
    // Releases differ on loading an untrusted project's skills, so only its agent is checked.
    {
      scope: "project",
      argv: ["grok", "inspect", "--json"],
      expect: [/project\/\.grok\/agents\/reviewer\.md/],
    },
  ],
});
