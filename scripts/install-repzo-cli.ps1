$ErrorActionPreference = "Stop"

$Repository = "Repzo/repzo-cli"
$TagPrefix = "v"
$BinDir = if ($env:REPZO_BIN_DIR) { $env:REPZO_BIN_DIR } else { Join-Path $HOME "bin" }

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

function Get-RequestHeaders {
  $headers = @{ Accept = "application/vnd.github+json"; "User-Agent" = "repzo-cli-installer" }
  if ($env:GITHUB_TOKEN) { $headers.Authorization = "Bearer $($env:GITHUB_TOKEN)" }
  return $headers
}

function Download-File([string]$Url, [string]$Destination) {
  Invoke-WebRequest -UseBasicParsing -ErrorAction Stop -Headers (Get-RequestHeaders) -Uri $Url -OutFile $Destination
}

function Get-PlatformName {
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  switch ($arch) {
    "x64" { return "windows_x64" }
    "arm64" { throw "Windows ARM64 is not yet supported. Use an x64 Windows environment." }
    default { throw "Unsupported CPU architecture: $arch" }
  }
}

function Get-LatestVersion {
  $release = Invoke-RestMethod -UseBasicParsing -Headers (Get-RequestHeaders) -Uri "https://api.github.com/repos/$Repository/releases/latest"
  if (-not $release -or -not $release.tag_name.StartsWith($TagPrefix)) { throw "No Repzo CLI release was found." }
  return $release.tag_name.Substring($TagPrefix.Length)
}

function Get-CosignBundleFlag {
  try { $versionOutput = & cosign version 2>$null } catch { return $null }
  foreach ($line in @($versionOutput)) {
    if ("$line" -match 'GitVersion:\s*v?(\d+)\.(\d+)\.') {
      $major = [int]$Matches[1]
      $minor = [int]$Matches[2]
      if ($major -ge 3) { return "" }
      if ($major -eq 2 -and $minor -ge 6) { return "--new-bundle-format=true" }
      return $null
    }
  }
  return $null
}

function Verify-CosignSignature([string]$Version, [string]$BaseUrl, [string]$TempDir) {
  if (-not (Get-Command cosign -ErrorAction SilentlyContinue)) { return $false }
  $bundleFlag = Get-CosignBundleFlag
  if ($null -eq $bundleFlag) {
    Write-Host "  -> Skipping signature verification: cosign 2.6 or newer is required"
    return $false
  }
  $bundlePath = Join-Path $TempDir "checksums.txt.bundle"
  $checksumsPath = Join-Path $TempDir "checksums.txt"
  Download-File -Url "$BaseUrl/checksums.txt.bundle" -Destination $bundlePath
  $arguments = @("verify-blob", "--bundle", $bundlePath)
  if ($bundleFlag) { $arguments += $bundleFlag }
  $arguments += @(
    "--certificate-identity", "https://github.com/Repzo/repzo-cli/.github/workflows/release.yml@refs/tags/v$Version",
    "--certificate-oidc-issuer", "https://token.actions.githubusercontent.com",
    $checksumsPath
  )
  & cosign @arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Sigstore verification failed." }
  return $true
}

$Version = if ($env:REPZO_VERSION) { $env:REPZO_VERSION } else { Get-LatestVersion }
if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') { throw "REPZO_VERSION must be a semantic version." }

$Platform = Get-PlatformName
$Asset = "repzo_${Version}_${Platform}.exe"
$Tag = "$TagPrefix$Version"
$BaseUrl = "https://github.com/$Repository/releases/download/$Tag"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("repzo-cli-" + [guid]::NewGuid())
$Target = Join-Path $BinDir "repzo.exe"

try {
  New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  Write-Host "  -> Downloading Repzo CLI $Version for $Platform"
  Download-File -Url "$BaseUrl/$Asset" -Destination (Join-Path $TempDir $Asset)
  Download-File -Url "$BaseUrl/checksums.txt" -Destination (Join-Path $TempDir "checksums.txt")

  $assetPattern = '\s\*?' + [regex]::Escape($Asset) + '$'
  $checksumLine = Get-Content (Join-Path $TempDir "checksums.txt") | Where-Object { $_ -match $assetPattern } | Select-Object -First 1
  if (-not $checksumLine) { throw "Release checksums do not contain $Asset." }
  $expected = ($checksumLine -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $TempDir $Asset)).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw "Checksum verification failed for $Asset." }
  Write-Host "  OK Verified SHA-256 checksum"
  if (Verify-CosignSignature -Version $Version -BaseUrl $BaseUrl -TempDir $TempDir) {
    Write-Host "  OK Verified Sigstore signature"
  }

  Move-Item -Force (Join-Path $TempDir $Asset) $Target
  $reported = & $Target --version
  if ($reported.Trim() -ne $Version) { throw "Installed CLI reports $reported instead of $Version." }
  Write-Host "  OK Installed repzo $Version to $Target"

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($userPath -split ';') -notcontains $BinDir) {
    $updatedPath = if ($userPath) { "$BinDir;$userPath" } else { $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $updatedPath, "User")
    Write-Host "  OK Added $BinDir to your user PATH"
  }

  if ($env:REPZO_SKIP_SETUP -ne "1") {
    $agent = if ($env:REPZO_SETUP_AGENT) { $env:REPZO_SETUP_AGENT } else { "agents" }
    if ($agent -notin @("agents", "codex", "claude", "all", "none")) { throw "REPZO_SETUP_AGENT must be agents, codex, claude, all, or none." }
    if ($agent -eq "all") {
      try { & $Target setup codex } catch { }
      try { & $Target setup claude } catch { }
    } elseif ($agent -ne "none") {
      try { & $Target setup $agent } catch { }
    }
  }

  Write-Host "`nNext step:`n  repzo auth login"
} finally {
  if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
}
