#!/usr/bin/env bash
# Runs every test suite against fresh, isolated databases. Requires `npm run build` first.
set -u
cd "$(dirname "$0")/.."
fail=0
run() { # port suite
  local dir; dir=$(mktemp -d)
  if curl -s -o /dev/null "http://localhost:$1/login"; then echo "port $1 is busy"; fail=1; return; fi
  DATA_DIR="$dir" setsid node_modules/.bin/next start -p "$1" >/dev/null 2>&1 &
  local pid=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$1/login" && break; sleep 0.5; done
  BASE="http://localhost:$1" node "tests/$2" || fail=1
  kill -- -$pid 2>/dev/null; wait $pid 2>/dev/null; rm -rf "$dir"
}
run 3100 scenarios.mjs
run 3101 trainee-security.mjs
run 3102 bank.mjs
exit $fail
