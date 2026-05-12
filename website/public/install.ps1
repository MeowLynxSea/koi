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

# ─── Install KOI globally ───
& bun add -g "@meowlynxsea/koi@latest"

# ─── Trust postinstall scripts ───
Write-Host ""
Write-Host "  Trusting dependency lifecycle scripts..." -ForegroundColor DarkGray
bun pm trust --all

Write-Host ""
Write-Host "  ✓ KOI installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Run 'koi' in any project directory to get started." -ForegroundColor White
Write-Host ""
Write-Host "  Keep on Improving" -ForegroundColor Magenta
Write-Host ""
