const NUMBER = /^\d+$/;

function core(version: string): number[] {
  const trimmed = version.trim().replace(/^v/, "");
  const withoutMetadata = trimmed.split("+")[0];
  const withoutPrerelease = withoutMetadata.split("-")[0];
  return withoutPrerelease.split(".").map((part) => (NUMBER.test(part) ? Number(part) : 0));
}

function prerelease(version: string): string {
  const trimmed = version.trim().replace(/^v/, "");
  const withoutMetadata = trimmed.split("+")[0];
  const dash = withoutMetadata.indexOf("-");
  return dash === -1 ? "" : withoutMetadata.slice(dash + 1);
}

/** Compares two semantic versions: negative when `a` is older, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const left = core(a);
  const right = core(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  const leftPre = prerelease(a);
  const rightPre = prerelease(b);
  // A prerelease always sorts before the matching final release.
  if (leftPre === rightPre) return 0;
  if (!leftPre) return 1;
  if (!rightPre) return -1;
  return leftPre > rightPre ? 1 : -1;
}

/** Reads the `build` field the updater manifest carries next to the version. */
export function readBuild(rawJson: Record<string, unknown> | null | undefined): number {
  const value = rawJson?.build;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export interface Release {
  version: string;
  build: number;
}

/**
 * Whether `candidate` is worth installing over `running`. A newer version always
 * wins; the same version only wins when it carries a higher build, which is how
 * fix builds of an already released version reach existing installations.
 */
export function isNewerRelease(running: Release, candidate: Release): boolean {
  const byVersion = compareVersions(candidate.version, running.version);
  if (byVersion !== 0) return byVersion > 0;
  return candidate.build > running.build;
}
