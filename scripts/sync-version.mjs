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
// increment the number by hand; `npm version` resets it to build 1.
const isVersionBump = !checkOnly && process.env.npm_lifecycle_event === "version";
const buildSource = readFileSync(buildPath, "utf8");
const buildNext = buildSource.replace(/(BUILD_NUMBER\s*=\s*)\d+/, (_match, prefix) => `${prefix}1`);
if (isVersionBump && buildNext !== buildSource) {
  writeFileSync(buildPath, buildNext);
  console.log("reset the build number to 1");
}

const cargo = readFileSync(cargoPath, "utf8");
const config = readFileSync(configPath, "utf8");
const lock = readFileSync(lockPath, "utf8");

// A regex that silently misses would make the check report "in sync" without
// verifying anything, so fail loudly when a file no longer has the field.
const cargoMatch = /^version = "([^"]+)"/m.exec(cargo);
const configMatch = /"version":\s*"([^"]+)"/.exec(config);
const lockMatch = /name = "bubo"\nversion = "([^"]+)"/.exec(lock);
const missing = [
  ["src-tauri/Cargo.toml", cargoMatch],
  ["src-tauri/tauri.conf.json", configMatch],
  ["src-tauri/Cargo.lock", lockMatch],
].filter(([, match]) => !match);
if (missing.length > 0) {
  console.error(
    `could not find the version field in: ${missing.map(([name]) => name).join(", ")}`,
  );
  process.exit(1);
}

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
