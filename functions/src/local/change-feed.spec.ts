import { describe, expect, it, vi } from "vitest";
import { ChangeFeed } from "./change-feed.js";

describe("ChangeFeed", () => {
  it("entrega cada evento a todos os assinantes até cancelarem", () => {
    const feed = new ChangeFeed();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = feed.subscribe(a);
    feed.subscribe(b);

    feed.publish("job", { jobId: "j1" });
    stopA();
    feed.publish("tools", { ready: true });

    expect(a.mock.calls).toEqual([["job", { jobId: "j1" }]]);
    expect(b.mock.calls).toEqual([
      ["job", { jobId: "j1" }],
      ["tools", { ready: true }],
    ]);
    expect(feed.size).toBe(1);
  });
});
