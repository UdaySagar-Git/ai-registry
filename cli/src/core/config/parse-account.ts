import type { Account } from "./model.ts";
import { fields } from "./parse-errors.ts";

const { onlyKnown, record, text } = fields;

export function parseAccount(value: unknown, index: number): Account {
  const where = `accounts[${index}]`;
  const entry = record(value, where);
  onlyKnown(entry, ["id", "registry", "defaultNamespace"], where);
  const id = text(entry, "id", where);
  const defaultNamespace =
    entry.defaultNamespace === undefined ? undefined : text(entry, "defaultNamespace", where);
  return {
    id,
    registry: text(entry, "registry", where),
    ...(defaultNamespace === undefined ? {} : { defaultNamespace }),
  };
}
