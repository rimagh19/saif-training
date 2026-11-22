Browser end-to-end flows (Playwright for Python + Chrome). Each script expects a fresh
server on the port written at its top, e.g.:

    DATA_DIR=$(mktemp -d) npx next start -p 3600 &
    python3 tests/browser/library.py

Screenshots are written to the folder named in the script (edit `S`/`SHOTS` as needed).
