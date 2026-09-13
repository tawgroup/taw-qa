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
aws logs create-log-stream --region "$REGION" --log-group-name "$GROUP" --log-stream-name "$STREAM" 2>/dev/null

# GIO THAT cua tung dong, khong bia.
#
# Ban truoc gan TS+i (mili giay tang dan) luc day log, nen moi dong deu mang
# cung mot gio. Thu tu dung nhung thoi diem sai hoan toan -- khong do duoc buoc
# nao cham, trong khi timeout mot lan chay la 45 phut.
#
# `-o short-unix` cho "<epoch>.<micro> <host> <unit>: <msg>"; lay epoch lam
# timestamp CloudWatch.
journalctl -u taw-qa -b 0 --no-pager -o short-unix 2>/dev/null | tail -400 \
  | jq -R -s '
      split("\n") | map(select(length > 0))
      | map(capture("^(?<t>[0-9]+)(\\.[0-9]+)? (?<rest>.*)$") // {t: null, rest: .})
      | map(select(.t != null))
      | map({timestamp: ((.t | tonumber) * 1000), message: (.rest[0:8000])})
    ' > /tmp/ev.json

if [ -s /tmp/ev.json ] && [ "$(jq length /tmp/ev.json)" -gt 0 ]; then
  aws logs put-log-events --region "$REGION" \
    --log-group-name "$GROUP" --log-stream-name "$STREAM" \
    --log-events file:///tmp/ev.json >/dev/null && echo "ship-logs: da day $GROUP/$STREAM"
else
  echo "ship-logs: khong co dong log nao"
fi
