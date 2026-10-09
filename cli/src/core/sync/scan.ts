import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeName } from "#adapter/text.ts";
import { descriptionText, frontmatter } from "#core/catalog/frontmatter.ts";
import type { Entry } from "#core/catalog/model.ts";
import { posixRelative } from "#core/fs/path.ts";
import { isDirectory } from "#core/fs/tree.ts";
import type { ArtifactKind, KindSpec } from "#core/kinds.ts";

type KindDir = KindSpec & { kind: ArtifactKind };

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function describe(
  file: string,
  fallback: string,
): Promise<{ name: string; description: string | undefined; engine: string | undefined }> {
  try {
    const meta = frontmatter(await readFile(file, "utf8"));
    return {
      name: sanitizeName(meta.name ?? fallback),
      description: meta.description === undefined ? undefined : descriptionText(meta.description),
      engine: meta.engine,
    };
  } catch {
    return { name: sanitizeName(fallback), description: undefined, engine: undefined };
  }
}

async function directoryEntry(
  root: string,
  full: string,
  folder: string,
  spec: Omit<KindDir, "dir">,
  group: string | undefined,
): Promise<Entry | undefined> {
  // Harnesses keep folders of their own beside artifacts; one without the
  // entry file its kind declares is not that kind, and a publish is refused.
  const marker = spec.entry === undefined ? undefined : join(full, spec.entry);
  if (marker !== undefined && !(await isFile(marker))) return undefined;
  const { name, description, engine } =
    marker === undefined
      ? { name: sanitizeName(folder), description: undefined, engine: undefined }
      : await describe(marker, folder);
  return {
    name,
    kind: spec.kind,
    path: posixRelative(root, full),
    group,
    description,
    engine,
    from: { file: posixRelative(root, marker ?? full), pointer: "" },
  };
}

async function fileEntry(
  root: string,
  full: string,
  file: string,
  spec: Omit<KindDir, "dir">,
  group: string | undefined,
): Promise<Entry | undefined> {
  const extension = spec.extensions.find((ext) => file.endsWith(ext));
  if (extension === undefined) return undefined;
  const stem = file.slice(0, -extension.length);
  const { name, description, engine } =
    extension === ".json"
      ? { name: sanitizeName(stem), description: undefined, engine: undefined }
      : await describe(full, stem);
  return {
    name,
    kind: spec.kind,
    path: posixRelative(root, full),
    group,
    description,
    engine,
    from: { file: posixRelative(root, full), pointer: "" },
  };
}

/** Scan one kind directory using the same naming rules for sources and harnesses. */
export async function entriesIn(
  root: string,
  dir: string,
  spec: Omit<KindDir, "dir">,
  group: string | undefined,
): Promise<Entry[]> {
  if (!(await isDirectory(dir))) return [];

  const items = await readdir(dir, { withFileTypes: true });
  const entries: Entry[] = [];

  for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name.startsWith(".")) continue;
    const full = join(dir, item.name);
    // A symlink is never an entry: whoever made it, such as a dotfiles checkout, owns what it points at.
    const entry =
      spec.shape === "directory"
        ? item.isDirectory()
          ? await directoryEntry(root, full, item.name, spec, group)
          : undefined
        : item.isFile()
          ? await fileEntry(root, full, item.name, spec, group)
          : undefined;
    if (entry !== undefined) entries.push(entry);
  }

  return entries;
}
