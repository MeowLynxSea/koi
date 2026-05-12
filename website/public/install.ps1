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
# bun pm bin -g gives us .bun/bin, so we go up to .bun, then to the parent where node_modules actually is
# Global packages are at: C:\Users\Acro node_modules (not in .bun/)
$globalBinDir = (bun pm bin -g 2>$null)

if ($globalBinDir) {
    # bin is at .bun/bin, so .bun's parent is the actual node_modules location
    $bunRoot = Split-Path $globalBinDir -Parent  # .bun
    $globalPrefix = Split-Path $bunRoot -Parent   # C:\Users\Acro
    $nodeModulesPath = Join-Path $globalPrefix "node_modules"
} else {
    # Fallback: use user profile as base
    $globalPrefix = $env:USERPROFILE
    $nodeModulesPath = Join-Path $globalPrefix "node_modules"
}

$koiPath = Join-Path $nodeModulesPath "@meowlynxsea\koi"

Write-Host "  KOI installed at: $koiPath" -ForegroundColor DarkGray

# ─── Install platform-specific opentui modules ───
Write-Host ""
Write-Host "  Installing opentui platform modules..." -ForegroundColor Cyan

# Get the opentui core version
$opentuiVersion = & bun pm ls "@opentui/core" --global 2>$null | Select-String -Pattern "@opentui/core" | ForEach-Object { 
    if ($_ -match '@opentui/core@([\d.]+)') { $Matches[1] }
}

if (-not $opentuiVersion) {
    # Fallback: get from npm using web request
    try {
        $response = Invoke-WebRequest -Uri "https://registry.npmjs.org/@opentui/core/latest" -UseBasicParsing
        $json = $response.Content | ConvertFrom-Json
        $opentuiVersion = $json.version
    } catch {
        # Last resort: use a known good version
        $opentuiVersion = "latest"
    }
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
    $modulePath = Join-Path $nodeModulesPath $module
    if (-not (Test-Path $modulePath)) {
        Write-Host "  Installing $module..." -ForegroundColor DarkGray
        # Suppress all output
        $process = Start-Process -FilePath "bun" -ArgumentList "add", "${module}@${opentuiVersion}", "--global" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\bun_out.txt" -RedirectStandardError "$env:TEMP\bun_err.txt"
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
    $process = Start-Process -FilePath "bun" -ArgumentList "run", $postinstallScript -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$env:TEMP\bun_postinstall_out.txt" -RedirectStandardError "$env:TEMP\bun_postinstall_err.txt"
}

Write-Host ""
Write-Host "  ✓ KOI installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run 'koi' in any project directory to get started." -ForegroundColor White
Write-Host ""
Write-Host "  Keep on Improving" -ForegroundColor Magenta
Write-Host ""
