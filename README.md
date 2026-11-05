# ProSim-ST

ProSim-ST is a web application for exploring short-term business process simulations. Upload an event log of a running process, a BPMN model and its simulation parameters, and it simulates what happens next from the current state of the process. The result plays back as cases moving through the diagram, with waiting times, workload and per-activity statistics alongside.

The system has two parts:

| Part | Repository | Stack |
| --- | --- | --- |
| Web app (this repository) | [ProSim-ST](https://github.com/AutomatedProcessImprovement/ProSim-ST) | Next.js, React, TypeORM |
| Simulation service | [ongoing-bps-state](https://github.com/AutomatedProcessImprovement/ongoing-bps-state) | FastAPI, Prosimos |

Both use the same MySQL database. The web app also needs Redis.

## Requirements

- Node.js 20 or newer
- Python 3.11
- MySQL 8
- Redis 7
- Docker, if you would rather not install MySQL and Redis yourself, or to run everything in containers

## Run locally

Clone both repositories side by side:

```bash
git clone https://github.com/AutomatedProcessImprovement/ProSim-ST.git
git clone https://github.com/AutomatedProcessImprovement/ongoing-bps-state.git
```

Start MySQL and Redis:

```bash
docker run -d --name prosim-mysql -p 127.0.0.1:3306:3306 \
  -e MYSQL_ROOT_PASSWORD=change-me \
  -e MYSQL_DATABASE=prosim \
  -e MYSQL_USER=prosim \
  -e MYSQL_PASSWORD=change-me \
  mysql:8.0

docker run -d --name prosim-redis -p 127.0.0.1:6379:6379 redis:7-alpine
```

Start the simulation service:

```bash
cd ongoing-bps-state
python3.11 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cat > .env <<EOF
DB_USER=prosim
DB_PASSWORD=change-me
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=prosim
EOF

alembic upgrade head
uvicorn main_web_app:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start the web app:

```bash
cd ProSim-ST
cp .env.example .env
```

Set `MYSQL_HOST=127.0.0.1`, `MYSQL_USER=prosim`, `MYSQL_PASSWORD=change-me` and `MYSQL_DATABASE=prosim` in `.env`, then:

```bash
npm install
npm run migrate:run
npm run dev
```

Open http://localhost:3000. The start page offers two sample processes, so you can try it without your own files. `/api/health` reports whether the database, Redis and the simulation service are reachable.

## Run with Docker

The commands below build and start all four containers on one network. Run them from this repository, with `ongoing-bps-state` cloned next to it, and use your own passwords.

```bash
docker network create prosim

docker run -d --name prosim-mysql --network prosim \
  -v prosim-mysql:/var/lib/mysql \
  -e MYSQL_ROOT_PASSWORD=change-me \
  -e MYSQL_DATABASE=prosim \
  -e MYSQL_USER=prosim \
  -e MYSQL_PASSWORD=change-me \
  mysql:8.0

docker run -d --name prosim-redis --network prosim redis:7-alpine

docker build -t prosim-backend ../ongoing-bps-state
docker run -d --name prosim-backend --network prosim \
  -v prosim-processes:/app/processes \
  -e RUN_MIGRATIONS=1 \
  -e DB_USER=prosim \
  -e DB_PASSWORD=change-me \
  -e DB_HOST=prosim-mysql \
  -e DB_PORT=3306 \
  -e DB_NAME=prosim \
  prosim-backend

docker build -t prosim-st .
docker run -d --name prosim-st --network prosim \
  -p 127.0.0.1:3000:3000 \
  -v prosim-assets:/app/public/assets \
  -e RUN_MIGRATIONS=1 \
  -e NEXTJS_MYSQL_HOST=prosim-mysql \
  -e MYSQL_HOST=prosim-mysql \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=prosim \
  -e MYSQL_PASSWORD=change-me \
  -e MYSQL_DATABASE=prosim \
  -e TYPEORM_SYNCHRONIZE=false \
  -e TYPEORM_LOGGING=false \
  -e REDIS_HOST=prosim-redis \
  -e REDIS_PORT=6379 \
  -e PYTHON_MICROSERVICE_BASE_URL=http://prosim-backend:8000 \
  prosim-st
```

With `RUN_MIGRATIONS=1`, each app waits for MySQL and applies its migrations before it starts. The app is then at http://localhost:3000. The port is bound to `127.0.0.1`, so put a reverse proxy in front of it to serve it publicly.

## Configuration

The web app reads these variables from `.env`, or from the container environment:

| Variable | Purpose |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Database connection |
| `TYPEORM_SYNCHRONIZE` | Keep at `false`; the schema is managed by migrations |
| `TYPEORM_LOGGING` | Logs SQL queries when `true` |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection |
| `PYTHON_MICROSERVICE_BASE_URL` | Address of the simulation service |
| `CLEANUP_TOKEN` | Enables `/api/internal/cleanup`; see [cron/README.md](cron/README.md) |
| `RETENTION_DAYS` | Days before an unopened simulation is deleted, 30 by default |

`NEXTJS_MYSQL_HOST` and `NEXTJS_MYSQL_PORT` are used only by the container start script, to wait for MySQL.

## Tests

```bash
npm test                  # unit tests
npm run test:integration  # API routes against real MySQL and Redis; needs Docker
npm run test:e2e          # Playwright; starts the dev server on port 3000
npm run lint
```

## Database migrations

```bash
npm run migration -- <Name>  # generate a migration from entity changes
npm run migrate:run          # apply pending migrations
```

The simulation service keeps its own migrations, which run with `alembic upgrade head`.

## Deployment

Pushes to `main` run the tests in `.github/workflows/deploy.yml`, then deploy over SSH with Docker Compose. The Compose file lives on the server. Old simulations are removed by a nightly cleanup, described in [cron/README.md](cron/README.md).

## License

[Apache License 2.0](LICENSE)
