<p align="center"><img src="brand/app-icon.svg" width="96" alt=""></p>

<h1 align="center">Erwin</h1>

<p align="center">Your calendar, your courses and your goals, and the one thing to do next.</p>

<p align="center"><a href="https://kaitosoeno.com/erwin">kaitosoeno.com/erwin</a> · <a href="LICENSE">MIT License</a></p>

![Erwin's Today screen, with example data](site/public/shots/today.webp)

Erwin reads your calendar, your Canvas courses and your goals, then ranks everything you have to do, so the top row is always the one to start. It runs as a desktop app with its own database, which means a download works offline with no account, or as a server you host to reach the same data from every device.

## What it does

- **It ranks by what is at stake.** Due dates, Canvas grade weights and goal importance feed one fixed-weight score (`src/lib/erwin/rank-stage1.ts`), so the order never changes for a reason you cannot read.
- **It shows one thing at a time.** Focus mode puts the next task, its course materials and its deadline on one screen, with done, skip and later on the D, S and L keys.
- **It holds your week.** Google, Outlook and CalDAV calendars sit beside your classes, and tasks drag into the open time or schedule themselves.
- **It mirrors your courses.** Canvas assignments arrive with their grade weights, and course pages and files are kept locally so a task's materials open from the task.
- **It plans in two-month cycles.** Goals belong to a cycle with a dated deliverable, and tasks linked to a goal rank higher.

## Install

Erwin has not had its first release yet. The channels below are set up in `packaging/` and go live with it, and until then you can run it from source.

| System | Channel | How |
|---|---|---|
| macOS | Mac App Store | Link at release |
| macOS | Homebrew | `brew install --cask pockanoodles/tap/erwin` |
| macOS | Disk image (Apple silicon, Intel) | [GitHub Releases](https://github.com/pockanoodles/erwin/releases) |
| Windows | Microsoft Store | Link at release |
| Windows | winget | `winget install KaitoSoeno.Erwin` |
| Windows | Installer (.exe) | [GitHub Releases](https://github.com/pockanoodles/erwin/releases) |
| Linux | Snap Store | `sudo snap install erwin` |
| Linux | AUR | `yay -S erwin-bin` |
| Linux | AppImage, .deb, .rpm | [GitHub Releases](https://github.com/pockanoodles/erwin/releases) |
| Server | Docker Compose | See [Self-host](#self-host) |

Store builds update through their store, Linux packages through their package manager, and the direct downloads update themselves.

## Run from source

You need Node 20. Nothing else has to be installed.

```bash
git clone https://github.com/pockanoodles/erwin && cd erwin
npm install
npm run dev:local -- --seed demo
```

`dev:local` runs Erwin on PGlite (Postgres compiled to WebAssembly) with no Postgres, Redis or Docker, keeps its database in `.local/`, and prints a link that signs you in. `--seed demo` fills a fresh database with one example week of classes, assignments and goals, and `--reset` starts over.

## Self-host

To use Erwin from several devices, run the server with Postgres.

```bash
cp .env.example .env    # then set NEXTAUTH_SECRET and ERWIN_SECRET_KEY
docker compose up -d
```

Generate each secret with `openssl rand -base64 32`. Open http://localhost:3000, and the first account you create is the admin. `ERWIN_SECRET_KEY` encrypts stored credentials (OAuth tokens, the Canvas token, CalDAV passwords), so keep it with your backups, because losing it means connecting every integration again.

Background sync runs in the `worker` service (BullMQ on Redis). A single container without Redis can set `ERWIN_SCHEDULER=inprocess` instead, which runs the same sync on a timer inside the app.

## Connecting services

**Canvas.** In Settings, open Task Sync and add your Canvas URL with a personal access token (in Canvas, Account, then Settings, then New access token). Erwin keeps only current courses, judged by the term in the course name or an upcoming due date.

**CalDAV** (iCloud, Fastmail, Nextcloud). In Settings, open Accounts, choose Connect CalDAV Calendar, and enter the server URL with an app-specific password.

**Google Calendar** needs your own OAuth app.

1. In the [Google Cloud Console](https://console.cloud.google.com), create a project and enable the Google Calendar API and the Google People API.
2. Configure the OAuth consent screen as External, add the scopes `calendar`, `calendar.events`, `userinfo.email` and `openid` (and `tasks` for Google Tasks), and add yourself as a test user.
3. Create an OAuth client ID of type Web application, with `http://localhost:3000` as an origin and `http://localhost:3000/api/calendar/google` as a redirect URI (and the same pair for your own domain).
4. Enter the client ID and secret in Settings, under System, or set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Outlook** needs an Azure app registration.

1. In the [Azure portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade), register a multitenant app that also allows personal Microsoft accounts.
2. Add a Web platform with the redirect URI `http://localhost:3000/api/auth/callback/azure-ad` (and your own domain's), and enable access and ID tokens.
3. Add the delegated Microsoft Graph permissions `Calendars.ReadWrite`, `Tasks.ReadWrite`, `User.Read` and `offline_access`.
4. Create a client secret and enter the client ID, secret and tenant in Settings, under System.

In the desktop app, Canvas and CalDAV connect today. Google and Outlook sign-in open in your browser, and finishing them inside the desktop app is the next piece of work, so connect those two from a self-hosted server for now.

## How the desktop app works

The desktop app is Electron around the same Next.js server. On launch it opens a PGlite database in the app's data folder, applies the migrations, saves a copy of the database before any migration that changes it, and serves it over the Postgres wire protocol, so the app's Prisma client uses it exactly as it uses Postgres on a server. The server listens on the loopback interface only, signs the one local user in with a token that changes every launch, and runs background sync on a timer. [`DATAFLOW.md`](DATAFLOW.md) lists what leaves your machine and why.

## Development

| Command | What it does |
|---|---|
| `npm run dev:local` | The app on PGlite, nothing else needed |
| `npm run dev` | The app against your own Postgres (`DATABASE_URL`) |
| `npm run test:unit` | Jest |
| `npm run type-check` / `npm run lint` | TypeScript and ESLint |
| `npm run build:desktop` | Builds the server for the desktop app into `desktop/.stage` |
| `npm run desktop:start` | Runs the desktop shell against that build (after `npm --prefix desktop install`) |
| `node scripts/brand-assets.mjs` | Regenerates every icon from `brand/` |

The repository holds the app (`src/`, `prisma/`), the desktop shell (`desktop/`), the landing page (`site/`), the brand (`brand/`, see `brand/BRAND.md`), and the release setup (`packaging/`, whose README is the release runbook).

## Credits

Erwin began as a fork of [FluidCalendar](https://github.com/dotnetfactory/fluid-calendar) by Emad Ibrahim, an open-source alternative to Motion, and keeps its MIT license.

## License

MIT. See [LICENSE](LICENSE).
