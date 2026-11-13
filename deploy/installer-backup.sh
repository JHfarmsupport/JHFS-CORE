#!/bin/bash
# Installerer de to timere: backup hver nat kl. 02:15 og test af backuppen hver søndag kl. 05:00.
#   sudo bash installer-backup.sh
set -euo pipefail
MAPPE="$(cd "$(dirname "$0")" && pwd)"
BRUGER="${SUDO_USER:-jens}"

cat > /etc/systemd/system/jhfs-backup.service <<EOF
[Unit]
Description=JHFS Core backup
[Service]
Type=oneshot
User=$BRUGER
ExecStart=$MAPPE/backup.sh
EOF

cat > /etc/systemd/system/jhfs-backup.timer <<'EOF'
[Unit]
Description=JHFS Core backup hver nat
[Timer]
OnCalendar=*-*-* 02:15:00
RandomizedDelaySec=10m
Persistent=true
[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/jhfs-backup-test.service <<EOF
[Unit]
Description=JHFS Core test af backup
[Service]
Type=oneshot
User=$BRUGER
ExecStart=$MAPPE/backup-test.sh
EOF

cat > /etc/systemd/system/jhfs-backup-test.timer <<'EOF'
[Unit]
Description=JHFS Core test af backup hver søndag
[Timer]
OnCalendar=Sun *-*-* 05:00:00
Persistent=true
[Install]
WantedBy=timers.target
EOF

chmod +x "$MAPPE/backup.sh" "$MAPPE/backup-test.sh"
systemctl daemon-reload
systemctl enable --now jhfs-backup.timer jhfs-backup-test.timer
systemctl list-timers 'jhfs-*'
