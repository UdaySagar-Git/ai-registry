import { withoutCredentials } from "#adapter/text.ts";
import type { DeclaredRegistry } from "#cli/commands/registry/result.ts";
import type { RegistrySource } from "#core/manifest/model.ts";

/** A declared registry under `--json`, in the words every command uses. */
export function described(alias: string, source: RegistrySource): DeclaredRegistry {
  return {
    registry: alias,
    address: withoutCredentials(source.location),
    ...(source.adapter === undefined ? {} : { adapter: source.adapter }),
    config: source.config,
  };
}
