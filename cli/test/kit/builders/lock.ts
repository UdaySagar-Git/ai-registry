import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  emptyLock,
  formatLock,
  type Lock,
  type LockArtifact,
  type LockRegistry,
} from "#core/lock.ts";
import { lockPath } from "#test/kit/scope.ts";

/** A lockfile, each row filled with the least a reader accepts unless the test says more. */
class LockBuilder {
  readonly #lock: Lock = emptyLock();
  #last: string | undefined;

  registry(alias: string, row: Partial<LockRegistry> & { location: string }): this {
    this.#lock.registries[alias] = {
      adapter: "git",
      key: `sha256:${alias}`,
      config: {},
      revision: undefined,
      ...row,
    };
    this.#last = alias;
    return this;
  }

  /** Recorded against the registry declared last, unless the row names one. */
  artifact(name: string, row: Partial<LockArtifact> = {}): this {
    const registry = row.registry ?? this.#last;
    if (registry === undefined) throw new Error(`Declare a registry before ${name}.`);
    this.#lock.artifacts[name] = {
      registry,
      id: undefined,
      name,
      kind: "skill",
      namespace: undefined,
      address: undefined,
      content: undefined,
      version: undefined,
      path: `artifacts/${name}`,
      digest: "sha256:0",
      origin: undefined,
      links: [],
      ...row,
    };
    return this;
  }

  build(): Lock {
    return structuredClone(this.#lock);
  }

  text(): string {
    return formatLock(this.#lock);
  }

  /** Into `<dir>/.registry/manifest.lock.yml`, returning that path. */
  async write(dir: string): Promise<string> {
    const path = lockPath(dir);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, this.text());
    return path;
  }
}

export function lock(): LockBuilder {
  return new LockBuilder();
}
