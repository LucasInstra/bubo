#!/usr/bin/env node
// Builds the updater manifest (`latest.json`) for a release or a fix build.
//
// The Tauri updater reads `version`, `notes`, `pub_date` and `platforms`. The
// extra `build` field is what lets the app tell two builds of the same version
// apart, because the plugin only compares semver versions on its own.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);

function arg(name, fallback = null) {
  const flag = `--${name}=`;
  const found = args.find((value) => value.startsWith(flag));
  return found ? found.slice(flag.length) : fallback;
}

const tag = arg("tag", `v${JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version}`);
const installer = arg("installer");
const signaturePath = arg("signature");
const notesPath = arg("notes");
const out = arg("out", "latest.json");
const repo = arg("repo", process.env.GITHUB_REPOSITORY ?? "LucasInstra/bubo");

if (!installer || !signaturePath) {
  console.error("usage: node scripts/updater-json.mjs --installer=<exe> --signature=<sig> [--tag=v0.8.2] [--notes=<md>]");
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const buildSource = readFileSync(join(root, "src", "lib", "build.ts"), "utf8");
const buildMatch = buildSource.match(/BUILD_NUMBER\s*=\s*(\d+)/);
if (!buildMatch) {
  console.error("src/lib/build.ts does not declare a numeric BUILD_NUMBER");
  process.exit(1);
}
const build = Number(buildMatch[1]);

const installerName = installer.replace(/\\/g, "/").split("/").pop();
const notesFile = notesPath ? join(root, notesPath) : null;
const notes =
  notesFile && existsSync(notesFile)
    ? readFileSync(notesFile, "utf8").trim()
    : "See the assets below. Unsigned build; Windows SmartScreen may warn on first run.";

const manifest = {
  version,
  build,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(signaturePath, "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${installerName}`,
    },
  },
};

writeFileSync(join(root, out), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${out} for ${version} build ${build} (${installerName})`);
