import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, normalize } from "node:path";
import { expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { clone } from "./clone.ts";
import { parseSource } from "./url.ts";

/** Serves `root` as plain files: git's dumb http protocol, which cannot clone shallow. */
function dumbHttp(root: string): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    const path = normalize(
      join(root, decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname)),
    );
    if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200);
    createReadStream(path).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, server });
    });
  });
}

test("falls back to a full clone when the server cannot clone shallow", async ({ tmp }) => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd });
  const work = join(tmp, "work");
  git(tmp, "init", "--quiet", "--initial-branch=main", work);
  await writeFile(join(work, "README.md"), "acme\n");
  git(work, "add", "README.md");
  git(work, "commit", "--quiet", "-m", "one");
  git(tmp, "clone", "--quiet", "--bare", work, join(tmp, "served", "acme.git"));
  git(join(tmp, "served", "acme.git"), "update-server-info");
  const { url, server } = await dumbHttp(join(tmp, "served"));
  try {
    const dest = join(tmp, "dest");
    await clone(parseSource(`${url}/acme.git`), undefined, dest, { timeoutMs: 30_000 });
    expect(await readFile(join(dest, "README.md"), "utf8")).toBe("acme\n");
  } finally {
    server.close();
  }
});
