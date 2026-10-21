import { describe, expect, it } from "vitest";
import { moodRequest } from "./mood";

describe("moodRequest", () => {
  it("detects faces asked for with a request verb", () => {
    expect(moodRequest("do a happy face")).toBe("happy");
    expect(moodRequest("make a sad face please")).toBe("sad");
    expect(moodRequest("show me your surprised face")).toBe("surprised");
    expect(moodRequest("can you do a proud face?")).toBe("proud");
    expect(moodRequest("act surprised")).toBe("surprised");
    expect(moodRequest("put on a frown")).toBe("sad");
  });

  it("detects a mood next to a face word even without a verb", () => {
    expect(moodRequest("happy face")).toBe("happy");
    expect(moodRequest("that surprised look again")).toBe("surprised");
  });

  it("handles short standalone requests", () => {
    expect(moodRequest("smile")).toBe("happy");
    expect(moodRequest("smile for me")).toBe("happy");
    expect(moodRequest("frown")).toBe("sad");
    expect(moodRequest("surprise me")).toBe("surprised");
  });

  it("ignores everyday mentions", () => {
    expect(moodRequest("I had a happy weekend")).toBeNull();
    expect(moodRequest("the sad part is that it rained")).toBeNull();
    expect(moodRequest("she smiled at me")).toBeNull();
    expect(moodRequest("I am proud of this project")).toBeNull();
    expect(moodRequest("what does a sad face look like?")).toBe("sad");
  });

  it("returns the first mood when two are requested", () => {
    expect(moodRequest("do a happy face then a sad face")).toBe("happy");
  });

  it("ignores empty text", () => {
    expect(moodRequest("   ")).toBeNull();
  });
});
