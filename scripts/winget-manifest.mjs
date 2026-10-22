import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const version = args.get("--version");
const installer = args.get("--installer");
const url = args.get("--url");
if (!version || !installer || !url) {
  console.error(
    "Usage: node scripts/winget-manifest.mjs --version 0.7.0 --installer <setup.exe> --url <https://...>",
  );
  process.exit(1);
}

const hash = createHash("sha256").update(readFileSync(installer)).digest("hex").toUpperCase();
const manifest = `PackageIdentifier: LucasInstra.bubo
PackageVersion: ${version}
PackageName: bubo
Publisher: Lucas Instra
License: Proprietary
ShortDescription: A tiny floating English tutor for Windows.
PackageUrl: https://lucasinstra.github.io/bubo/
InstallerType: nullsoft
InstallerUrl: ${url}
InstallerSha256: ${hash}
ManifestType: singleton
ManifestVersion: 1.6.0
`;

const out = resolve(
  "winget",
  "manifests",
  "l",
  "LucasInstra",
  "bubo",
  version,
  "LucasInstra.bubo.yaml",
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, manifest);
console.log(out);
