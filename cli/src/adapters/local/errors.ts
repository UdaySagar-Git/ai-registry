import { messageOf } from "#adapter/errors.ts";
import { AdapterError, SpecError } from "#adapter/index.ts";

export const ID = "local";

export function fail(
  failure: "invalid" | "not_found" | "conflict",
  message: string,
  artifact?: string,
  hint?: string,
): AdapterError {
  return new AdapterError(ID, failure, message, { artifact, hint });
}

/** A failure as this adapter's, so a spec problem never reads as an unclassified throw. */
export function translated(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof SpecError) {
    return fail(error.missing ? "not_found" : "invalid", error.message, error.artifact, error.hint);
  }
  return fail("invalid", messageOf(error));
}

/** One boundary where a thrown failure becomes an `AdapterError`. */
export async function translating<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw translated(error);
  }
}
