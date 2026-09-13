#!/bin/bash
# Chạy MỘT LẦN, lúc instance được tạo. cloud-init không chạy lại user-data ở
# các lần boot sau — mà Lambda start/stop instance liên tục. Nên việc của script
# này là cài đặt rồi lắp một systemd unit, và chính unit đó chạy mỗi lần boot.
set -uo pipefail
exec > >(tee -a /var/log/taw-qa-provision.log) 2>&1
echo "[provision] $(date -Is)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git jq

# journald mac dinh luu trong RAM; instance tat la mat log cua run vua hong.
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
systemctl restart systemd-journald

git clone https://github.com/tawgroup/taw-qa.git /opt/taw-qa
mkdir -p /work

# Chromium + thư viện hệ thống. Nặng, nên làm ở đây chứ không mỗi lần boot.
cd /opt/taw-qa && npm ci --omit=dev
npx --yes playwright@1.55.0 install --with-deps chromium

cat > /etc/systemd/system/taw-qa.service <<'UNIT'
[Unit]
Description=taw-qa Runner: mot lan chay roi tu tat
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/taw-qa
Environment=AWS_REGION=ap-southeast-1
Environment=LOCK_PARAM=/taw-qa/current-run
# git pull lay code moi nhat moi lan boot; khong fail boot neu mang chap.
ExecStartPre=-/usr/bin/git -C /opt/taw-qa pull --ff-only
ExecStartPre=-/usr/bin/npm ci --omit=dev --prefix /opt/taw-qa
ExecStart=/usr/bin/node --experimental-strip-types /opt/taw-qa/src/runner.ts
StandardOutput=journal
StandardError=journal
RemainAfterExit=no
# Luoi an toan cuoi: runner vo den muc khong chay duoc finally thi systemd tat may.
ExecStopPost=/usr/bin/bash -c 'systemctl is-failed taw-qa.service >/dev/null && shutdown -h +1 || true' 

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable taw-qa.service
echo "[provision] xong. Xem log moi lan chay: journalctl -u taw-qa"
