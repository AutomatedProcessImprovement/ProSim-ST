#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] Waiting for DB at ${NEXTJS_MYSQL_HOST}:${NEXTJS_MYSQL_PORT}"

  node - <<'JS'
const net = require("net");

const host = process.env.NEXTJS_MYSQL_HOST || "mysql_nextjs";
const port = parseInt(process.env.NEXTJS_MYSQL_PORT || "3306");
const timeout = 60000;

const start = Date.now();

function tryConnect() {
  const socket = new net.Socket();

  socket.setTimeout(2000);

  socket.on("connect", () => {
    socket.destroy();
    process.exit(0);
  });

  socket.on("error", retry);
  socket.on("timeout", retry);

  function retry() {
    socket.destroy();
    if (Date.now() - start > timeout) {
      console.error(`DB at ${host}:${port} not reachable`);
      process.exit(1);
    }
    setTimeout(tryConnect, 1000);
  }

  socket.connect(port, host);
}

tryConnect();
JS

  echo "[entrypoint] Running migrations"
  node dist/db/scripts/runMigrations.js
fi

exec "$@"