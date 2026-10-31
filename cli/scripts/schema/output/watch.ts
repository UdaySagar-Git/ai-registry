import { Type } from "@sinclair/typebox";
import type { WatchList, WatchRemoved } from "#cli/commands/watch/result.ts";
import { SCOPES } from "#core/store/paths.ts";
import { matching, outputDocument } from "./match.ts";

const List = matching<WatchList>()(
  Type.Object(
    {
      watches: Type.Array(
        Type.Object(
          {
            folder: Type.String(),
            to: Type.String({ description: "Where it publishes, as <registry>/<namespace>." }),
            jobId: Type.String(),
            scope: Type.Union(SCOPES.map((scope) => Type.Literal(scope))),
            root: Type.String({ description: "The scope's folder." }),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
);

const Removed = matching<WatchRemoved>()(
  Type.Object(
    {
      jobId: Type.String(),
      watching: Type.Array(Type.String(), {
        description: "The folders the job still watches.",
      }),
    },
    { additionalProperties: false, description: "One document per job the folders named." },
  ),
);

// `add` prints the data of `job add`, so the job command's schema describes it.
export const OUTPUT = outputDocument("watch", { remove: Removed, list: List });
