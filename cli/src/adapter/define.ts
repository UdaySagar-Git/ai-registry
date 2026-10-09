import {
  ADAPTER_ID,
  ADAPTER_PROTOCOL,
  advertisedCapabilities,
  type Capabilities,
  type SourceAdapter,
} from "./contract.ts";

/** What authors pass: protocol defaults, missing capability flags are off. */
export type AdapterInput = Omit<SourceAdapter, "capabilities" | "protocol"> & {
  protocol?: typeof ADAPTER_PROTOCOL;
  capabilities?: Partial<Capabilities>;
};

/** Factory so a third adapter looks like the first: id, protocol, filled capabilities. */
export function defineAdapter(adapter: AdapterInput): SourceAdapter {
  const protocol = adapter.protocol ?? ADAPTER_PROTOCOL;
  if (protocol !== ADAPTER_PROTOCOL) {
    throw new Error(
      `Adapter "${adapter.id}" implements protocol ${protocol}, not ${ADAPTER_PROTOCOL}.`,
    );
  }
  if (!ADAPTER_ID.test(adapter.id)) {
    throw new Error(`Adapter id "${adapter.id}" is not lowercase letters, digits and hyphens.`);
  }
  return {
    ...adapter,
    protocol,
    capabilities: advertisedCapabilities(adapter.capabilities),
  };
}
