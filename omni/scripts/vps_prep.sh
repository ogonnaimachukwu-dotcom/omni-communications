#!/usr/bin/env bash
# =========================================================================
# OMNI COMMUNICATIONS - VPS PROVISIONING & FIREWALL INITIALIZATION
# =========================================================================
set -eo pipefail

echo "==> [Phase 1] Starting VPS Package Preparation..."

# Ensure running as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script as root or using sudo." >&2
  exit 1
fi

# 1. Update Apt Repositories
echo "--> Updating apt index..."
apt-get update -y

# 2. Pre-requisite Packages
echo "--> Installing utilities..."
apt-get install -y curl git unzip htop fail2ban ca-certificates gnupg lsb-release ufw

# 3. Docker Official Repository Setup
echo "--> Installing Docker engine keys..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
chmod a+r /etc/apt/keyrings/docker.gpg

echo "--> Setting up Docker repository indexing..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y

# 4. Install Docker
echo "--> Installing Docker Engine and Compose plugin..."
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Verify Package Installations
echo "==> [Phase 2] Verifying package configurations..."
for pkg in git curl unzip htop fail2ban docker ufw; do
  if command -v "$pkg" &> /dev/null || dpkg -s "$pkg" &> /dev/null; then
    echo "  [PASS] $pkg is installed and ready."
  else
    echo "  [FAIL] $pkg installation check failed!" >&2
    exit 1
  fi
done

# Verify Docker versioning
docker --version
docker compose version

# 6. Docker Startup Configuration
echo "--> Ensuring Docker daemon starts on boot..."
systemctl enable docker
systemctl start docker

# 7. Configure Firewall (UFW)
echo "--> Configuring UFW rules..."
ufw default deny incoming
ufw default allow outgoing

# Open necessary ports (allow SSH/HTTP/HTTPS)
ufw allow 22/tcp comment 'SSH Port'
ufw allow 80/tcp comment 'HTTP Port'
ufw allow 443/tcp comment 'HTTPS Port'

# Enable firewall safely
echo "--> Enabling UFW firewall..."
ufw --force enable

echo "--> Displaying firewall rules..."
ufw status verbose

echo "==> VPS package provisioning completed successfully."
