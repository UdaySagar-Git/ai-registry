import { dirname, resolve } from "node:path";
import { resolveHarnesses } from "#core/harness/index.ts";
import { applyRegister, type Kept, type Touched } from "#core/harness/register/index.ts";
import type { Roots } from "#core/store/paths.ts";
import type { Action } from "./model.ts";

/**
 * Edits the configs of harnesses that load a placement only once they list it,
 * for the links this apply made or removed. Returns the entries it left to a person.
 */
export async function applyRegistrations(
  actions: readonly Action[],
  roots: Pick<Roots, "artifacts">,
): Promise<Kept[]> {
  const touched = actions.flatMap((action): Touched[] => {
    if (action.kind === "link") return [{ path: action.to, harness: action.harness }];
    if (action.kind === "unlink") return [{ path: action.to, harness: undefined }];
    return [];
  });
  if (touched.length === 0) return [];
  return applyRegister(touched, resolveHarnesses(), resolve(dirname(roots.artifacts)));
}
