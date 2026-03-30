#!/usr/bin/env bash
# install.sh — One-click OpenClaw FinOps installer for Claude Desktop and Cursor
# Usage: curl -fsSL https://raw.githubusercontent.com/maryadawson-code/openclaw-finops/main/scripts/install.sh | bash
#
# What it does:
# 1. Detects if Claude Desktop or Cursor is installed
# 2. Prompts for your API key (or uses free tier placeholder)
# 3. Adds the OpenClaw MCP server config to the right config file
# 4. Done — next conversation has real cloud pricing

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       OpenClaw FinOps — One-Click Installer           ║${NC}"
echo -e "${BOLD}${CYAN}║  Stop AI agents from hallucinating cloud costs.       ║${NC}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Detect OS
OS="unknown"
case "$(uname -s)" in
  Darwin*) OS="mac" ;;
  Linux*)  OS="linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
esac

# Config file locations
CLAUDE_CONFIG=""
CURSOR_CONFIG=""

if [ "$OS" = "mac" ]; then
  CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
  CURSOR_CONFIG="$HOME/.cursor/mcp.json"
elif [ "$OS" = "linux" ]; then
  CLAUDE_CONFIG="$HOME/.config/claude/claude_desktop_config.json"
  CURSOR_CONFIG="$HOME/.cursor/mcp.json"
elif [ "$OS" = "windows" ]; then
  CLAUDE_CONFIG="$APPDATA/Claude/claude_desktop_config.json"
  CURSOR_CONFIG="$HOME/.cursor/mcp.json"
fi

# Detect installed clients
FOUND_CLAUDE=false
FOUND_CURSOR=false

if [ -n "$CLAUDE_CONFIG" ]; then
  CONFIG_DIR="$(dirname "$CLAUDE_CONFIG")"
  if [ -d "$CONFIG_DIR" ] || command -v claude &>/dev/null; then
    FOUND_CLAUDE=true
  fi
fi

if [ -d "$HOME/.cursor" ] || command -v cursor &>/dev/null; then
  FOUND_CURSOR=true
fi

if [ "$FOUND_CLAUDE" = false ] && [ "$FOUND_CURSOR" = false ]; then
  echo -e "${BLUE}No Claude Desktop or Cursor installation detected.${NC}"
  echo ""
  echo "You can still use OpenClaw FinOps! Add this to your MCP client config:"
  echo ""
  echo '  {
    "mcpServers": {
      "openclaw-finops": {
        "type": "streamable-http",
        "url": "https://openclaw-finops.marywomack.workers.dev/mcp",
        "headers": { "x-api-key": "YOUR_API_KEY" }
      }
    }
  }'
  echo ""
  echo -e "Get a free API key at: ${CYAN}https://openclaw-finops.marywomack.workers.dev${NC}"
  exit 0
fi

# Get API key
echo -e "${BOLD}Enter your OpenClaw API key${NC} (press Enter to use free tier demo):"
read -r API_KEY
if [ -z "$API_KEY" ]; then
  API_KEY="demo-free-tier"
  echo -e "  Using free tier demo key. ${BLUE}Get your own at the signup page.${NC}"
fi
echo ""

# MCP server JSON block
MCP_ENTRY='{
      "type": "streamable-http",
      "url": "https://openclaw-finops.marywomack.workers.dev/mcp",
      "headers": { "x-api-key": "'"$API_KEY"'" }
    }'

install_to_config() {
  local config_file="$1"
  local client_name="$2"
  local config_dir
  config_dir="$(dirname "$config_file")"

  # Create directory if needed
  mkdir -p "$config_dir"

  if [ -f "$config_file" ]; then
    # Check if already installed
    if grep -q "openclaw-finops" "$config_file" 2>/dev/null; then
      echo -e "  ${GREEN}Already installed in ${client_name}!${NC} Updating API key..."
      # Use python3 to update the existing config
      python3 -c "
import json, sys
with open('$config_file', 'r') as f:
    config = json.load(f)
config.setdefault('mcpServers', {})
config['mcpServers']['openclaw-finops'] = {
    'type': 'streamable-http',
    'url': 'https://openclaw-finops.marywomack.workers.dev/mcp',
    'headers': {'x-api-key': '$API_KEY'}
}
with open('$config_file', 'w') as f:
    json.dump(config, f, indent=2)
" 2>/dev/null
      return
    fi

    # Add to existing config
    python3 -c "
import json
with open('$config_file', 'r') as f:
    config = json.load(f)
config.setdefault('mcpServers', {})
config['mcpServers']['openclaw-finops'] = {
    'type': 'streamable-http',
    'url': 'https://openclaw-finops.marywomack.workers.dev/mcp',
    'headers': {'x-api-key': '$API_KEY'}
}
with open('$config_file', 'w') as f:
    json.dump(config, f, indent=2)
" 2>/dev/null
  else
    # Create new config
    cat > "$config_file" <<JSONEOF
{
  "mcpServers": {
    "openclaw-finops": {
      "type": "streamable-http",
      "url": "https://openclaw-finops.marywomack.workers.dev/mcp",
      "headers": { "x-api-key": "$API_KEY" }
    }
  }
}
JSONEOF
  fi

  echo -e "  ${GREEN}Installed in ${client_name}!${NC}"
}

# Install
if [ "$FOUND_CLAUDE" = true ]; then
  echo -e "${BOLD}Installing for Claude Desktop...${NC}"
  install_to_config "$CLAUDE_CONFIG" "Claude Desktop"
fi

if [ "$FOUND_CURSOR" = true ]; then
  echo -e "${BOLD}Installing for Cursor...${NC}"
  install_to_config "$CURSOR_CONFIG" "Cursor"
fi

echo ""
echo -e "${GREEN}${BOLD}Done!${NC} OpenClaw FinOps is ready."
echo ""
echo -e "  ${BOLD}What happens next:${NC}"
echo "  1. Restart Claude Desktop or Cursor"
echo "  2. Ask your agent: \"What would it cost to run an m5.large with Postgres on AWS?\""
echo "  3. Get real pricing instead of hallucinated numbers"
echo ""
echo -e "  ${BOLD}Free tier:${NC} 25 operations/month"
echo -e "  ${BOLD}Upgrade:${NC}  https://openclaw-finops.marywomack.workers.dev"
echo -e "  ${BOLD}GitHub:${NC}   https://github.com/maryadawson-code/openclaw-finops"
echo ""
echo -e "  ${CYAN}Your agent will never hallucinate cloud costs again.${NC}"
echo ""
