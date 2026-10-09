import { describe, expect, it } from "vitest";
import {
  adapterArtifactUrl,
  adapterManifestUrl,
  adapterVersionManifestUrl,
  artifactBaseUrl,
  artifactUrl,
  isChannel,
} from "./origin.ts";

const PROD = "https://releases.example.com/aireg";

describe("channels", () => {
  it("accepts only a known channel", () => {
    expect(isChannel("stable")).toBe(true);
    expect(isChannel("canary")).toBe(true);
    expect(isChannel("nightly")).toBe(false);
  });
});

describe("artifact URLs", () => {
  it("refuses a version or filename that could reshape the path", () => {
    expect(artifactBaseUrl(PROD, "v0.2.0")).toBeUndefined();
    expect(artifactBaseUrl(PROD, "0.2")).toBeUndefined();
    expect(artifactUrl(PROD, "0.2.0", "../../../etc/passwd")).toBeUndefined();
    expect(artifactUrl(PROD, "0.2.0", "a/b.tgz")).toBeUndefined();
    expect(artifactUrl(PROD, "0.2.0", "")).toBeUndefined();
  });
});

describe("adapter URLs", () => {
  it("refuses an id or version that could reshape the path", () => {
    expect(adapterManifestUrl(PROD, "acme/../x", "stable")).toBeUndefined();
    expect(adapterArtifactUrl(PROD, "acme", "v1.4.0", "adapter.mjs")).toBeUndefined();
    expect(adapterVersionManifestUrl(PROD, "ACME", "1.4.0")).toBeUndefined();
  });
});
