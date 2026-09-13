#!/bin/bash
# Day log cua lan chay vua roi len CloudWatch TRUOC khi tat may.
#
# Khong lam viec nay thi moi lan debug phai start lai instance, va unit lai chay
# roi tu tat -- chi kip mot cua so vai chuc giay de doc journal. Da mat nhieu
# luot vi chuyen do.
set -uo pipefail
REGION=ap-southeast-1
GROUP=/taw-qa/runner
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
IID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id || echo unknown)
STREAM="$(date -u +%Y%m%d-%H%M%S)-$IID"

aws logs create-log-stream --region $REGION --log-group-name "$GROUP" --log-stream-name "$STREAM" 2>/dev/null

# CloudWatch nhan toi da 10000 event/lan; lay 500 dong cuoi la du de chan doan.
TS=$(($(date +%s) * 1000))
journalctl -u taw-qa -b 0 --no-pager -o cat 2>/dev/null | tail -500 \
 | python3 -c "
import json,sys,os
ts=int(os.environ['TS'])
ev=[{'timestamp':ts+i,'message':l.rstrip()[:8000] or ' '} for i,l in enumerate(sys.stdin)]
json.dump(ev[:10000], open('/tmp/ev.json','w'))
" TS=$TS 2>/dev/null || exit 0

[ -s /tmp/ev.json ] && aws logs put-log-events --region $REGION \
  --log-group-name "$GROUP" --log-stream-name "$STREAM" \
  --log-events file:///tmp/ev.json >/dev/null 2>&1
echo "log da day len $GROUP/$STREAM"
