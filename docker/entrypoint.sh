#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] Waiting for DB at ${NEXTJS_MYSQL_HOST:-mysql_nextjs}:${NEXTJS_MYSQL_PORT:-3306}"

  node - <<'JS'
const net = require("net");

const host = process.env.NEXTJS_MYSQL_HOST || "mysql_nextjs";
const port = parseInt(process.env.NEXTJS_MYSQL_PORT || "3306", 10);
const timeoutMs = parseInt(process.env.DB_WAIT_TIMEOUT || "60000", 10);
const started = Date.now();

function attempt() {
  const socket = new net.Socket();
  socket.setTimeout(2000);

  const retry = () => {
    socket.destroy();
    if (Date.now() - started > timeoutMs) {
      console.error(`DB at ${host}:${port} not reachable after ${timeoutMs}ms`);
      process.exit(1);
    }
    setTimeout(attempt, 1000);
  };

  socket.on("connect", () => {
    socket.destroy();
    process.exit(0);
  });

  socket.on("error", retry);
  socket.on("timeout", retry);

  socket.connect(port, host);
}

attempt();
JS

  echo "[entrypoint] Running migrations"
  npm run migrate:run
fi

exec "$@"