import { describe, expect, it } from "vitest";
import type { Candidate } from "#core/sync/adopt.ts";
import type { SyncItem } from "#core/sync/model.ts";
import type { Scan } from "./scan.ts";
import { RunScopeError, scopedNames } from "./scope.ts";

const REGISTRY = "shop";

function item(name: string, kind: SyncItem["kind"] = "skill", source = REGISTRY): SyncItem {
  return { name, kind, source, path: name } as unknown as SyncItem;
}

function candidate(name: string, kind: Candidate["kind"] = "skill"): Candidate {
  return { name, kind } as unknown as Candidate;
}

function scanOf(items: SyncItem[], local: Candidate[] = []): Scan {
  return { items, local, undeclared: [] } as unknown as Scan;
}

const catalog = scanOf(
  [
    item("sales/deploy"),
    item("sales/lint"),
    item("engineering/lint"),
    item("engineering/lint", "agent"),
    item("loose"),
    item("other/deploy", "skill", "elsewhere"),
  ],
  [candidate("written-here")],
);

describe("scopedNames", () => {
  it("covers everything the job does when no refs were asked for", () => {
    expect(scopedNames(undefined, catalog, REGISTRY)).toBeUndefined();
  });

  it.each([
    ["the catalog name", "sales/deploy", ["sales/deploy"]],
    ["the address grammar manifest.yml uses", "shop/sales/skill/deploy", ["sales/deploy"]],
    ["a whole namespace", "shop/sales", ["sales/deploy", "sales/lint"]],
    ["one of two kinds that share a name", "shop/engineering/agent/lint", ["engineering/lint"]],
    [
      "an address with no namespace, wherever it is",
      "shop/skill/lint",
      ["engineering/lint", "sales/lint"],
    ],
    [
      "a local artifact the registry does not carry yet",
      "shop/skill/written-here",
      ["written-here"],
    ],
  ])("resolves %s", (_, ref, expected) => {
    expect([...(scopedNames([ref], catalog, REGISTRY) ?? [])].sort()).toEqual(expected);
  });

  it("reaches the whole registry, and only this job's", () => {
    const scoped = scopedNames(["shop"], catalog, REGISTRY);
    expect([...(scoped ?? [])]).not.toContain("other/deploy");
    expect([...(scoped ?? [])]).toContain("loose");
  });

  it("refuses a ref that reaches nothing rather than running empty", () => {
    expect(() => scopedNames(["shop/sales/skill/absent"], catalog, REGISTRY)).toThrow(
      RunScopeError,
    );
  });

  it("refuses an address whose registry is not this job's", () => {
    expect(() => scopedNames(["elsewhere/other/skill/deploy"], catalog, REGISTRY)).toThrow(
      RunScopeError,
    );
  });

  it("names every ref that missed, so one call fixes them all", () => {
    try {
      scopedNames(["sales/deploy", "nope", "also/nope"], catalog, REGISTRY);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RunScopeError);
      expect((error as RunScopeError).refs).toEqual(["nope", "also/nope"]);
    }
  });
});
