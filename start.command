#!/bin/bash
# Double-click this file (or run ./start.command) to launch Stem Splitter locally.
cd "$(dirname "$0")" || exit 1

# Clear anything stale still bound to these ports from a previous session.
lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill 2>/dev/null
sleep 1

echo "Starting the engine..."
(
  cd engine || exit 1
  source .venv/bin/activate
  DEMUCS_DEVICE=cpu nohup uvicorn app:app --host 0.0.0.0 --port 8000 > /tmp/stem-engine.log 2>&1 &
  disown
)

echo "Starting the web app..."
(
  cd web || exit 1
  nohup npm run dev -- -p 3000 > /tmp/stem-web.log 2>&1 &
  disown
)

echo "Waiting for both to come up (first start can take a bit while the engine warms up)..."
for i in $(seq 1 60); do
  ENGINE_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null)
  WEB_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
  if [ "$ENGINE_OK" = "200" ] && [ "$WEB_OK" = "200" ]; then
    echo "Both are up."
    break
  fi
  sleep 1
done

if [ "$ENGINE_OK" != "200" ] || [ "$WEB_OK" != "200" ]; then
  echo "Something didn't come up in time. Check /tmp/stem-engine.log and /tmp/stem-web.log."
  exit 1
fi

open http://localhost:3000
echo "Stem Splitter is live at http://localhost:3000 (engine at http://localhost:8000)"
