#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const expectArg = args.find((arg) => arg.startsWith("--expect="));
const expected = expectArg ? expectArg.slice("--expect=".length).replace(/^v/, "") : null;

const packagePath = join(root, "package.json");
const cargoPath = join(root, "src-tauri", "Cargo.toml");
const configPath = join(root, "src-tauri", "tauri.conf.json");
const lockPath = join(root, "src-tauri", "Cargo.lock");
const buildPath = join(root, "src", "lib", "build.ts");

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const version = pkg.version;

if (expected && version !== expected) {
  console.error(`package.json is ${version}, expected ${expected}`);
  process.exit(1);
}

// A new version starts a new build series. Fix builds of the same version
// increment the label by hand; `npm version` resets it to build 1.
const isVersionBump = !checkOnly && process.env.npm_lifecycle_event === "version";
const buildSource = readFileSync(buildPath, "utf8");
const buildNext = buildSource.replace(/(BUILD_LABEL\s*=\s*)"build \d+"/, '$1"build 1"');
if (isVersionBump && buildNext !== buildSource) {
  writeFileSync(buildPath, buildNext);
  console.log("reset the display build label to build 1");
}

const cargo = readFileSync(cargoPath, "utf8");
const config = readFileSync(configPath, "utf8");
const lock = readFileSync(lockPath, "utf8");

const cargoNext = cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`);
const configNext = config.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
const lockNext = lock.replace(/(name = "bubo"\nversion = ")[^"]+(")/, `$1${version}$2`);

const mismatches = [
  ["src-tauri/Cargo.toml", cargo === cargoNext],
  ["src-tauri/tauri.conf.json", config === configNext],
  ["src-tauri/Cargo.lock", lock === lockNext],
].filter(([, matches]) => !matches);

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error(`Version ${version} is out of sync in: ${mismatches.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`version ${version} is in sync`);
  process.exit(0);
}

if (mismatches.length === 0) {
  console.log(`version ${version} is already in sync`);
  process.exit(0);
}

writeFileSync(cargoPath, cargoNext);
writeFileSync(configPath, configNext);
writeFileSync(lockPath, lockNext);
console.log(`synced version ${version} to ${mismatches.map(([name]) => name).join(", ")}`);
