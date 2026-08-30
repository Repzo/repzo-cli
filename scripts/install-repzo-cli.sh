#!/usr/bin/env bash
# Install the standalone Repzo CLI.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Repzo/repzo-cli/main/scripts/install-repzo-cli.sh | bash
#
# Environment:
#   REPZO_BIN_DIR      Install directory (defaults to ~/bin or ~/.local/bin)
#   REPZO_VERSION      Specific semantic version (defaults to latest stable)
#   REPZO_SETUP_AGENT  agents | codex | claude | all | none (default: agents)

set -euo pipefail

REPOSITORY="Repzo/repzo-cli"
TAG_PREFIX="v"
BIN_DIR="${REPZO_BIN_DIR:-}"
VERSION="${REPZO_VERSION:-}"

if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  green() { printf '\033[32m%s\033[0m' "$1"; }
  bold() { printf '\033[1m%s\033[0m' "$1"; }
  red() { printf '\033[31m%s\033[0m' "$1"; }
else
  green() { printf '%s' "$1"; }
  bold() { printf '%s' "$1"; }
  red() { printf '%s' "$1"; }
fi

info() { printf '  %s %s\n' "$(green '✓')" "$1"; }
step() { printf '  %s %s\n' "$(bold '→')" "$1"; }
fail() { printf '  %s %s\n' "$(red '✗')" "$1" >&2; exit 1; }

curl_run() {
  local -a headers
  headers=(-H 'Accept: application/vnd.github+json' -H 'User-Agent: repzo-cli-installer')
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    headers+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi
  curl --retry 3 --show-error "${headers[@]}" "$@"
}

default_bin_dir() {
  if [[ ":$PATH:" == *":$HOME/bin:"* ]]; then
    printf '%s\n' "$HOME/bin"
  elif [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]; then
    printf '%s\n' "$HOME/.local/bin"
  else
    printf '%s\n' "$HOME/.local/bin"
  fi
}

detect_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *) fail "Unsupported operating system: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) fail "Unsupported CPU architecture: $(uname -m)" ;;
  esac
  printf '%s_%s\n' "$os" "$arch"
}

