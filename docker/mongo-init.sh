#!/bin/bash
set -euo pipefail

echo "taw-qa: restoring Mongo dump from /dump into farm_management"

shopt -s nullglob
archives=(/dump/*.gz /dump/*.archive)
if [ ${#archives[@]} -eq 0 ]; then
  echo "taw-qa: missing Mongo dump archive in /dump (host /Users/andie/taw-qa/mongo/). Restore aborted; will not seed empty." >&2
  exit 1
fi

archive="${archives[0]}"
echo "taw-qa: using ${archive}"
mongorestore --gzip --archive="${archive}"
echo "taw-qa: restore done"
