# Repzo CLI distribution

The CLI is built and released entirely from the public [`Repzo/repzo-cli`](https://github.com/Repzo/repzo-cli) repository. npm is not an installation or upgrade path.

## Publish a release

1. Update `package.json` to the intended semantic version.
2. Merge the release commit into `main`.
3. Create and push the matching `vX.Y.Z` tag.

The tag workflow runs the CLI, skill, installer, and distribution tests; compiles six Bun executables; creates SHA-256 checksums; signs the checksum manifest with keyless Sigstore; attests build provenance; and publishes the GitHub release. Linux, macOS, and Windows runners then download and execute the published binaries.

No cross-repository token is required. The workflow publishes with this repository's short-lived `GITHUB_TOKEN`.

## Installers

The public installers are:

- `scripts/install-repzo-cli.sh`
- `scripts/install-repzo-cli.ps1`

They resolve releases from `Repzo/repzo-cli`, always verify the selected binary's SHA-256 checksum, and verify the Sigstore bundle when a compatible `cosign` is installed.
