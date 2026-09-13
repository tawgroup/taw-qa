#!/bin/bash
# Tat instance sau moi lan chay. Chi dung aws CLI + IMDS, khong dung node_modules.
set -uo pipefail

# Day log TRUOC khi tat. Dat trong file nay chu khong phai them mot ExecStopPost
# moi: unit chi duoc ghi mot lan luc provision, con file nay duoc git pull moi
# lan boot -- nen sua o day thi lan chay sau tu co, khong can tao lai instance.
bash /opt/taw-qa/infra/ship-logs.sh || true

TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
IID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id || true)
if [ -n "${IID:-}" ]; then
  aws ec2 stop-instances --region ap-southeast-1 --instance-ids "$IID" && exit 0
fi
# Khong goi duoc API thi tat tu ben trong; may van dung, chi la EC2 bao "stopped"
# muon hon mot chut.
shutdown -h now
