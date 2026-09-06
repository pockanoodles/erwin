#!/bin/zsh
# Launches erwin (production build) under the pinned Node, for launchd/com.erwin.app.
# Kept alongside ops runtime; loads nvm so launchd gets Node 20.14.0, not the shell default.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20.14.0 >/dev/null 2>&1
cd /Users/kaitosoeno/Projects/erwin || exit 1
exec npm run start
