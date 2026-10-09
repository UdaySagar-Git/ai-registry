import { describe, expect, it } from "vitest";
import { AiregError, ErrorCode } from "#core/errors.ts";
import { type Accepts, AS, parse } from "./options.ts";

const GROUP: Accepts = {
  name: "group",
  actions: [
    { name: "list", aliases: ["ls"], maxArguments: 0 },
    { name: "get", maxArguments: 1 },
    { name: "set", maxArguments: 2 },
    { name: "any" },
  ],
};

function refusal(argv: string[], accepts: Accepts = GROUP): AiregError {
  try {
    parse(argv, accepts);
  } catch (error) {
    if (error instanceof AiregError) return error;
    throw error;
  }
  throw new Error(`parse accepted ${argv.join(" ")}`);
}

describe("parse, for an action's arguments", () => {
  it("takes up to as many words as the action declares", () => {
    expect(parse(["list"], GROUP).positionals).toEqual(["list"]);
    expect(parse(["get", "a"], GROUP).positionals).toEqual(["get", "a"]);
    expect(parse(["set", "a", "b"], GROUP).positionals).toEqual(["set", "a", "b"]);
    expect(parse(["any", "a", "b", "c"], GROUP).positionals).toEqual(["any", "a", "b", "c"]);
  });

  it("refuses a word after an action that takes none", () => {
    const error = refusal(["list", "zz", "more"]);
    expect(error.code).toBe(ErrorCode.Usage);
    expect(error.message).toBe('`aireg group list` takes no argument, not "zz".');
    expect(error.hint).toBe("Run `aireg group list --help` for its usage.");
  });

  it("checks an action that parses on its own", () => {
    const error = refusal(["v1", "v2"], { name: "self update", maxArguments: 1 });
    expect(error.code).toBe(ErrorCode.Usage);
    expect(error.message).toContain('not also "v2"');
  });

  it("escapes what it echoes", () => {
    expect(refusal(["list", "a\u202Eb"]).message).toContain('"a\\u202Eb"');
  });
});

describe("parse, for an action's aliases", () => {
  it("hands the command the action's name for an alias", () => {
    expect(parse(["ls"], GROUP).positionals).toEqual(["list"]);
  });
});

describe("parse, for --as", () => {
  const ADD: Accepts = { name: "registry", actions: [{ name: "add", options: [AS] }] };

  it("takes an alias in the spec's name grammar", () => {
    expect(parse(["add", "x", "--as", "acme-2"], ADD).own).toMatchObject({ as: "acme-2" });
  });

  it("refuses any other alias as a usage error", () => {
    for (const alias of ["", "../evil", "Evil Name", "a/b", "x-", "a".repeat(65)]) {
      const error = refusal(["add", "x", "--as", alias], ADD);
      expect(error.code, alias).toBe(ErrorCode.Usage);
      expect(error.message, alias).toMatch(/^--as takes a name such as acme, not /);
    }
    expect(refusal(["add", "x", "--as", "a\u202Eb"], ADD).message).toContain('"a\\u202Eb"');
  });
});
