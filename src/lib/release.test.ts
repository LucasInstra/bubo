import { describe, expect, it } from "vitest";
import { compareVersions, isNewerRelease, readBuild } from "./release";

describe("compareVersions", () => {
  it("orders patch releases numerically", () => {
    expect(compareVersions("0.8.2", "0.8.1")).toBe(1);
    expect(compareVersions("0.8.1", "0.8.2")).toBe(-1);
    expect(compareVersions("0.8.1", "0.8.1")).toBe(0);
  });

  it("compares each segment as a number, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
  });

  it("sorts a prerelease before the final release", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
  });

  it("ignores a leading v and build metadata", () => {
    expect(compareVersions("v0.8.2", "0.8.2+build.4")).toBe(0);
  });
});

describe("readBuild", () => {
  it("reads a numeric build", () => {
    expect(readBuild({ build: 3 })).toBe(3);
  });

  it("reads a labelled build", () => {
    expect(readBuild({ build: "build 12" })).toBe(12);
  });

  it("falls back to zero when the manifest has no build", () => {
    expect(readBuild({})).toBe(0);
    expect(readBuild(null)).toBe(0);
    expect(readBuild({ build: "today" })).toBe(0);
  });
});

describe("isNewerRelease", () => {
  const running = { version: "0.8.2", build: 2 };

  it("accepts a newer version whatever its build", () => {
    expect(isNewerRelease(running, { version: "0.8.3", build: 1 })).toBe(true);
    expect(isNewerRelease(running, { version: "0.9.0", build: 0 })).toBe(true);
  });

  it("accepts a higher build of the same version", () => {
    expect(isNewerRelease(running, { version: "0.8.2", build: 3 })).toBe(true);
  });

  it("ignores the same or an older build of the same version", () => {
    expect(isNewerRelease(running, { version: "0.8.2", build: 2 })).toBe(false);
    expect(isNewerRelease(running, { version: "0.8.2", build: 1 })).toBe(false);
    expect(isNewerRelease(running, { version: "0.8.2", build: 0 })).toBe(false);
  });

  it("never downgrades to an older version", () => {
    expect(isNewerRelease(running, { version: "0.8.1", build: 9 })).toBe(false);
  });
});
