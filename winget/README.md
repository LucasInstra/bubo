# Winget

The manifest is generated after a public release, not before. The installer URL
must be the versioned asset, and the SHA256 must match that exact file.

```powershell
node scripts/winget-manifest.mjs `
  --version 0.7.0 `
  --installer src-tauri/target/release/bundle/nsis/bubo_0.7.0_x64-setup.exe `
  --url https://github.com/LucasInstra/bubo/releases/download/v0.7.0/bubo_0.7.0_x64-setup.exe
```

Validate and test it locally:

```powershell
winget validate winget/manifests/l/LucasInstra/bubo/0.7.0/LucasInstra.bubo.yaml
winget install --manifest winget/manifests/l/LucasInstra/bubo/0.7.0
```

To publish, submit the generated manifest to
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) with
`wingetcreate submit` or a pull request.