latest_version() {
  local url resolved payload
  if url=$(curl_run -fsSL -o /dev/null -w '%{url_effective}' \
    "https://github.com/${REPOSITORY}/releases/latest"); then
    resolved="${url##*/}"
    resolved="${resolved#${TAG_PREFIX}}"
    if [[ "$resolved" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
      printf '%s\n' "$resolved"
      return 0
    fi
  fi

  payload=$(curl_run -fsSL \
    "https://api.github.com/repos/${REPOSITORY}/releases/latest") \
    || fail "Could not check the latest Repzo CLI release."
  if [[ "$payload" =~ \"tag_name\"[[:space:]]*:[[:space:]]*\"v?([^\"]+)\" ]]; then
    resolved="${BASH_REMATCH[1]}"
  else
    resolved=""
  fi
  [[ "$resolved" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail "Could not determine the latest Repzo CLI version."
  printf '%s\n' "$resolved"
}

cosign_bundle_flag() {
  local output major minor
  output=$(cosign version 2>/dev/null || true)
  if [[ "$output" =~ GitVersion:[[:space:]]*v?([0-9]+)\.([0-9]+)\. ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    if (( major >= 3 )); then
      printf '%s\n' ""
      return 0
    fi
    if (( major == 2 && minor >= 6 )); then
      printf '%s\n' "--new-bundle-format=true"
      return 0
    fi
  fi
  return 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    fail "A SHA-256 tool is required (sha256sum or shasum)."
  fi
}

configure_path() {
  [[ ":$PATH:" == *":$BIN_DIR:"* ]] && return 0
  local shell_file path_line
  case "${SHELL:-}" in
    */zsh) shell_file="$HOME/.zshrc" ;;
    */bash) shell_file="$HOME/.bashrc" ;;
    *) shell_file="$HOME/.profile" ;;
  esac
  path_line="export PATH=\"$BIN_DIR:\$PATH\""
  if [[ ! -f "$shell_file" ]] || ! grep -qF "$BIN_DIR" "$shell_file"; then
    printf '\n# Added by the Repzo CLI installer\n%s\n' "$path_line" >> "$shell_file"
  fi
  info "Added $BIN_DIR to PATH in $shell_file"
}

setup_agents() {
  local selector="${REPZO_SETUP_AGENT:-agents}"
  case "$selector" in
    none) return 0 ;;
    agents|codex|claude) "$BIN_DIR/repzo" setup "$selector" || true ;;
    all)
      "$BIN_DIR/repzo" setup codex || true
      "$BIN_DIR/repzo" setup claude || true
      ;;
    *) fail "REPZO_SETUP_AGENT must be agents, codex, claude, all, or none." ;;
  esac
}

main() {
  command -v curl >/dev/null 2>&1 || fail "curl is required."
  local platform asset tag base_url tmp_dir expected actual verification reported bundle_flag
  local -a cosign_args
  platform=$(detect_platform)
  BIN_DIR="${BIN_DIR:-$(default_bin_dir)}"
  VERSION="${VERSION:-$(latest_version)}"
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
    || fail "REPZO_VERSION must be a semantic version."
  asset="repzo_${VERSION}_${platform}"
  tag="${TAG_PREFIX}${VERSION}"
  base_url="https://github.com/${REPOSITORY}/releases/download/${tag}"
  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/repzo-cli.XXXXXX")
  trap "rm -rf '$tmp_dir'" EXIT

  step "Downloading Repzo CLI ${VERSION} for ${platform}"
  curl_run -fsSL "${base_url}/${asset}" -o "${tmp_dir}/${asset}" \
    || fail "Could not download ${asset}."
  curl_run -fsSL "${base_url}/checksums.txt" -o "${tmp_dir}/checksums.txt" \
    || fail "Could not download release checksums."

  expected=$(awk -v name="$asset" '$2 == name || $2 == ("*" name) { print $1; exit }' "${tmp_dir}/checksums.txt")
  actual=$(sha256_file "${tmp_dir}/${asset}")
  [[ -n "$expected" && "$expected" == "$actual" ]] \
    || fail "Checksum verification failed for ${asset}."
  verification="SHA-256 checksum"

  if command -v cosign >/dev/null 2>&1; then
    if bundle_flag=$(cosign_bundle_flag); then
      curl_run -fsSL "${base_url}/checksums.txt.bundle" -o "${tmp_dir}/checksums.txt.bundle" \
        || fail "Could not download the Sigstore bundle."
      cosign_args=(verify-blob --bundle "${tmp_dir}/checksums.txt.bundle")
      [[ -n "$bundle_flag" ]] && cosign_args+=("$bundle_flag")
      cosign_args+=(
        --certificate-identity "https://github.com/Repzo/repzo-cli/.github/workflows/release.yml@refs/tags/v${VERSION}"
        --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
        "${tmp_dir}/checksums.txt"
      )
      cosign "${cosign_args[@]}" >/dev/null || fail "Sigstore verification failed."
      verification="SHA-256 checksum and Sigstore signature"
    else
      step "Skipping signature verification: cosign 2.6 or newer is required"
    fi
  fi
  info "Verified ${verification}"

  mkdir -p "$BIN_DIR"
  chmod 0755 "${tmp_dir}/${asset}"
  mv "${tmp_dir}/${asset}" "$BIN_DIR/repzo"
  chmod 0755 "$BIN_DIR/repzo"
  reported=$("$BIN_DIR/repzo" --version) || fail "The installed Repzo CLI could not start."
  [[ "$reported" == "$VERSION" ]] \
    || fail "Installed CLI reports ${reported:-no version} instead of ${VERSION}."
  info "Installed repzo ${VERSION} to $BIN_DIR/repzo"
  configure_path
  setup_agents

  printf '\nNext step:\n  repzo auth login\n'
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
