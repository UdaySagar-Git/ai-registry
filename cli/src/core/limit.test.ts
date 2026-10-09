import { describe, expect, it } from "vitest";
import { weighted } from "./limit.ts";

/** Runs the tasks under one budget and reports the most weight ever held at once. */
async function peakOf(
  budget: number,
  weights: number[],
): Promise<{ peak: number; order: number[] }> {
  const limit = weighted(budget);
  let held = 0;
  let peak = 0;
  const order: number[] = [];
  await Promise.all(
    weights.map((weight, index) =>
      limit(weight, async () => {
        held += weight;
        peak = Math.max(peak, held);
        order.push(index);
        await new Promise((settle) => setTimeout(settle, 1));
        held -= weight;
      }),
    ),
  );
  return { peak, order };
}

describe("weighted", () => {
  it("runs light tasks together and never holds more than the budget", async () => {
    const { peak } = await peakOf(10, [3, 3, 3, 3, 3, 3, 3, 3]);
    expect(peak).toBe(9);
  });

  it("runs a task heavier than the whole budget, alone", async () => {
    const { peak, order } = await peakOf(10, [2, 25, 2]);
    expect(peak).toBe(25);
    expect(order).toEqual([0, 1, 2]);
  });

  it("admits in arrival order, so light tasks cannot starve a heavy one", async () => {
    const { order } = await peakOf(10, [6, 8, 1, 1]);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("frees the weight of a task that fails", async () => {
    const limit = weighted(5);
    await expect(limit(5, async () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(limit(5, async () => "ran")).resolves.toBe("ran");
  });
});
