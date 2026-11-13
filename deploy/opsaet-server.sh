#!/bin/bash
# Gør en helt ny Ubuntu 24.04-server klar til JHFS Core. Køres ÉN gang som root.
#
#   bash opsaet-server.sh "<din offentlige SSH-nøgle>"
#
# Hvad scriptet gør:
#  - Opretter brugeren "jens" med din SSH-nøgle og sudo
#  - SSH: kun nøgle, ingen kodeord, ingen root-login
#  - Firewall: kun 22 (SSH), 80 og 443 (Core) er åbne
#  - Automatiske sikkerhedsopdateringer (genstart kl. 04:30 hvis nødvendigt)
#  - fail2ban: blokerer adresser, der prøver at gætte sig ind
#  - Installerer Docker og restic (backup)
set -euo pipefail

NOEGLE="${1:-}"
if [[ -z "$NOEGLE" || "$NOEGLE" != ssh-* ]]; then
  echo "Brug: bash opsaet-server.sh \"ssh-ed25519 AAAA... din@computer\"" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Skal køres som root" >&2
  exit 1
fi

BRUGER=jens
export DEBIAN_FRONTEND=noninteractive

echo "==> Opdaterer systemet"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ufw fail2ban unattended-upgrades ca-certificates curl git restic

echo "==> Bruger $BRUGER"
if ! id "$BRUGER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$BRUGER"
fi
usermod -aG sudo "$BRUGER"
install -d -m 700 -o "$BRUGER" -g "$BRUGER" "/home/$BRUGER/.ssh"
echo "$NOEGLE" > "/home/$BRUGER/.ssh/authorized_keys"
chown "$BRUGER:$BRUGER" "/home/$BRUGER/.ssh/authorized_keys"
chmod 600 "/home/$BRUGER/.ssh/authorized_keys"
# sudo uden kodeord (der findes intet kodeord – login sker kun med nøglen)
echo "$BRUGER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$BRUGER"
chmod 440 "/etc/sudoers.d/90-$BRUGER"

echo "==> SSH: kun nøgle, ingen root"
cat > /etc/ssh/sshd_config.d/90-jhfs.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
AllowUsers jens
EOF
sshd -t
systemctl reload ssh

echo "==> Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Automatiske sikkerhedsopdateringer"
cat > /etc/apt/apt.conf.d/52jhfs-opdateringer <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

echo "==> fail2ban"
cat > /etc/fail2ban/jail.d/jhfs.conf <<'EOF'
[sshd]
enabled = true
maxretry = 3
bantime = 1d
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck source=/dev/null
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
# Docker må ikke åbne porte forbi firewallen: Kun Caddy publicerer porte (80/443), og det er dem, vi har åbnet.
usermod -aG docker "$BRUGER"

install -d -o "$BRUGER" -g "$BRUGER" /opt/jhfs-core

echo
echo "Færdig. Log ud og ind igen som:  ssh $BRUGER@<serverens-ip>"
echo "Root-login med kodeord er nu slået fra."
