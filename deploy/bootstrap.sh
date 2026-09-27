#!/usr/bin/env bash
# Provisions a bare Ubuntu 24.04 droplet to serve both proposal apps.
# Idempotent — safe to re-run after an edit.
#
# Usage:  ssh root@46.101.139.175 'bash -s' < deploy/bootstrap.sh
set -euo pipefail

DATA_DIR=/var/lib/proposals
CF_IPS_V4=https://www.cloudflare.com/ips-v4
CF_IPS_V6=https://www.cloudflare.com/ips-v6

echo "==> swap"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx rsync unattended-upgrades

echo "==> node 24"
if ! command -v node >/dev/null || [[ "$(node -v)" != v24.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> users and data directory"
getent group proposals >/dev/null || groupadd --system proposals
for user in proposal-gen proposal-sign; do
  id -u "$user" >/dev/null 2>&1 || \
    useradd --system --gid proposals --home-dir /nonexistent --shell /usr/sbin/nologin "$user"
done

mkdir -p "$DATA_DIR"
chown root:proposals "$DATA_DIR"
# setgid: files created by either app stay readable by the other. This shared
# directory is what replaces the shared Blob store.
chmod 2770 "$DATA_DIR"

mkdir -p /srv/proposal-generator/releases /srv/proposal-sign/releases
chown -R proposal-gen:proposals /srv/proposal-generator
chown -R proposal-sign:proposals /srv/proposal-sign

echo "==> firewall"
# Fetch and check Cloudflare's ranges before touching ufw. A failed curl in an
# assignment stops the script under `set -e`; the same curl inside a `for`
# list would not, and would quietly leave 80/443 with no rules at all.
CF_V4=$(curl -fsSL "$CF_IPS_V4")
CF_V6=$(curl -fsSL "$CF_IPS_V6")
V4_RE='^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{2}$'
V6_RE='^[0-9a-fA-F:]+/[0-9]{2,3}$'
for ip in $CF_V4; do
  [[ $ip =~ $V4_RE ]] || { echo "unexpected Cloudflare IPv4 range: $ip" >&2; exit 1; }
done
for ip in $CF_V6; do
  [[ $ip =~ $V6_RE ]] || { echo "unexpected Cloudflare IPv6 range: $ip" >&2; exit 1; }
done
if (( $(wc -w <<<"$CF_V4") < 10 || $(wc -w <<<"$CF_V6") < 5 )); then
  echo "Cloudflare range lists look truncated — refusing to change the firewall" >&2
  exit 1
fi

# No `ufw reset`: on a re-run it would drop the live firewall — and the
# Cloudflare-only rule with it — for as long as the rebuild takes, or for good
# if a step failed. ufw skips a rule it already has, so re-adding is safe, and
# a failure part-way leaves the previous rules in force.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
# 80/443 only from Cloudflare. The origin must not be reachable directly, or
# the edge protection on quote.boolzai.co.il means nothing.
for ip in $CF_V4 $CF_V6; do
  ufw allow from "$ip" to any port 80,443 proto tcp comment 'cloudflare'
done
ufw --force enable
ufw status numbered

echo "==> unattended upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> done"
