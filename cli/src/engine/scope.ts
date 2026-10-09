import { list } from "#adapter/text.ts";
import { AiregError, ErrorCode } from "#core/errors.ts";
import type { Ref } from "#core/ref.ts";
import { isWholeNamespace, isWholeRegistry, parseRef } from "#core/ref.ts";
import type { Candidate } from "#core/sync/adopt.ts";
import type { SyncItem } from "#core/sync/model.ts";
import type { RunScope } from "./inspect.ts";
import type { Scan } from "./scan.ts";

/** Typed so a caller can tell a mistyped address from a run with no work. */
export class RunScopeError extends AiregError {
  readonly refs: readonly string[];

  constructor(refs: readonly string[]) {
    // A run records only its message, so the way out is part of it.
    super(
      `${list(refs)} ${refs.length === 1 ? "matches" : "match"} nothing this job covers. ` +
        "Name an artifact as `<registry>/<namespace>/<kind>/<name>`, or by the name its runs show.",
      { code: ErrorCode.NotFound },
    );
    this.name = "RunScopeError";
    this.refs = refs;
  }
}

/** `<namespace>/<name>`, or a bare name when the registry groups it under none. */
function split(name: string): { namespace: string | undefined; leaf: string } {
  const cut = name.lastIndexOf("/");
  if (cut < 0) return { namespace: undefined, leaf: name };
  return { namespace: name.slice(0, cut), leaf: name.slice(cut + 1) };
}

function matchesItem(ref: Ref, registry: string, item: SyncItem): boolean {
  // Both sides: the ref has to name this job's registry, and the item has
  // to come from it. Another account's catalog is not this run's to narrow.
  if (ref.registry !== registry || item.source !== registry) return false;
  const { namespace, leaf } = split(item.name);
  if (isWholeRegistry(ref)) return true;
  if (isWholeNamespace(ref)) return ref.namespace === namespace;
  if (ref.kind !== item.kind || ref.name !== leaf) return false;
  // An address that names no namespace means "wherever it is", the same
  // reading `plan/select.ts` gives it.
  return ref.namespace === undefined || ref.namespace === namespace;
}

/**
 * A local artifact has no namespace to match on, so a whole registry or
 * namespace never adopts one by implication.
 */
function matchesCandidate(ref: Ref, registry: string, candidate: Candidate): boolean {
  if (ref.registry !== registry || ref.name !== candidate.name) return false;
  return ref.kind === undefined || ref.kind === candidate.kind;
}

/** Names this one ref reaches, in the vocabulary `classify` keys outcomes by. */
function reached(raw: string, registry: string, scan: Scan): Set<string> {
  const names = new Set<string>();
  // The catalog name is what a run's events name, so it is accepted alongside the address grammar.
  for (const item of scan.items) {
    if (item.source === registry && item.name === raw) names.add(item.name);
  }
  for (const candidate of scan.local) {
    if (candidate.name === raw) names.add(candidate.name);
  }

  let ref: Ref;
  try {
    ref = parseRef(raw);
  } catch {
    // Not an address; the exact-name pass above was its only reading.
    return names;
  }
  for (const item of scan.items) {
    if (matchesItem(ref, registry, item)) names.add(item.name);
  }
  for (const candidate of scan.local) {
    if (matchesCandidate(ref, registry, candidate)) names.add(candidate.name);
  }
  return names;
}

/**
 * `undefined` covers everything the job does. Throws when any ref reached
 * nothing, so a run cannot report success for work it never looked at.
 */
export function scopedNames(
  refs: RunScope,
  scan: Scan,
  registry: string,
): ReadonlySet<string> | undefined {
  if (refs === undefined) return undefined;
  const names = new Set<string>();
  const missed: string[] = [];
  for (const raw of refs) {
    const found = reached(raw, registry, scan);
    if (found.size === 0) {
      missed.push(raw);
      continue;
    }
    for (const name of found) names.add(name);
  }
  if (missed.length > 0) throw new RunScopeError(missed);
  return names;
}
