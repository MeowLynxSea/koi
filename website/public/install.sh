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

# ─── Install KOI globally ───
bun add -g "@meowlynxsea/koi@${KOI_VERSION}"

# ─── Trust postinstall scripts ───
echo ""
echo "  Trusting dependency lifecycle scripts..."
bun pm trust --all

echo ""
echo "  ✓ KOI installed successfully!"
echo ""
echo "  Run 'koi' in any project directory to get started."
echo ""
echo "  Keep on Improving"
echo ""
