# Where Erwin's data goes

Erwin is a personal calendar and task assistant. It runs on one laptop, stores
everything in a Postgres database on that same laptop, and talks to a handful of
outside services to fetch your schedule and coursework.

This document is the plain-language answer to three questions: **what leaves
this machine, where does it go, and why.** It is written to be read by someone
who does not work on the code. It is kept by hand, so if you change how Erwin
talks to the outside world, change this file in the same commit.

Last verified against the code on **2026-09-09**.

---

## The short version

| Service | What Erwin sends it | Can it change anything there? | Why |
| --- | --- | --- | --- |
| **Canvas** (your university's LMS) | Nothing but your access token | **No — read only** | Import assignments and grade weights |
| **Google** (Calendar + Tasks) | Event and task titles, notes, times | **Yes** | Two-way calendar and task sync |
| **Microsoft** (Outlook + To Do) | Event and task titles, notes, times | **Yes** | Two-way calendar and task sync |
| **A CalDAV server** (e.g. Fastmail, iCloud) | Event titles, descriptions, locations, times | **Yes** | Two-way calendar sync |
| **Resend** (email delivery) | Your email address and a reset link | Sends one email | Password reset |

There is **no analytics, no crash reporting, no telemetry, and no AI service**
of any kind. That is not a policy statement — it is a fact about the
dependencies. Erwin ships no LLM client library, so nothing you type is sent to
a model. The "assistant" behaviour — daily briefings, the focus queue, task
ranking — is ordinary arithmetic running locally on your own machine.

---

## Canvas — reads only, sends nothing

Erwin asks Canvas for your active courses, their assignment groups, and their
assignments. It sends **only the access token** needed to prove it's you, plus
the address of the page it wants. No task you write in Erwin, no note, and no
personal detail is ever sent to Canvas — not even your email address.

Canvas cannot be changed by Erwin. Every request is a read; the code has no
ability to create, edit, or delete anything in Canvas. If you mark an
assignment complete in Erwin, that stays in Erwin.

The Canvas address is whatever you enter in settings (for this install,
Northeastern's). Assignments come back and are written into the local database
as tasks.

## Google and Microsoft — genuine two-way sync

These two work the same way, so they get one description.

You sign in through the service's own consent screen, and Erwin is granted
access to your calendar and task list. From then on it can both read and
**write**. Specifically, Erwin can create a calendar event, change one, delete
one, and do the same for a task in Google Tasks or Microsoft To Do. It cannot
create or delete whole calendars or task lists.

When Erwin writes an event or task, what travels is the content itself: the
**title**, the **description or notes**, the **location**, the start and end
times, your time zone, and any repeat rule. If you keep something private in a
task's notes and that task syncs, those notes are stored on Google's or
Microsoft's servers.

Erwin also asks each service for your account's email address once, when you
connect it, so it can label the connection in the interface. It does not send
other people's email addresses: when Erwin writes an event, it does not attach
a guest list.

## A CalDAV server — two-way sync with a server you choose

CalDAV is the open standard behind Fastmail, iCloud Calendar and others. You
supply the server address, a username, and a password.

Erwin reads your calendars and writes to them: it can add an event, change one,
and delete one. What travels is a standard calendar file containing the event's
**title, description, location**, times and repeat rules.

Two things worth knowing. First, unlike the services above, CalDAV uses a plain
**username and password on every single request**, not a revocable token — so
that password is held on this machine and transmitted (over HTTPS) constantly.
Second, if you did not supply a separate CalDAV username, Erwin falls back to
using **your email address** as the username. That address therefore goes to
your own CalDAV provider — which is a service you chose and already have an
account with, not a third party.

## Resend — one email, only when you ask for it

The single outbound email path is a password reset. When you request one, Erwin
asks Resend to deliver a message to **your email address** containing a link
with a one-time reset token.

Nothing else is emailed. There are notification preferences in the database
that look like they might send more (daily summaries, for instance), but no
code sends them today.

---

## What never leaves this machine

- Your task list, notes, and due dates — unless a task is explicitly synced to
  Google or Microsoft, in which case that task's content goes there.
- Everything Erwin derives about you: the focus queue, daily briefings, task
  rankings, skip history, XP and goal progress. All computed locally.
- Your goals. These live in a separate plain-text vault on this machine and are
  pushed *into* Erwin by a local script. They never go outward.
- Logs. Erwin writes its own logs to a table in the local database.

---

## Where the keys are kept

All credentials live in the local Postgres database: OAuth tokens for Google and
Microsoft, your Canvas token, your CalDAV password, and the API key for Resend.

**They are encrypted.** Each value is sealed with AES-256-GCM before it is
written, using a key held outside the database in the environment
(`ERWIN_SECRET_KEY`). Encryption is authenticated, which means a value altered
in the database will refuse to decrypt rather than quietly turn into a broken
credential that then gets sent to Google.

Be clear about what that does and does not buy:

- **It protects a copy of the database** — a `pg_dump`, a Time Machine
  snapshot, a stray backup, another process reading the tables. That is the
  realistic way these values would escape this laptop.
- **It does not protect against anything running as you on this machine**,
  which can read the key out of the environment just as easily as the database.
  Closing that gap means moving the key into the macOS Keychain, which is a
  separate change and not done yet.

Two practical consequences of the key living outside the database: **lose the
key and every stored credential becomes unreadable** — you would have to
reconnect each integration by hand. **Change the key** and the values have to
be re-encrypted while the old key is still available.

One remaining oddity inherited from the upstream project, worth fixing on its
own: **a password hash is stored in a field meant for something else.** Local
account passwords are hashed correctly, then written into a database column
intended to hold an OAuth identity token. It works, but it misleads anyone
reading the schema — and it is the reason that column is deliberately left out
of the encryption above, since a hash needs no encrypting and doing it would
cement the mistake.

Also worth noting: when a CalDAV connection succeeds or fails, the server
address and username are written to the local log table. That is local, and no
password is logged, but it means those values appear in logs as well as in the
accounts table — and unlike the accounts table, the log is not encrypted.

---

## Known gaps

Kept here so they are not rediscovered from scratch later.

- **External calls are supposed to go through one module per service.** Canvas
  follows this cleanly. Google, Microsoft and CalDAV do not — each has at least
  one place that reaches out directly instead, and CalDAV has three competing
  ways of talking to the same server. This makes "what exactly do we send?"
  harder to answer than it should be, which is the reason the rule exists.
- **Unused libraries that could send data if wired up.** A payment library and a
  Microsoft authentication library are installed but called by nothing. They are
  not egress today; they are loaded guns on the shelf and should be removed.
- **Dormant webhook fields.** The database has columns for registering a Google
  Calendar push channel, but no code registers one, so Google never calls in.
