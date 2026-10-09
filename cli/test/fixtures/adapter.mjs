// A filesystem-backed provider used to develop clients without a real backend.
// Registered through `adapters:` in ~/.aireg/config.yml; never bundled.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix } from "node:path";

const KINDS = ["skill", "agent"];
const ARCHIVE = "_archived";

function remoteRoot() {
  const override = process.env.AIREG_DEV_REMOTE?.trim();
  if (override !== undefined && override !== "") return override;
  const home = process.env.AIREG_HOME?.trim();
  return join(home === undefined || home === "" ? join(homedir(), ".aireg") : home, "dev-remote");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function directories(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && entry.name !== ARCHIVE);
  } catch (cause) {
    if (cause.code === "ENOENT") return [];
    throw cause;
  }
}

async function walk(root, prefix = "") {
  const found = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const next = prefix === "" ? entry.name : posix.join(prefix, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(root, next)));
    else if (entry.name !== "meta.json") found.push(next);
  }
  return found.sort();
}

async function metadata(path) {
  try {
    return JSON.parse(await readFile(join(path, "meta.json"), "utf8"));
  } catch {
    return {};
  }
}

function namespaceDir(context) {
  const namespace = context.source.config.namespace;
  if (typeof namespace !== "string" || namespace === "") {
    throw new Error("The dev adapter needs `namespace` in its registry's config.");
  }
  return join(remoteRoot(), namespace);
}

/**
 * No digest is computed here: the client derives the one content identity from
 * the envelope itself.
 */
async function describe(kind, name, path) {
  const files = [];
  const described = [];
  for (const file of await walk(path)) {
    const bytes = await readFile(join(path, file));
    const mode = (await stat(join(path, file))).mode;
    files.push({ path: file, locator: file, executable: (mode & 0o111) !== 0 });
    described.push({
      path: file,
      digest: `sha256:${sha256(bytes)}`,
      size: bytes.byteLength,
      urls: [file],
    });
  }
  const meta = await metadata(path);
  return {
    id: meta.id ?? `${kind}_${name}`,
    kind,
    envelope: {
      apiVersion: "aireg.sh/v1",
      kind,
      metadata: {
        name,
        ...(meta.version === undefined ? {} : { version: meta.version }),
        ...(meta.description === undefined ? {} : { description: meta.description }),
      },
      files: described,
    },
    files,
  };
}

async function list(context, names) {
  const wanted = new Set(names);
  const root = namespaceDir(context);
  const artifacts = [];
  for (const kindDir of await directories(root)) {
    if (!KINDS.includes(kindDir.name)) continue;
    for (const entry of await directories(join(root, kindDir.name))) {
      if (wanted.size > 0 && !wanted.has(entry.name)) continue;
      artifacts.push(
        await describe(kindDir.name, entry.name, join(root, kindDir.name, entry.name)),
      );
    }
  }
  return artifacts.sort((left, right) =>
    left.envelope.metadata.name.localeCompare(right.envelope.metadata.name),
  );
}

async function read(context, artifact, file) {
  const name = artifact.envelope.metadata.name;
  return readFile(join(namespaceDir(context), artifact.kind, name, file.locator));
}

async function publish(context, input) {
  const path = join(namespaceDir(context), input.kind, input.name);
  await rm(path, { recursive: true, force: true });
  for (const file of input.files) {
    const target = join(path, ...file.path.split(posix.sep));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, file.content, { mode: file.executable ? 0o755 : 0o644 });
  }
  const meta = {
    id: input.id ?? `${input.kind}_${input.name}`,
    description: input.description,
    version: new Date().toISOString(),
  };
  await writeFile(join(path, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  return { id: meta.id };
}

async function archive(context, input) {
  const name = input.id.startsWith(`${input.kind}_`)
    ? input.id.slice(input.kind.length + 1)
    : input.id;
  const from = join(namespaceDir(context), input.kind, name);
  const to = join(namespaceDir(context), ARCHIVE, input.kind, `${name}-${Date.now()}`);
  await mkdir(join(to, ".."), { recursive: true });
  await rename(from, to);
}

function identityFor(endpoint) {
  return { name: `dev-${sha256(endpoint).slice(0, 8)}`, account: "Dev registry" };
}

async function runProbe() {
  return {
    state: "succeeded",
    counts: { examined: 0, changed: 0, skipped: 0, attention: 0, failed: 0 },
  };
}

export default {
  id: "dev",
  displayName: "Dev registry",
  protocol: 1,
  artifactKinds: KINDS,
  dispatch: { hosts: ["dev.registry.localhost"] },
  capabilities: { pinsSource: false, auth: true },
  auth: {
    async login({ endpoint }) {
      return {
        credential: { type: "apiKey", header: "x-dev-key", value: "development" },
        identity: identityFor(endpoint),
      };
    },
  },
  async connect(context) {
    return {
      resolve: async (want) => ({ artifacts: await list(context, want) }),
      fetch: (artifact, file) => read(context, artifact, file),
      publish: async (changes) => {
        for (const change of changes) await publish(context, change);
        return {};
      },
      unpublish: async (changes) => {
        for (const change of changes) await archive(context, change);
      },
      close: async () => {},
    };
  },
  extend: {
    steps: [
      {
        kind: "probe",
        flag: "probe",
        run: runProbe,
      },
    ],
  },
};
