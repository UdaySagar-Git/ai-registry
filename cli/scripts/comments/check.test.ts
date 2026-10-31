import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkText, checkTree } from "./check.ts";

function rules(text: string, file = "src/core/example.ts"): string[] {
  return checkText(file, text).map((problem) => problem.rule);
}

describe("checkText", () => {
  test.each([
    ["stacked", "/** One. */\n/** Two. */\nexport const A = 1;\n"],
    ["detached", "const B = 2;\n/** Gone. */\n\nexport const A = 1;\n"],
    ["trailing", "export const A = 1; // why\n"],
    ["in-value", "export const A = {\n  /** Doc. */\n  b: 1,\n};\n"],
    ["long-doc", "/**\n * One.\n * Two.\n * Three.\n */\nfunction f() {}\n"],
    ["long-run", "// One.\n// Two.\n// Three.\nconst A = 1;\n"],
    ["directive", "// biome-ignore lint/style/useConst:\nlet a = 1;\n"],
  ])("reports %s", (rule, text) => {
    expect(rules(text)).toEqual([rule]);
  });

  test.each([
    ["a module doc on the first line", "/** The module. */\n\n/** A. */\nexport const A = 1;\n"],
    ["a // note on one entry of a value", "export const A = [\n  // Why this one.\n  1,\n];\n"],
    [
      "a doc on a field of an inline type",
      "function f(options: {\n  /** Why. */\n  a?: boolean;\n}) {}\n",
    ],
    ["a doc on an interface field", "interface A {\n  /** Why. */\n  a: string;\n}\n"],
    ["slashes inside a regular expression", "const URL = /https?:\\/\\//;\n"],
    ["slashes inside a template", "const A = `$" + "{b}//not a comment $" + "{c}`;\n"],
    [
      "a directive with its reason",
      "// biome-ignore lint/style/useConst: reassigned below.\nlet a = 1;\n",
    ],
  ])("accepts %s", (_, text) => {
    expect(rules(text)).toEqual([]);
  });

  test("lets the published contract keep longer docs and docs inside values", () => {
    const text =
      "export const A = {\n  /**\n   * One.\n   * Two.\n   * Three.\n   */\n  b: 1,\n};\n";
    expect(rules(text, "src/adapter/example.ts")).toEqual([]);
    expect(rules(text)).toEqual(["in-value", "long-doc"]);
  });
});

test("the CLI's own source passes", () => {
  expect(checkTree(join(import.meta.dirname, "..", ".."))).toEqual([]);
});
