# launchd — how erwin runs on this machine

Erwin is a locally hosted always-on app, not a deployed service. Two launchd
agents keep it up; both are user agents (`gui/<uid>`), no root involved.

| Agent | Runs | Why it exists |
|---|---|---|
| `com.erwin.app` | `npm run start` on `PORT=3939` | The web app. `ops` reaches it at `http://localhost:3939`. |
| `com.erwin.worker` | `node dist/saas/jobs/worker.js` | The BullMQ sync worker. Owns periodic Canvas + CalDAV polling, with adaptive intervals (30 min when a deadline falls inside 48h). **Without it, syncing only happens when you press a button in Settings.** |

Both `.sh` wrappers load `nvm` before exec'ing, because launchd does not read
your shell profile and would otherwise pick the wrong Node.

## Dependencies

- Postgres — `brew services start postgresql@16` (erwin's database)
- Redis — `brew services start redis` (BullMQ's queue; the worker exits without it)
- `REDIS_URL=redis://localhost:6379` must be present in `.env`

## Install

```sh
cp launchd/*.plist ~/Library/LaunchAgents/
cp launchd/*.sh ~/.ops/ && chmod +x ~/.ops/erwin-*.sh
npm run build && npm run build:worker
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.erwin.app.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.erwin.worker.plist
```

Rebuild the worker (`npm run build:worker`) after any change under
`src/saas/jobs/` or `src/lib/erwin/`, then
`launchctl kickstart -k gui/$(id -u)/com.erwin.worker`.

## Check

```sh
launchctl list | grep com.erwin    # want exit status 0
tail -f ~/.ops/erwin-worker.log
```

The `.sh` wrappers live in `~/.ops/` rather than here because that is where
the ops runtime keeps its launch scripts; these are copies of record.
