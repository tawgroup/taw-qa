#!/bin/bash
# Day log cua lan chay vua roi len CloudWatch TRUOC khi tat may.
#
# Dung jq, khong dung python3: ban truoc truyen TS=$TS SAU `python3 -c` nen no
# thanh argv chu khong phai bien moi truong, os.environ['TS'] nem KeyError, roi
# `|| exit 0` nuot sach. Script im lang khong lam gi va khong ai biet.
set -uo pipefail
REGION=ap-southeast-1
GROUP=/taw-qa/runner

command -v aws >/dev/null || { echo "ship-logs: khong co aws CLI"; exit 0; }
command -v jq  >/dev/null || { echo "ship-logs: khong co jq"; exit 0; }

TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
IID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id || echo unknown)
STREAM="$(date -u +%Y%m%d-%H%M%S)-$IID"
TS=$(( $(date +%s) * 1000 ))

aws logs create-log-stream --region "$REGION" --log-group-name "$GROUP" --log-stream-name "$STREAM" 2>/dev/null

journalctl -u taw-qa -b 0 --no-pager -o cat 2>/dev/null | tail -400 \
  | jq -R -s --argjson ts "$TS" '
      split("\n") | map(select(length > 0))
      | to_entries
      | map({timestamp: ($ts + .key), message: (.value[0:8000])})
    ' > /tmp/ev.json

if [ -s /tmp/ev.json ] && [ "$(jq length /tmp/ev.json)" -gt 0 ]; then
  aws logs put-log-events --region "$REGION" \
    --log-group-name "$GROUP" --log-stream-name "$STREAM" \
    --log-events file:///tmp/ev.json >/dev/null && echo "ship-logs: da day $GROUP/$STREAM"
else
  echo "ship-logs: khong co dong log nao"
fi
