#!/bin/zsh
# Launches the erwin BullMQ sync worker, for launchd/com.erwin.worker.
# Mirrors erwin-run.sh: loads nvm so launchd gets Node 20.14.0, not the shell default.
# The worker owns periodic Canvas + CalDAV sync; without it, syncing is button-only.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20.14.0 >/dev/null 2>&1
cd /Users/kaitosoeno/Projects/erwin || exit 1
exec node dist/saas/jobs/worker.js
