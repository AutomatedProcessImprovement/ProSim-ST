# Cleanup of old simulations

A simulation is deleted once it has not been opened for `RETENTION_DAYS` days (30 by default):
its database records (process, events, frames), its uploaded BPMN model, and its folder and n-grams in the Python service.
Run folders and uploaded models that belong to no simulation (e.g. failed runs) are removed once they are 48 hours old.
A simulation is first marked for deletion (the API answers 410 for it), so one that fails to delete is retried on the next run.

## On a server

The cleanup runs inside the web app, so it also works with the standalone build:

```bash
curl -X POST -H "Authorization: Bearer $CLEANUP_TOKEN" http://127.0.0.1:3001/api/internal/cleanup
```

The endpoint answers 404 unless `CLEANUP_TOKEN` is set in the app's environment and sent in the header.
Do not expose `/api/internal/` publicly. A nightly systemd timer or cron entry calling it is enough, for example:

```
30 3 * * * curl -sf -X POST -H "Authorization: Bearer <token>" http://127.0.0.1:3001/api/internal/cleanup
```

## Locally

```bash
npm run cleanup
```
