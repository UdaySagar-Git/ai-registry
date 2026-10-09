import { createHash } from "node:crypto";

/** Hex SHA-256, the form a release checksum file and a key derived from a path use. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Whether `value` is a SHA-256 digest in the lowercase hex `sha256Hex` writes. */
export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** A short, stable key for a value such as a path, where a full digest is too long to read. */
export function shortHash(value: string, length = 16): string {
  return sha256Hex(value).slice(0, length);
}
