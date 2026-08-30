# Repzo CLI

The official standalone command-line interface for Repzo Workstation and AI agents.

## Install

macOS, Linux, or WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/Repzo/repzo-cli/main/scripts/install-repzo-cli.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Repzo/repzo-cli/main/scripts/install-repzo-cli.ps1 | iex
```

Then set up your coding agents and authenticate:

```bash
repzo setup agents
repzo auth login
repzo doctor
```

Node and npm are not required. The installer downloads the standalone binary for your platform and verifies its SHA-256 checksum. When `cosign` is installed, it also verifies the release's keyless Sigstore signature.

## Use

Discover the complete command surface:

```bash
repzo commands --json
repzo --help
```

Examples:

```bash
repzo contacts list --limit 20
repzo deals get DEAL_ID
repzo chat send CHANNEL_ID --data '{"body":"Hello","bodyFormat":"plain"}' --dry-run
```

Mutations require either `--dry-run` or `--yes`. Credentials are accepted through browser login, stdin, or environment variables—never command-line arguments.

Upgrade an installer-managed binary with:

```bash
repzo upgrade --yes
```

See [Releases](https://github.com/Repzo/repzo-cli/releases) for checksummed binaries for macOS, Linux, and Windows.

## Development

```bash
npm ci
npm run check
npm run build -- --target=bun-darwin-arm64
```

The npm package is private by design. Repzo CLI is distributed only as standalone executables from GitHub Releases.
