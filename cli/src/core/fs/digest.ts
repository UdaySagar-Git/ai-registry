import { createHash, type Hash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { ENVELOPE } from "#adapter/filespec/names.ts";
import { sha256 } from "#adapter/spec/canonical.ts";
import { authored, type FileRecord, isDirectory, walk } from "#core/fs/tree.ts";

async function hashFile(hash: Hash, path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve())
      .on("error", reject);
  });
}

/**
 * Digests already taken, by path, with a stamp of each file's size, modification time
 * and inode: a long-running daemon surveys the same copies every tick, as git's index does.
 */
const KNOWN = new Map<string, { stamp: string; digest: string }>();
const KNOWN_LIMIT = 20_000;
/** A write this close to the hash may share its modification time with what was read. */
const RACY_MS = 2_000;

function stampOf(
  files: readonly Pick<FileRecord, "path" | "size" | "mtimeMs" | "ino" | "executable">[],
) {
  return sha256(
    files
      .map((file) => `${file.path}\0${file.size}\0${file.mtimeMs}\0${file.ino}\0${file.executable}`)
      .join("\n"),
  );
}

function remember(path: string, stamp: string, digest: string, newestMs: number): void {
  if (Date.now() - newestMs < RACY_MS) return;
  KNOWN.delete(path);
  KNOWN.set(path, { stamp, digest });
  const [oldest] = KNOWN.keys();
  if (KNOWN.size > KNOWN_LIMIT && oldest !== undefined) KNOWN.delete(oldest);
}

/** Has the copy on disk been edited since we placed it? */
export async function digest(path: string): Promise<string> {
  if (!(await isDirectory(path))) return digestFile(path);
  return digestFiles(path, path, await walk(path));
}

/**
 * What a person's own folder holds as a copy of it holds it (`copyAuthored`), so the
 * two digest alike: litter and anything refused are left out.
 */
export async function authoredDigest(path: string): Promise<string> {
  if (!(await isDirectory(path))) return digestFile(path);
  return digestFiles(path, `${path}\0authored`, (await authored(path)).files);
}

async function digestFiles(path: string, key: string, all: readonly FileRecord[]): Promise<string> {
  const hash = createHash("sha256");
  const files = all.filter((file) => file.path !== ENVELOPE);
  const stamp = stampOf(files);
  const known = KNOWN.get(key);
  if (known?.stamp === stamp) return known.digest;
  for (const file of files) {
    hash.update(`${file.path} ${file.executable ? "1" : "0"} `);
    await hashFile(hash, join(path, file.path));
    hash.update(" ");
  }
  const value = `sha256:${hash.digest("hex")}`;
  remember(
    key,
    stamp,
    value,
    files.reduce((newest, file) => Math.max(newest, file.mtimeMs), 0),
  );
  return value;
}

async function digestFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  const info = await stat(path);
  const stamp = stampOf([
    { path: "", size: info.size, mtimeMs: info.mtimeMs, ino: info.ino, executable: false },
  ]);
  const known = KNOWN.get(path);
  if (known?.stamp === stamp) return known.digest;
  await hashFile(hash, path);
  const value = `sha256:${hash.digest("hex")}`;
  remember(path, stamp, value, info.mtimeMs);
  return value;
}
