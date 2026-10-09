import { FAILURE_CODES } from "./codes.ts";
import { failureFromStatus, problemFromFailure } from "./problem.ts";
import type { Problem } from "./spec/types.ts";

/** Every failure an adapter can report, classified so callers branch on shape. */
export const FAILURES = [
  // A credential is missing or was refused.
  "unauthorized",
  // Authenticated, but this operation is not permitted.
  "forbidden",
  // The source or artifact is not there.
  "not_found",
  // Someone else got there first.
  "conflict",
  // The server is at fault: 5xx, a timeout, a refused account.
  "unavailable",
  // The request was wrong, or the answer was not what the contract promised.
  "invalid",
] as const;

/** How a failure is classified, which decides whether aireg retries it and what it tells the person. */
export type Failure = (typeof FAILURES)[number];

interface AdapterErrorOptions {
  artifact?: string | undefined;
  retryAfterMs?: number | undefined;
  cause?: unknown | undefined;
  problem?: Problem | undefined;
  hint?: string | undefined;
}

/** The error an adapter throws, so aireg can classify it, retry it and explain it. */
export class AdapterError extends Error {
  /** The adapter's id. */
  readonly adapter: string;
  /** How the failure is classified. */
  readonly failure: Failure;
  /** The artifact this failure concerns, when it concerns one. */
  readonly artifact: string | undefined;
  /** Milliseconds the server asked to be left alone for, when it said. */
  readonly retryAfterMs: number | undefined;
  /** RFC 9457 problem. Always set when this process constructed the error. */
  readonly problem: Problem;
  /** What the person should do next, shown under the message. */
  readonly hint: string | undefined;

  constructor(
    adapter: string,
    failure: Failure,
    message: string,
    options: AdapterErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AdapterError";
    this.adapter = adapter;
    this.failure = failure;
    this.artifact = options.artifact;
    this.retryAfterMs = options.retryAfterMs;
    this.hint = options.hint;
    this.problem = options.problem ?? problemFromFailure(failure, message);
  }
}

/** Packed adapters bundle a second copy of this class; branch on shape, not instanceof. */
export function isAdapterError(error: unknown): error is AdapterError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Record<string, unknown>;
  if (candidate.name !== "AdapterError") return false;
  if (typeof candidate.adapter !== "string") return false;
  return (FAILURES as readonly string[]).includes(candidate.failure as string);
}

/** Retrying a 404 wastes a round trip and retrying a 403 cannot succeed. */
export function isRetryable(error: unknown): boolean {
  return isAdapterError(error) && error.failure === "unavailable";
}

/** Signing in again, or as someone allowed, is what fixes it. */
export function isAuthFailure(failure: Failure | undefined): boolean {
  return failure === "unauthorized" || failure === "forbidden";
}

/** Packed adapters may omit `problem`; mint the catalog code from `failure`. */
export function adapterProblem(error: AdapterError): Problem {
  const value = Reflect.get(error, "problem");
  if (typeof value === "object" && value !== null) {
    const code = Reflect.get(value, "code");
    if (typeof code === "string" && code !== "") return value as Problem;
  }
  return problemFromFailure(error.failure, error.message);
}

/** Status wins; otherwise the catalog code this client minted. */
export function failureOf(problem: Problem): Failure {
  if (problem.status !== undefined) return failureFromStatus(problem.status);
  for (const failure of FAILURES) {
    if (FAILURE_CODES[failure] === problem.code) return failure;
  }
  return "invalid";
}
