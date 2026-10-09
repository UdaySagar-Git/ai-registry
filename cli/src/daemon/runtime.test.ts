import { describe, expect, vi } from "vitest";
import { cliClient } from "#daemon/rpc/client.ts";
import { listening, rpcEndpoint } from "#daemon/rpc/endpoint.ts";
import { test } from "#test/kit/fixtures.ts";
import { runDaemon } from "./runtime.ts";

describe("daemon runtime", () => {
  test("exits cleanly when another daemon already owns the socket", async ({ daemon }) => {
    await daemon.start();
    await expect(runDaemon("test")).resolves.toBe(0);
  });

  test("closes on shutdown so a newer CLI can bind", async ({ daemon }) => {
    const { client } = await daemon.start(cliClient("test"));
    expect(await client.request("shutdown", {})).toEqual({ ok: true });
    client.close();
    await vi.waitFor(async () => expect(await listening(rpcEndpoint())).toBe(false));
  });
});
