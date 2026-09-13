#!/bin/bash
# Lap systemd unit cho Runner. Tach rieng khoi user-data de vá duoc may dang
# chay (SSM goi thang script nay) thay vi phai tao lai instance.
set -euo pipefail

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

ExecStartPre=-/usr/bin/git -C /opt/taw-qa pull --ff-only
# KHONG co tien to `-`: npm ci hong ma van chay tiep thi runner vo voi
# node_modules dut doan, va ca duong don dep (nha khoa + tat may) deu vo theo vi
# chung cung phu thuoc @aws-sdk. Da xay ra that: instance chay vo han.
ExecStartPre=/usr/bin/npm ci --omit=dev --prefix /opt/taw-qa

ExecStart=/usr/bin/node --experimental-strip-types /opt/taw-qa/src/runner.ts

# Don dep KHONG duoc phu thuoc node_modules cua repo -- dung thu co the hong.
# aws CLI cua he thong chay duoc ca khi npm ci vo, ca khi runner bi SIGKILL.
ExecStopPost=-/usr/bin/aws ssm delete-parameter --region ap-southeast-1 --name /taw-qa/current-run
ExecStopPost=/usr/bin/bash /opt/taw-qa/infra/self-stop.sh

StandardOutput=journal
StandardError=journal
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable taw-qa.service
echo "unit da lap"
