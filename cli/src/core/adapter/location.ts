import { isAbsolute, resolve as resolvePath } from "node:path";
import { expandHome, isLocalPath } from "#adapter/paths.ts";
import { dotRelative } from "#core/fs/path.ts";
import type { Roots } from "#core/store/paths.ts";

/** A relative path means relative to the project, and only the client knows where that is. */
export function expandLocation(location: string, cwd: string): string {
  if (!isLocalPath(location)) return location;
  const expanded = expandHome(location);
  return isAbsolute(expanded) ? expanded : resolvePath(cwd, expanded);
}

/**
 * How a project's manifest records a location: a path typed as relative stays
 * relative, to the project's root, so a clone works wherever it is checked out.
 */
export function recordedLocation(
  typed: string,
  location: string,
  roots: Pick<Roots, "scope" | "base">,
): string {
  if (roots.scope === "user" || !isLocalPath(typed) || isAbsolute(typed) || typed.startsWith("~")) {
    return location;
  }
  return dotRelative(roots.base, location);
}
