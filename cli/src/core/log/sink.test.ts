import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { memorySink } from "#test/kit/memory-sink.ts";
import type { LogRecord } from "./model.ts";
import { fileSink, logPath, multiSink, trimCapture } from "./sink.ts";

function record(body: string): LogRecord {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    severity_text: "info",
    severity_number: 9,
    body,
    attributes: {},
  };
}

describe("fileSink", () => {
  let dir: string;
  test.beforeEach(({ tmp }) => {
    dir = tmp;
  });

  test("creates the directory and writes one JSON object per line", () => {
    const path = join(dir, "logs", "registry.log");
    const sink = fileSink({ path });
    sink.write(record("first"));
    sink.write(record("second"));
    sink.close?.();

    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] ?? "")).toMatchObject({ body: "second" });
  });

  test("rolls the file once a write takes it past the cap", () => {
    const path = join(dir, "registry.log");
    const sink = fileSink({ path, maxBytes: 200 });
    for (let index = 0; index < 5; index += 1) sink.write(record(`line-${index}`));
    sink.close?.();

    expect(statSync(`${path}.1`).size).toBeGreaterThan(0);
    expect(statSync(path).size).toBeLessThanOrEqual(200);
  });

  test("keeps the cap while one process goes on writing", () => {
    const path = join(dir, "registry.log");
    const sink = fileSink({ path, maxBytes: 500, keep: 2 });
    for (let index = 0; index < 200; index += 1) sink.write(record(`line-${index}`));
    sink.close?.();

    for (const name of [path, `${path}.1`, `${path}.2`]) {
      expect(statSync(name).size).toBeLessThan(700);
    }
    expect(() => statSync(`${path}.3`)).toThrow();
  });

  test("takes over a rotation lock a crashed process left behind", () => {
    const path = join(dir, "registry.log");
    mkdirSync(`${path}.rotating`);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    utimesSync(`${path}.rotating`, old, old);

    const sink = fileSink({ path, maxBytes: 200 });
    for (let index = 0; index < 5; index += 1) sink.write(record(`line-${index}`));
    sink.close?.();

    expect(statSync(`${path}.1`).size).toBeGreaterThan(0);
    expect(statSync(path).size).toBeLessThanOrEqual(200);
    expect(() => statSync(`${path}.rotating`)).toThrow();
  });

  test("leaves a fresh rotation lock to the process holding it", () => {
    const path = join(dir, "registry.log");
    mkdirSync(`${path}.rotating`);

    const sink = fileSink({ path, maxBytes: 200 });
    for (let index = 0; index < 5; index += 1) sink.write(record(`line-${index}`));
    sink.close?.();

    expect(() => statSync(`${path}.1`)).toThrow();
  });

  test("writes the newest bytes to the live file, not to a rolled one", () => {
    const path = join(dir, "registry.log");
    const sink = fileSink({ path, maxBytes: 200 });
    for (let index = 0; index < 20; index += 1) sink.write(record(`line-${index}`));
    sink.close?.();
    expect(readFileSync(path, "utf8")).toContain("line-19");
  });

  test("keeps writing after a rotation that finds the live file gone", () => {
    const path = join(dir, "registry.log");
    const sink = fileSink({ path, maxBytes: 200 });
    sink.write(record("line-0"));
    sink.write(record("line-1"));
    rmSync(path);
    for (let index = 2; index < 5; index += 1) sink.write(record(`line-${index}`));
    sink.close?.();
    expect(readFileSync(path, "utf8")).toContain("line-4");
  });

  test("follows the live file after another writer rotates it", () => {
    const path = join(dir, "registry.log");
    const other = fileSink({ path, maxBytes: 300 });
    const sink = fileSink({ path, maxBytes: 300 });
    sink.write(record("before"));
    for (let index = 0; index < 5; index += 1) other.write(record(`other-${index}`));
    sink.write(record("after"));
    other.close?.();
    sink.close?.();
    expect(readFileSync(path, "utf8")).toContain("after");
  });

  test("ignores a write after close rather than throwing into the caller", () => {
    const sink = fileSink({ path: join(dir, "registry.log") });
    sink.close?.();
    expect(() => sink.write(record("late"))).not.toThrow();
  });
});

describe("multiSink", () => {
  test("writes to every sink and closes each one", () => {
    const closed: string[] = [];
    const a = { ...memorySink(), close: () => closed.push("a") };
    const b = { ...memorySink(), close: () => closed.push("b") };
    const fan = multiSink(a, b);
    fan.write(record("both"));
    fan.close?.();
    expect(a.records).toHaveLength(1);
    expect(b.records).toHaveLength(1);
    expect(closed).toEqual(["a", "b"]);
  });
});

describe("logPath", () => {
  test("sits under the registry home so AIREG_HOME isolates it", () => {
    expect(logPath("/tmp/home", "daemon.log")).toBe(join("/tmp/home", "logs", "daemon.log"));
  });
});

describe("trimCapture", () => {
  test("keeps a capture under its limit as it is", ({ tmp }) => {
    const path = join(tmp, "daemon-stderr.log");
    writeFileSync(path, "small\n");
    trimCapture(path, 100);
    expect(readFileSync(path, "utf8")).toBe("small\n");
    expect(statSync(`${path}.1`, { throwIfNoEntry: false })).toBeUndefined();
  });

  // A service manager holds the file open for appending, so it must stay the same file.
  test("copies a capture past its limit to .1 and empties it in place", ({ tmp }) => {
    const path = join(tmp, "daemon-stderr.log");
    writeFileSync(path, "x".repeat(101));
    const held = openSync(path, "a");
    try {
      trimCapture(path, 100);
      writeSync(held, "after\n");
    } finally {
      closeSync(held);
    }
    expect(readFileSync(`${path}.1`, "utf8")).toBe("x".repeat(101));
    expect(readFileSync(path, "utf8")).toBe("after\n");
  });
});
