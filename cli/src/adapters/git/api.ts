// Everything outside this folder reads the git adapter through this module alone.
import type { SourceLimits } from "#adapter/index.ts";
import { resolveRef } from "./resolve.ts";
import { parseSource, type pastedRepository } from "./url.ts";

export { ID } from "./errors.ts";
export { stopGit } from "./exec.ts";
export { parseSource, pastedRepository, splitRepository } from "./url.ts";

type PastedLink = ReturnType<typeof pastedRepository>;

/**
 * `.../tree/feat/x/examples/registry` could name branch `feat` or `feat/x`, so the
 * longest prefix the repository really has is the ref, as the code host reads it.
 */
export async function settlePastedLink(
  pasted: PastedLink,
  limits: SourceLimits,
): Promise<PastedLink> {
  if (pasted?.ref === undefined || pasted.path === undefined) return pasted;
  const parts = [pasted.ref, ...pasted.path.split("/")];
  const spec = parseSource(pasted.location);
  for (let at = parts.length - 1; at >= 1; at -= 1) {
    const ref = parts.slice(0, at).join("/");
    try {
      await resolveRef(spec, ref, limits);
      return { ...pasted, ref, path: parts.slice(at).join("/") };
    } catch {
      // Not a ref this repository has; try a shorter one.
    }
  }
  return pasted;
}
