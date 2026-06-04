#!/usr/bin/env bash
set -euo pipefail

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required on the target VM." >&2
  exit 1
fi

sudo apt-get update

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get install -y ca-certificates curl gnupg docker.io rsync
else
  sudo apt-get install -y rsync
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin \
    || sudo apt-get install -y docker-compose-v2
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required but could not be installed." >&2
  exit 1
fi

sudo systemctl enable --now docker

sudo mkdir -p \
  /opt/ai-dungeon-master/data/sessions \
  /opt/ai-dungeon-master/data/logs \
  /opt/ai-dungeon-master/caddy_data \
  /opt/ai-dungeon-master/caddy_config

sudo chown -R "$USER:$USER" /opt/ai-dungeon-master

if ! id -nG "$USER" | grep -qw docker; then
  sudo usermod -aG docker "$USER" || true
fi

echo "Oracle VM bootstrap complete."
