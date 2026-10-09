import { describe, expect, it } from "vitest";
import { FrameDecoder, MAX_RPC_FRAME_BYTES } from "./frames.ts";

describe("frame limit", () => {
  it("names the peer whose message is too large", () => {
    const decoder = new FrameDecoder("a client");
    const oversized = new Uint8Array(MAX_RPC_FRAME_BYTES + 1).fill(0x61);
    expect(() => decoder.push(oversized)).toThrow("A message from a client is larger than");
  });
});
