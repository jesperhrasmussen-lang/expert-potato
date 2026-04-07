#!/bin/bash
# Setup script for code-server + Claude Code on Hostinger VPS
# Run this in your Hostinger browser terminal
#
# Usage: bash setup-vps-dev.sh YOUR_DOMAIN_OR_IP
#   e.g.: bash setup-vps-dev.sh 123.45.67.89
#   e.g.: bash setup-vps-dev.sh dev.mydomain.com

set -e

HOST="${1:?Usage: bash setup-vps-dev.sh YOUR_DOMAIN_OR_IP}"

echo "=== 1/5 Installing code-server ==="
curl -fsSL https://code-server.dev/install.sh | sh

echo "=== 2/5 Installing Claude Code ==="
curl -fsSL https://claude.ai/install.sh | bash

echo "=== 3/5 Configuring code-server ==="
mkdir -p ~/.config/code-server
cat > ~/.config/code-server/config.yaml <<EOF
bind-addr: 0.0.0.0:8080
auth: password
password: $(openssl rand -base64 16)
cert: false
EOF

echo ""
echo "========================================="
echo "  Your code-server password is:"
grep password ~/.config/code-server/config.yaml
echo "  SAVE THIS PASSWORD NOW"
echo "========================================="
echo ""

echo "=== 4/5 Installing Claude Code VS Code extension ==="
# Try installing from Open VSX first, fall back to manual download
code-server --install-extension anthropic.claude-code 2>/dev/null || {
  echo "Extension not on Open VSX — downloading .vsix manually..."
  VSIX_URL=$(curl -s https://open-vsx.org/api/anthropic/claude-code/latest 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('files',{}).get('download',''))" 2>/dev/null)
  if [ -n "$VSIX_URL" ]; then
    curl -fsSL "$VSIX_URL" -o /tmp/claude-code.vsix
    code-server --install-extension /tmp/claude-code.vsix
  else
    echo ""
    echo "NOTE: Claude Code extension not available for auto-install."
    echo "You can still use Claude Code from the terminal inside code-server."
    echo "Run 'claude' in the integrated terminal."
    echo ""
  fi
}

echo "=== 5/5 Setting up systemd service ==="
sudo tee /etc/systemd/system/code-server.service > /dev/null <<EOF
[Unit]
Description=code-server
After=network.target

[Service]
Type=exec
User=$(whoami)
ExecStart=$(which code-server)
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable code-server
sudo systemctl start code-server

echo ""
echo "========================================="
echo "  SETUP COMPLETE"
echo ""
echo "  Open in your browser:"
echo "    http://${HOST}:8080"
echo ""
echo "  Password:"
grep password ~/.config/code-server/config.yaml
echo ""
echo "  Next steps:"
echo "    1. Open http://${HOST}:8080 in your browser"
echo "    2. Enter the password above"
echo "    3. Open a terminal (Ctrl+\`) and run: claude"
echo "    4. Authenticate with your Claude Max account"
echo "    5. Clone your repo:"
echo "       git clone https://github.com/jesperhrasmussen-lang/expert-potato.git"
echo ""
echo "  SECURITY: Set up HTTPS with nginx + Let's Encrypt"
echo "  if you plan to use this long-term."
echo "========================================="
