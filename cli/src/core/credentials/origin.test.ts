import { describe, expect, it } from "vitest";
import { credentialOrigin } from "./origin.ts";

describe("credentialOrigin", () => {
  it("keeps the scheme, lowercases the host and drops a default port", () => {
    expect(credentialOrigin("https://Registry.Acme.Example/teams/one/")).toBe(
      "https://registry.acme.example",
    );
    expect(credentialOrigin("https://registry.acme.example:443/x")).toBe(
      "https://registry.acme.example",
    );
    expect(credentialOrigin("https://registry.acme.example:8443/x")).toBe(
      "https://registry.acme.example:8443",
    );
    expect(credentialOrigin("http://localhost:80/x")).toBe("http://localhost");
    expect(credentialOrigin("http://registry.acme.example")).toBe("http://registry.acme.example");
  });

  it("ignores user info, query and fragment, so none can move a token elsewhere", () => {
    expect(credentialOrigin("https://other.example@registry.acme.example/x?y#z")).toBe(
      "https://registry.acme.example",
    );
  });

  it("binds every spelling of a git address to its host over https", () => {
    for (const location of [
      "https://github.com/acme/ai-registry.git",
      "github.com/acme/ai-registry",
      "git@github.com:acme/ai-registry.git",
      "ssh://git@github.com/acme/ai-registry.git",
      "ssh://git@GitHub.com:22/acme/ai-registry.git",
      "git+ssh://git@github.com/acme/ai-registry.git",
    ]) {
      expect(credentialOrigin(location), location).toBe("https://github.com");
    }
  });

  it("gives a folder no origin, so no sign-in ever applies to one", () => {
    for (const location of ["/srv/registry", "./registry", "~/registry", "file:///srv/registry"]) {
      expect(credentialOrigin(location), location).toBeUndefined();
    }
    expect(credentialOrigin("acme/platform")).toBeUndefined();
  });

  it("keeps another adapter's scheme with its lowercase host", () => {
    expect(credentialOrigin("acme+registry://Registry.Acme.Example/x")).toBe(
      "acme+registry://registry.acme.example",
    );
  });
});
