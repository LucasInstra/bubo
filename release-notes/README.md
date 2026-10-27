# Release notes

One Markdown file per version, named after the version tag without the `v`
prefix (for example `0.7.0.md`).

The release workflow reads this file and uses it as the GitHub release body.
Write release notes in English, even though the app UI is PT-BR.

For the Updates tab, add a sibling `<version>.pt.md` with a `## Novidades`
section and Portuguese bullets. The app prefers that file and falls back to the
English body when a translation is missing. The updater manifest also carries
the Portuguese body as `notes_pt`, so the update card is translated before the
new version is installed.

Fix builds have their own notes: `<version>.build<N>.md` and
`<version>.build<N>.pt.md`. The Fix build workflow requires both, uses them as
the release body and the updater manifest notes, and the app shows “Novidades
do build N” for the running build. A new version (build 1) uses the version
notes instead.

