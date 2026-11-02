import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const LAYER = fileURLToPath(new URL("..", import.meta.url));

// This layer writes escape sequences, so a literal control byte can hide in a template literal.
describe("source hygiene", () => {
  const files = readdirSync(LAYER, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .sort();

  test.each(files)("%s has no literal control bytes", (name) => {
    const text = readFileSync(join(LAYER, name), "utf8");
    const found = [...text].filter(
      (char) => char.charCodeAt(0) < 32 && char !== "\n" && char !== "\t",
    );
    expect(found).toEqual([]);
  });
});
