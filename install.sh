#!/usr/bin/env bash
# GitBridge Universal One-Line Installer
# Supports Linux (Debian, Ubuntu, Fedora, Arch, Alpine), macOS (Intel & Apple Silicon), and Windows (Git Bash/WSL).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/FuadTesfaye/gitbridge/main/install.sh | bash

set -e

# ANSI Color Codes
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}${BOLD}   ____ _ _   ____       _     _            ${NC}"
echo -e "${CYAN}${BOLD}  / ___(_) |_| __ ) _ __(_) __| | __ _  ___ ${NC}"
echo -e "${CYAN}${BOLD} | |  _| | __|  _ \| '__| |/ _\` |/ _\` |/ _ \\${NC}"
echo -e "${CYAN}${BOLD} | |_| | | |_| |_) | |  | | (_| | (_| |  __/${NC}"
echo -e "${CYAN}${BOLD}  \____|_|\__|____/|_|  |_|\__,_|\__, |\___|${NC}"
echo -e "${CYAN}${BOLD}                                 |___/      ${NC}"
echo -e "  ${GRAY}Universal Git Identity & Multi-Account Management Layer${NC}"
echo ""

# 1. Detect Operating System and Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux*)     PLATFORM="linux" ;;
    Darwin*)    PLATFORM="macos" ;;
    CYGWIN*|MINGW*|MSYS*) PLATFORM="windows" ;;
    *)          PLATFORM="unknown" ;;
esac

echo -e "${BOLD}1. Detecting Environment:${NC}"
echo -e "   • Operating System: ${CYAN}${OS}${NC} (${PLATFORM})"
echo -e "   • Architecture:     ${CYAN}${ARCH}${NC}"

# 2. Check for JavaScript runtime (Bun, Node/npm)
echo -e "\n${BOLD}2. Checking Runtime Dependencies:${NC}"

INSTALL_CMD=""
RUNTIME=""

if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"
    INSTALL_CMD="bun add -g @fuad24/gitbridge@latest"
    echo -e "   ${GREEN}✔${NC} Found ${CYAN}Bun${NC} ($(bun --version))"
elif command -v npm >/dev/null 2>&1; then
    RUNTIME="npm"
    INSTALL_CMD="npm install -g @fuad24/gitbridge@latest"
    echo -e "   ${GREEN}✔${NC} Found ${CYAN}Node.js & npm${NC} (node $(node -v 2>/dev/null || echo ''))"
elif command -v pnpm >/dev/null 2>&1; then
    RUNTIME="pnpm"
    INSTALL_CMD="pnpm add -g @fuad24/gitbridge@latest"
    echo -e "   ${GREEN}✔${NC} Found ${CYAN}pnpm${NC}"
elif command -v yarn >/dev/null 2>&1; then
    RUNTIME="yarn"
    INSTALL_CMD="yarn global add @fuad24/gitbridge@latest"
    echo -e "   ${GREEN}✔${NC} Found ${CYAN}yarn${NC}"
else
    echo -e "   ${YELLOW}○ No Bun or Node.js runtime detected.${NC}"
    echo -e "   ${CYAN}Installing Bun (fast, zero-dependency JavaScript runtime)...${NC}"
    
    if curl -fsSL https://bun.sh/install | bash; then
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        RUNTIME="bun"
        INSTALL_CMD="bun add -g @fuad24/gitbridge@latest"
        echo -e "   ${GREEN}✔${NC} Bun installed successfully!"
    else
        echo -e "${RED}Error: Failed to install Bun. Please install Node.js (v18+) or Bun manually and rerun.${NC}"
        exit 1
    fi
fi

# 3. Install or update GitBridge
echo -e "\n${BOLD}3. Installing GitBridge CLI (@fuad24/gitbridge):${NC}"
echo -e "   ${GRAY}Running: ${INSTALL_CMD}${NC}"

if $INSTALL_CMD; then
    echo -e "   ${GREEN}✔${NC} GitBridge package installed successfully!"
else
    echo -e "   ${YELLOW}Retrying with global flags...${NC}"
    if [ "$RUNTIME" = "npm" ]; then
        npm install -g @fuad24/gitbridge@latest --no-fund --no-audit || true
    fi
fi

# 4. Verify binary placement and PATH setup
echo -e "\n${BOLD}4. Verifying Executable PATH:${NC}"

BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

# Check where the binaries were placed
FOUND_GB=""
if command -v gb >/dev/null 2>&1; then
    FOUND_GB="$(command -v gb)"
elif [ -x "$HOME/.local/bin/gb" ]; then
    FOUND_GB="$HOME/.local/bin/gb"
elif [ -x "$HOME/.bun/bin/gb" ]; then
    FOUND_GB="$HOME/.bun/bin/gb"
elif [ -x "/usr/local/bin/gb" ]; then
    FOUND_GB="/usr/local/bin/gb"
fi

# If in .bun/bin or npm prefix, symlink into ~/.local/bin for maximum compatibility
if [ -n "$FOUND_GB" ] && [ "$FOUND_GB" != "$BIN_DIR/gb" ] && [ -w "$BIN_DIR" ]; then
    ln -sf "$FOUND_GB" "$BIN_DIR/gb" 2>/dev/null || true
    FOUND_GITBRIDGE="$(echo "$FOUND_GB" | sed 's/\/gb$/\/gitbridge/')"
    if [ -x "$FOUND_GITBRIDGE" ]; then
        ln -sf "$FOUND_GITBRIDGE" "$BIN_DIR/gitbridge" 2>/dev/null || true
    fi
fi

# Ensure ~/.local/bin and ~/.bun/bin are in shell profiles
SHELL_PROFILES=()
[ -f "$HOME/.bashrc" ] && SHELL_PROFILES+=("$HOME/.bashrc")
[ -f "$HOME/.zshrc" ] && SHELL_PROFILES+=("$HOME/.zshrc")
[ -f "$HOME/.profile" ] && SHELL_PROFILES+=("$HOME/.profile")

PATH_LINE='export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"'

for profile in "${SHELL_PROFILES[@]}"; do
    if ! grep -q '.local/bin' "$profile" 2>/dev/null; then
        echo "" >> "$profile"
        echo "# Added by GitBridge Installer" >> "$profile"
        echo "$PATH_LINE" >> "$profile"
        echo -e "   ${GREEN}✔${NC} Added PATH export to ${CYAN}${profile}${NC}"
    fi
done

# 5. Success Banner and Next Steps
export PATH="$BIN_DIR:$HOME/.bun/bin:$PATH"

echo -e "\n${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✔ GitBridge is installed and ready to use!                   ${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Dual Binaries Available:"
echo -e "    • ${CYAN}${BOLD}gitbridge${NC}  (full command)"
echo -e "    • ${CYAN}${BOLD}gb${NC}         (fast shorthand)"
echo ""
echo -e "  Quick Start Guide:"
echo -e "    1. ${BOLD}gb setup${NC}               Interactive onboarding wizard"
echo -e "    2. ${BOLD}gb context${NC}             Inspect active Git identity & remote routing"
echo -e "    3. ${BOLD}gb repo set${NC}            Permanently bind current repo to email & provider"
echo -e "    4. ${BOLD}gb sec check${NC}           Run full security audit & leak checks"
echo -e "    5. ${BOLD}gb override enable${NC}     Route native 'git' commands automatically"
echo ""
echo -e "  ${GRAY}If 'gb' is not found immediately in this session, run:${NC}"
echo -e "  ${CYAN}source ~/.bashrc${NC} ${GRAY}(or source ~/.zshrc)${NC}\n"
