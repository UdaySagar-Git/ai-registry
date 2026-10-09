import { describe, expect, it } from "vitest";
import { ownSkillsCommand, ownSkillsRef } from "./own-skills.ts";

describe("ownSkillsRef", () => {
  it("is the tag the release workflow creates for a release build", () => {
    expect(ownSkillsRef("1.2.3")).toBe("aireg-v1.2.3");
  });

  it("is nothing for a development build, which no tag names", () => {
    expect(ownSkillsRef("0.0.0-dev")).toBeUndefined();
    expect(ownSkillsRef("1.2.3-dev.4")).toBeUndefined();
  });
});

describe("ownSkillsCommand", () => {
  it("pins the registry to the release and names it as setup does", () => {
    expect(ownSkillsCommand("aireg", "1.2.3")).toBe(
      "aireg registry add github.com/atlanai/ai-registry --path examples/aireg --ref aireg-v1.2.3 --as ai-registry -g && aireg add ai-registry/aireg -g",
    );
  });

  it("follows the default branch only when there is no release to pin", () => {
    expect(ownSkillsCommand("aireg", "1.2.3-dev.4")).not.toContain("--ref");
  });
});
