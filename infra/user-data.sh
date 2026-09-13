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
apt-get install -y nodejs git jq awscli

# journald mac dinh luu trong RAM; instance tat la mat log cua run vua hong.
mkdir -p /var/log/journal
systemd-tmpfiles --create --prefix /var/log/journal
systemctl restart systemd-journald

git clone https://github.com/tawgroup/taw-qa.git /opt/taw-qa
mkdir -p /work

# Chromium + thư viện hệ thống. Nặng, nên làm ở đây chứ không mỗi lần boot.
cd /opt/taw-qa && npm ci --omit=dev
npx --yes playwright@1.55.0 install --with-deps chromium

bash /opt/taw-qa/infra/install-unit.sh

echo "[provision] xong. Xem log moi lan chay: journalctl -u taw-qa"
