#!/usr/bin/env bash
set -euo pipefail

ROOT="/data/.openclaw/workspace"
DB="$ROOT/projects/nearby-offers-webapp/data/nearby-offers.db"
LOG_DIR="$ROOT/projects/nearby-offers-webapp/logs"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/refresh-$STAMP.log"

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$DB")"

{
  echo "== Nearby Offers refresh =="
  echo "timestamp: $(date --iso-8601=seconds)"
  echo "db: $DB"
  echo
  python3 "$ROOT/scripts/refresh_offer_db_dk.py" "$DB" --reset
} | tee "$LOG_FILE"

echo

echo "log: $LOG_FILE"

