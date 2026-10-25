"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { cn } from "@/lib/utils";

import {
  CADENCE_CHOICES,
  agoLabel,
  cadenceLabel,
  dueLabel,
} from "@/modules/people/cadence";
import { usePeopleStore } from "@/modules/people/store";
import type { PersonInput, PersonRow } from "@/modules/people/types";

const KINDS = [
  { id: "message", label: "Message" },
  { id: "call", label: "Call" },
  { id: "meeting", label: "Meeting" },
  { id: "email", label: "Email" },
] as const;

const KIND_NAMES: Record<string, string> = {
  message: "Message",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  done: "Reached out",
};

const FIELDS = [
  { key: "name", label: "Name" },
  { key: "org", label: "Org" },
  { key: "role", label: "Role" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "link", label: "Link" },
] as const;

type Draft = Record<(typeof FIELDS)[number]["key"] | "notes", string> & {
  cadenceDays: number | null;
};

function draftOf(p: PersonRow | null): Draft {
  return {
    name: p?.name ?? "",
    org: p?.org ?? "",
    role: p?.role ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    link: p?.link ?? "",
    notes: p?.notes ?? "",
    cadenceDays: p?.cadenceDays ?? null,
  };
}

/**
 * One person, whole: when you're next due to talk, a form to log the
 * conversation you just had, the history, and their details. With no person
 * it's the form for someone new, held here until it's saved.
 */
export function PersonPane({ person }: { person: PersonRow | null }) {
  const create = usePeopleStore((s) => s.create);
  const update = usePeopleStore((s) => s.update);
  const select = usePeopleStore((s) => s.select);
  const [draft, setDraft] = useState<Draft>(() => draftOf(person));
  const [saving, setSaving] = useState(false);

  // Saved values that change (a save, a reload) replace the draft; a reload
  // that changes nothing editable, like logging a conversation, leaves
  // unsaved edits alone.
  const baseKey = JSON.stringify(draftOf(person));
  useEffect(() => {
    setDraft(JSON.parse(baseKey) as Draft);
  }, [baseKey]);

  const dirty = useMemo(() => {
    const base = draftOf(person);
    return (Object.keys(base) as (keyof Draft)[]).some(
      (k) => base[k] !== draft[k]
    );
  }, [draft, person]);

  const input = (): PersonInput & { name: string } => ({
    name: draft.name.trim(),
    org: draft.org,
    role: draft.role,
    email: draft.email,
    phone: draft.phone,
    link: draft.link,
    notes: draft.notes,
    cadenceDays: draft.cadenceDays,
  });

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("A person needs a name.");
      return;
    }
    setSaving(true);
    const saved = person
      ? await update(person.id, input())
      : await create(input());
    setSaving(false);
    if (!saved) toast.error("Couldn't save. Try again.");
  };

  const now = new Date();
  const next = person?.nextCheckIn ? new Date(person.nextCheckIn) : null;

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">
          {person ? person.name : "New person"}
        </h2>
        {person && (person.org || person.role) ? (
          <p className="text-sm text-muted-foreground">
            {[person.role, person.org].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {person ? (
          <p className="text-sm text-foreground">
            {person.cadenceDays
              ? `Every ${cadenceLabel(person.cadenceDays)}. Next check-in ${dueLabel(next, now)}.`
              : "No cadence, so Erwin won't remind you."}{" "}
            <span className="text-muted-foreground">
              Last talked{" "}
              {agoLabel(
                person.lastContactAt ? new Date(person.lastContactAt) : null,
                now
              )}
              .
            </span>
          </p>
        ) : null}
      </div>

      {person && !person.archived ? (
        <LogConversation personId={person.id} />
      ) : null}
      {person ? <History personId={person.id} /> : null}

      <PaneSection label={person ? "Details" : "Who"}>
        <div className="grid gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={`person-${f.key}`}>{f.label}</Label>
              <Input
                id={`person-${f.key}`}
                value={draft[f.key]}
                autoFocus={!person && f.key === "name"}
                onChange={(e) =>
                  setDraft({ ...draft, [f.key]: e.target.value })
                }
                autoComplete="off"
              />
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label>Check in every</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[null, ...CADENCE_CHOICES].map((days) => (
                <button
                  key={days ?? "none"}
                  type="button"
                  onClick={() => setDraft({ ...draft, cadenceDays: days })}
                  className={cn(
                    "h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150",
                    draft.cadenceDays === days
                      ? "er-brackets text-foreground [--bracket:var(--er-ink)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {days ? cadenceLabel(days) : "Never"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-notes">Notes</Label>
            <Textarea
              id="person-notes"
              value={draft.notes}
              rows={4}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {person ? (
            <Button
              variant="secondary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              Save changes
            </Button>
          ) : (
            <>
              <Button disabled={saving} onClick={() => void save()}>
                Add
              </Button>
              <Button variant="quiet" onClick={() => select(null)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </PaneSection>

      {person ? (
        <PaneSection label={person.archived ? "Archived" : "Archive"}>
          <p className="text-sm text-muted-foreground">
            {person.archived
              ? "Archived people keep their history and get no reminders."
              : "Archiving keeps their history and stops the reminders."}
          </p>
          <Button
            variant="quiet"
            onClick={async () => {
              if (!(await update(person.id, { archived: !person.archived }))) {
                toast.error("Couldn't change that. Try again.");
              } else if (!person.archived) {
                select(null);
              }
            }}
          >
            {person.archived ? "Restore" : "Archive"}
          </Button>
        </PaneSection>
      ) : null}
    </div>
  );
}

function LogConversation({ personId }: { personId: string }) {
  const log = usePeopleStore((s) => s.log);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("message");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await log(personId, { kind, note: note.trim() || null });
    setBusy(false);
    if (ok) {
      setNote("");
      toast.success("Logged. The next check-in is planned from today.");
    } else {
      toast.error("Couldn't log it. Try again.");
    }
  };

  return (
    <PaneSection label="Log a conversation">
      <div className="flex flex-wrap gap-1.5 pt-1">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={cn(
              "h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150",
              kind === k.id
                ? "er-brackets text-foreground [--bracket:var(--er-ink)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <Textarea
        aria-label="What you talked about"
        placeholder="What you talked about (optional)"
        value={note}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button disabled={busy} onClick={() => void submit()}>
        Log it
      </Button>
    </PaneSection>
  );
}

function History({ personId }: { personId: string }) {
  const interactions = usePeopleStore((s) => s.interactions[personId]);
  const loadInteractions = usePeopleStore((s) => s.loadInteractions);

  useEffect(() => {
    void loadInteractions(personId);
  }, [loadInteractions, personId]);

  return (
    <PaneSection label="History">
      {!interactions ? null : interactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {interactions.map((i) => (
            <li key={i.id} className="text-sm">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {new Date(i.at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {KIND_NAMES[i.kind] ?? i.kind}
              </p>
              {i.note ? (
                <p className="mt-0.5 whitespace-pre-wrap text-foreground">
                  {i.note}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </PaneSection>
  );
}

function PaneSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-t border-border pt-4">
      <h3 className="er-label">{label}</h3>
      {children}
    </section>
  );
}
