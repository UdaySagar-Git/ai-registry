import { describe, expect, it } from "vitest";
import { type Searchable, search } from "./search.ts";

function item(name: string, extra: Partial<Searchable> = {}): Searchable {
  return { name, namespace: "engineering", description: undefined, labels: undefined, ...extra };
}

const names = (items: readonly Searchable[]) => items.map((entry) => entry.name);

describe("search", () => {
  it("ranks an exact name, then a prefix, then a name that contains it, then the rest", () => {
    const items = [
      item("lint", { description: "Checks review comments" }),
      item("code-review"),
      item("review-bot"),
      item("review"),
    ];
    expect(names(search(items, "review"))).toEqual(["review", "review-bot", "code-review", "lint"]);
  });

  it("ignores case", () => {
    expect(names(search([item("PR-Review")], "pr-REVIEW"))).toEqual(["PR-Review"]);
  });

  it("needs every word to match somewhere", () => {
    const items = [
      item("pr-review", { description: "Review a pull request" }),
      item("deploy", { description: "Ship a release" }),
    ];
    expect(names(search(items, "pull review"))).toEqual(["pr-review"]);
    expect(names(search(items, "pull ship"))).toEqual([]);
  });

  it("matches the namespace, the description and the labels", () => {
    const items = [
      item("one", { namespace: "platform" }),
      item("two", { description: "Talks to Postgres" }),
      item("three", { labels: { language: "python" } }),
      item("four", { labels: { frontend: "yes" } }),
    ];
    expect(names(search(items, "platform"))).toEqual(["one"]);
    expect(names(search(items, "postgres"))).toEqual(["two"]);
    expect(names(search(items, "python"))).toEqual(["three"]);
    expect(names(search(items, "frontend"))).toEqual(["four"]);
  });

  it("reads words joined by a space as the hyphenated name", () => {
    expect(names(search([item("x-pr-review"), item("pr-review")], "pr review"))).toEqual([
      "pr-review",
      "x-pr-review",
    ]);
  });

  it("orders equal ranks by name, then namespace", () => {
    const items = [item("b", { namespace: "z" }), item("b", { namespace: "a" }), item("a")];
    expect(search(items, "b").map((entry) => entry.namespace)).toEqual(["a", "z"]);
  });

  it("finds nothing for a blank query", () => {
    expect(search([item("lint")], "   ")).toEqual([]);
  });
});
