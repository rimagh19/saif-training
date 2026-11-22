#!/usr/bin/env bash
# Runs every test suite against fresh, isolated databases. Requires `npm run build` first.
#   bash tests/run-all.sh            → local SQLite file + instant streaming (own server)
#   DB=remote bash tests/run-all.sh  → libSQL server over HTTP + polling, exactly like Vercel + Turso
#                                       (needs the `sqld` binary: SQLD_BIN=/path/to/sqld)
set -u
cd "$(dirname "$0")/.."
fail=0
run() { # port suite
  local dir; dir=$(mktemp -d)
  if curl -s -o /dev/null "http://localhost:$1/login"; then echo "port $1 is busy"; fail=1; return; fi
  local env=(DATA_DIR="$dir")
  local sqld_pid=""
  if [ "${DB:-local}" = "remote" ]; then
    local dbport=$(( $1 + 5000 ))
    setsid "${SQLD_BIN:-sqld}" --db-path "$dir/sqld" --http-listen-addr "127.0.0.1:$dbport" >/dev/null 2>&1 &
    sqld_pid=$!
    sleep 1
    env+=(TURSO_DATABASE_URL="http://127.0.0.1:$dbport" REALTIME_MODE=poll)
  fi
  env "${env[@]}" setsid node_modules/.bin/next start -p "$1" >/dev/null 2>&1 &
  local pid=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$1/login" && break; sleep 0.5; done
  BASE="http://localhost:$1" node "tests/$2" || fail=1
  kill -- -$pid 2>/dev/null; wait $pid 2>/dev/null
  [ -n "$sqld_pid" ] && { kill -- -$sqld_pid 2>/dev/null; wait $sqld_pid 2>/dev/null; }
  rm -rf "$dir"
}
run 3100 scenarios.mjs
run 3101 trainee-security.mjs
run 3102 bank.mjs
exit $fail
