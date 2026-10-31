import { Type } from "@sinclair/typebox";
import { KINDS } from "#adapter/kinds.ts";
import type { SyncPreview, SyncResolved, SyncRuns } from "#cli/commands/sync/result.ts";
import { ITEM_OUTCOMES, RUN_MODES, RUN_STATES, RUN_TRIGGERS } from "#core/run/model.ts";
import { SCOPES } from "#core/store/paths.ts";
import { DISPOSITIONS } from "#core/sync/model.ts";
import { SYNC_OPERATIONS } from "#core/sync/policy.ts";
import { matching, outputDocument } from "./match.ts";

const oneOf = <T extends string>(values: readonly T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));

const Kind = oneOf(KINDS);
const Scope = oneOf(SCOPES);
const Disposition = oneOf(DISPOSITIONS);
const RunState = oneOf(RUN_STATES);

const Counts = Type.Object(
  {
    examined: Type.Number(),
    changed: Type.Number(),
    skipped: Type.Number(),
    attention: Type.Number(),
    failed: Type.Number(),
  },
  { additionalProperties: false },
);

const Found = Type.Object(
  {
    name: Type.String(),
    kind: Kind,
    path: Type.String({ description: "Its folder, relative to the scope." }),
    target: Type.String(),
  },
  { additionalProperties: false },
);

const Preview = Type.Object(
  {
    dryRun: Type.Literal(true),
    scope: Scope,
    artifacts: Type.Array(
      Type.Object(
        {
          name: Type.String(),
          kind: Kind,
          path: Type.String({ description: "Its address in the registry." }),
          disposition: Disposition,
          digests: Type.Object(
            {
              base: Type.Optional(Type.String()),
              local: Type.Optional(Type.String()),
              upstream: Type.Optional(Type.String()),
            },
            { additionalProperties: false, description: "A side with no bytes has no digest." },
          ),
          detail: Type.Optional(Type.String()),
          failure: Type.Optional(
            Type.Object(
              { code: Type.String(), retryable: Type.Boolean() },
              { additionalProperties: false },
            ),
          ),
          registry: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
    local: Type.Array(
      Type.Object(
        {
          name: Type.String(),
          kind: Kind,
          path: Type.String({ description: "Its folder, relative to the scope." }),
          target: Type.String(),
          suggestedPath: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
    undeclared: Type.Array(Found),
    linkable: Type.Array(Found),
    changed: Type.Array(Found),
    kept: Type.Array(Found),
  },
  { additionalProperties: false, description: "Under --dry-run." },
);

const Settled = Type.Object(
  {
    name: Type.String(),
    kind: Type.Optional(Kind),
    outcome: oneOf(ITEM_OUTCOMES),
    operation: Type.Optional(oneOf(SYNC_OPERATIONS)),
    disposition: Type.Optional(Disposition),
  },
  { additionalProperties: false },
);

const Runs = Type.Object(
  {
    dryRun: Type.Literal(false),
    scope: Scope,
    runs: Type.Array(
      Type.Object(
        {
          registry: Type.String(),
          id: Type.String(),
          state: RunState,
          counts: Counts,
          artifacts: Type.Array(Settled),
          warnings: Type.Array(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false, description: "Without --dry-run, a run per registry." },
);

const Sync = matching<SyncPreview | SyncRuns>()(Type.Union([Preview, Runs]));

const Resolved = matching<SyncResolved>()(
  Type.Object(
    {
      run: Type.Object(
        {
          id: Type.String(),
          jobId: Type.Optional(Type.String()),
          accountId: Type.String(),
          configRevision: Type.Number(),
          mode: oneOf(RUN_MODES),
          trigger: oneOf(RUN_TRIGGERS),
          state: RunState,
          step: Type.Optional(Type.String()),
          requestedAtMs: Type.Number({ description: "Milliseconds since the Unix epoch." }),
          startedAtMs: Type.Optional(Type.Number()),
          deadlineAtMs: Type.Number(),
          finishedAtMs: Type.Optional(Type.Number()),
          counts: Counts,
          errorCode: Type.Optional(Type.String()),
          retryable: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      artifacts: Type.Array(Settled),
    },
    { additionalProperties: false },
  ),
);

export const OUTPUT = outputDocument("sync", { sync: Sync, resolve: Resolved });
