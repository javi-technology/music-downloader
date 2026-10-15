import { describe, expect, it, vi } from "vitest";
import { ChangeFeed } from "./change-feed.js";

describe("ChangeFeed", () => {
  it("entrega cada mudança a todos os assinantes até cancelarem", () => {
    const feed = new ChangeFeed();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = feed.subscribe(a);
    feed.subscribe(b);

    feed.publish("j1");
    stopA();
    feed.publish("j2");

    expect(a.mock.calls).toEqual([["j1"]]);
    expect(b.mock.calls).toEqual([["j1"], ["j2"]]);
    expect(feed.size).toBe(1);
  });
});
