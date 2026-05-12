# KOI Installer Script for Windows
# Automatically installs Bun if not present, then installs KOI globally

$ErrorActionPreference = "Stop"

$KoiAscii = @"

  ██   ███   ███████   ██████
  ██  ██    ██    ███    ██
  ████      ██  █  ██    ██
  ██  ██    ███    ██    ██
  ██   ███   ███████   ██████

  KOI Installer

"@

Write-Host $KoiAscii -ForegroundColor Magenta

# ─── Check for Bun ───
$bunPath = Get-Command bun -ErrorAction SilentlyContinue

if ($bunPath) {
    $bunVersion = & bun --version
    Write-Host "  ✓ Bun found: $bunVersion" -ForegroundColor Green
} else {
    Write-Host "  Bun not found. Installing Bun..." -ForegroundColor Yellow

    # Install Bun via PowerShell
    powershell -c "irm bun.sh/install.ps1 | iex"

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")

    # Verify
    $bunPath = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bunPath) {
        Write-Host ""
        Write-Host "  Please restart your terminal and try again." -ForegroundColor Red
        Write-Host "  Bun was installed but is not yet available in your PATH." -ForegroundColor Yellow
        exit 1
    }

    $bunVersion = & bun --version
    Write-Host "  ✓ Bun installed: $bunVersion" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Installing KOI..." -ForegroundColor Cyan

# ─── Install KOI ───
# First, install without running postinstall scripts to avoid recursion issues
& bun install -g "@meowlynxsea/koi@latest" --ignore-scripts

# ─── Get the installed KOI package path ───
$globalPrefix = & bun pm global --globaldir 2>$null
$koiPath = Join-Path $globalPrefix "koi"

# If not found in globaldir, try the global installation path
if (-not (Test-Path $koiPath)) {
    $koiPath = Join-Path $globalPrefix "@meowlynxsea\koi"
}

Write-Host "  KOI installed at: $koiPath" -ForegroundColor DarkGray

# ─── Install platform-specific opentui modules ───
Write-Host ""
Write-Host "  Installing opentui platform modules..." -ForegroundColor Cyan

# Get the opentui core version
$opentuiVersion = & bun pm ls "@opentui/core" --global 2>$null | Select-String -Pattern "@opentui/core" | ForEach-Object { 
    if ($_ -match '@opentui/core@([\d.]+)') { $Matches[1] }
}

if (-not $opentuiVersion) {
    # Fallback: get from npm
    $opentuiVersion = (irm "https://registry.npmjs.org/@opentui/core/latest" | ConvertFrom-Json).version
}

Write-Host "  OpenTUI version: $opentuiVersion" -ForegroundColor DarkGray

# Platform modules to install
$platformModules = @(
    "@opentui/core-darwin-arm64",
    "@opentui/core-darwin-x64",
    "@opentui/core-linux-arm64",
    "@opentui/core-linux-x64",
    "@opentui/core-win32-arm64",
    "@opentui/core-win32-x64"
)

# Install each platform module (they won't conflict since they're different packages)
foreach ($module in $platformModules) {
    $modulePath = Join-Path $koiPath "node_modules\$module"
    if (-not (Test-Path $modulePath)) {
        Write-Host "  Installing $module..." -ForegroundColor DarkGray
        & bun add $module@$opentuiVersion --global 2>$null
    }
}

# ─── Trust postinstall scripts ───
Write-Host ""
Write-Host "  Trusting dependency lifecycle scripts..." -ForegroundColor DarkGray
bun pm trust --all

# ─── Run postinstall to create shim files ───
Write-Host ""
Write-Host "  Running postinstall script..." -ForegroundColor Cyan
$postinstallScript = Join-Path $koiPath "scripts\postinstall.ts"
if (Test-Path $postinstallScript) {
    & bun run $postinstallScript 2>$null
}

Write-Host ""
Write-Host "  ✓ KOI installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run 'koi' in any project directory to get started." -ForegroundColor White
Write-Host ""
Write-Host "  Keep on Improving" -ForegroundColor Magenta
Write-Host ""
