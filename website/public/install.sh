#!/usr/bin/env bash
set -e

# KOI Installer Script
# Supports macOS and Linux
# Automatically installs Bun if not present, then installs KOI globally

SCRIPT_URL="${SCRIPT_URL:-}"
KOI_VERSION="${KOI_VERSION:-latest}"

echo ""
echo "  ██   ███   ███████   ██████"
echo "  ██  ██    ██    ███    ██"
echo "  ████      ██  █  ██    ██"
echo "  ██  ██    ███    ██    ██"
echo "  ██   ███   ███████   ██████"
echo ""
echo "  KOI Installer"
echo ""

# ─── Detect OS ───
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)     PLATFORM=linux;;
  Darwin*)    PLATFORM=darwin;;
  *)          echo "Unsupported OS: $OS"; exit 1;;
esac

# ─── Check for Bun ───
if command -v bun >/dev/null 2>&1; then
  echo "  ✓ Bun found: $(bun --version)"
else
  echo "  Bun not found. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash

  # Source Bun in current shell if possible
  if [ -f "$HOME/.bashrc" ]; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi

  # Verify installation
  if ! command -v bun >/dev/null 2>&1; then
    echo ""
    echo "  Please restart your terminal or run:"
    echo "    export BUN_INSTALL=\"\$HOME/.bun\""
    echo "    export PATH=\"\$BUN_INSTALL/bin:\$PATH\""
    echo ""
    exit 1
  fi
  echo "  ✓ Bun installed: $(bun --version)"
fi

echo ""
echo "  Installing KOI..."

# ─── Install KOI ───
# First, install without running postinstall scripts to avoid recursion issues
bun install -g "@meowlynxsea/koi@${KOI_VERSION}" --ignore-scripts

# ─── Get the installed KOI package path ───
GLOBAL_PREFIX=$(bun pm global --globaldir 2>/dev/null || dirname $(bun which koi 2>/dev/null || echo "")/../..)
KOI_PATH="${GLOBAL_PREFIX}/koi"

# Fallback to common global paths
if [ ! -d "$KOI_PATH" ]; then
  KOI_PATH="${GLOBAL_PREFIX}/@meowlynxsea/koi"
fi

echo "  KOI installed at: $KOI_PATH"

# ─── Install platform-specific opentui modules ───
echo ""
echo "  Installing opentui platform modules..."

# Get the opentui core version
OPENTUI_VERSION=$(npm view @opentui/core version 2>/dev/null || echo "latest")
echo "  OpenTUI version: $OPENTUI_VERSION"

# Platform modules to install
PLATFORM_MODULES=(
  "@opentui/core-darwin-arm64"
  "@opentui/core-darwin-x64"
  "@opentui/core-linux-arm64"
  "@opentui/core-linux-x64"
  "@opentui/core-win32-arm64"
  "@opentui/core-win32-x64"
)

# Install each platform module
for module in "${PLATFORM_MODULES[@]}"; do
  MODULE_PATH="${KOI_PATH}/node_modules/${module}"
  if [ ! -d "$MODULE_PATH" ]; then
    echo "  Installing $module..."
    bun add "${module}@${OPENTUI_VERSION}" --global 2>/dev/null || true
  fi
done

# ─── Trust postinstall scripts ───
echo ""
echo "  Trusting dependency lifecycle scripts..."
bun pm trust --all

# ─── Run postinstall to create shim files ───
echo ""
echo "  Running postinstall script..."
POSTINSTALL_SCRIPT="${KOI_PATH}/scripts/postinstall.ts"
if [ -f "$POSTINSTALL_SCRIPT" ]; then
  bun run "$POSTINSTALL_SCRIPT" 2>/dev/null || true
fi

echo ""
echo "  ✓ KOI installed successfully!"
echo ""
echo "  Run 'koi' in any project directory to get started."
echo ""
echo "  Keep on Improving"
echo ""
