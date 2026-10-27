"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  ChoiceChip,
  DeleteButton,
  Field,
  JobDot,
  PaneSection,
  ReachLinks,
} from "@/modules/work/components/parts";
import { useWorkStore } from "@/modules/work/store";
import type { ContactInput, ContactRow, JobRow } from "@/modules/work/types";

const FIELDS = [
  { key: "name", label: "Name", placeholder: "Jamie Ortiz" },
  { key: "role", label: "Role", placeholder: "Shift supervisor" },
  { key: "phone", label: "Phone", placeholder: "(555) 010-0199" },
  { key: "email", label: "Email", placeholder: "jamie@example.com" },
] as const;

type Draft = Record<(typeof FIELDS)[number]["key"] | "notes", string>;

function draftOf(c: ContactRow | null): Draft {
  return {
    name: c?.name ?? "",
    role: c?.role ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    notes: c?.notes ?? "",
  };
}

/** What a draft saves as, so "changed?" compares what would be stored. */
function inputOf(d: Draft): ContactInput & { name: string } {
  const orNull = (v: string) => v.trim() || null;
  return {
    name: d.name.trim(),
    role: orNull(d.role),
    phone: orNull(d.phone),
    email: orNull(d.email),
    notes: orNull(d.notes),
  };
}

function ContactFields({
  draft,
  onChange,
  autoFocus,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {FIELDS.map((f, i) => (
        <Field key={f.key} id={`contact-${f.key}`} label={f.label}>
          <Input
            id={`contact-${f.key}`}
            value={draft[f.key]}
            autoFocus={autoFocus && i === 0}
            placeholder={f.placeholder}
            inputMode={
              f.key === "phone" ? "tel" : f.key === "email" ? "email" : "text"
            }
            onChange={(e) => onChange({ ...draft, [f.key]: e.target.value })}
            autoComplete="off"
          />
        </Field>
      ))}
      <Field id="contact-notes" label="Notes">
        <Textarea
          id="contact-notes"
          value={draft.notes}
          rows={3}
          placeholder="Text before 10 PM, call after"
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

/**
 * One contact, whole: how to reach them, and their details. One added by
 * hand can be changed and deleted; one from a roster import is read here
 * only, since the next import replaces it.
 */
export function ContactPane({
  contact,
  job,
}: {
  contact: ContactRow;
  job?: JobRow;
}) {
  const updateContact = useWorkStore((s) => s.updateContact);
  const deleteContact = useWorkStore((s) => s.deleteContact);
  const [draft, setDraft] = useState<Draft>(() => draftOf(contact));
  const [saving, setSaving] = useState(false);

  const baseKey = JSON.stringify(draftOf(contact));
  useEffect(() => {
    setDraft(JSON.parse(baseKey) as Draft);
  }, [baseKey]);

  const dirty = useMemo(
    () =>
      JSON.stringify(inputOf(draft)) !==
      JSON.stringify(inputOf(draftOf(contact))),
    [draft, contact]
  );

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("A contact needs a name.");
      return;
    }
    setSaving(true);
    const saved = await updateContact(contact.id, inputOf(draft));
    setSaving(false);
    if (!saved) toast.error("Couldn't save. Try again.");
  };

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1">
        <h2 className="er-display text-lg text-foreground">{contact.name}</h2>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {job ? (
            <>
              <JobDot color={job.color} />
              <span>{job.name}</span>
            </>
          ) : null}
          {contact.role ? <span>· {contact.role}</span> : null}
        </p>
        <ReachLinks contact={contact} className="pt-1" />
      </div>

      {contact.imported ? (
        <PaneSection label="From the roster">
          <p className="text-sm text-muted-foreground">
            The next roster import replaces it, so change it in the roster.
          </p>
          {contact.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {contact.notes}
            </p>
          ) : null}
        </PaneSection>
      ) : (
        <>
          <PaneSection label="Details">
            <ContactFields draft={draft} onChange={setDraft} />
            <div className="pt-2">
              <Button
                variant="secondary"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                Save changes
              </Button>
            </div>
          </PaneSection>
          <PaneSection label="Delete">
            <p className="text-sm text-muted-foreground">
              Shifts that name them keep the name, without a number to call.
            </p>
            <DeleteButton
              onDelete={async () => {
                if (!(await deleteContact(contact.id))) {
                  toast.error("Couldn't delete it. Try again.");
                }
              }}
            />
          </PaneSection>
        </>
      )}
    </div>
  );
}

/** A contact added by hand, held here until it's saved. */
export function NewContactPane({ jobs }: { jobs: JobRow[] }) {
  const addContact = useWorkStore((s) => s.addContact);
  const select = useWorkStore((s) => s.select);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft>(() => draftOf(null));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("A contact needs a name.");
      return;
    }
    setSaving(true);
    const saved = await addContact(jobId, inputOf(draft));
    setSaving(false);
    if (!saved) toast.error("Couldn't add them. Try again.");
  };

  return (
    <div className="space-y-6 p-5">
      <h2 className="er-display text-lg text-foreground">New contact</h2>
      <PaneSection label="Who">
        <div className="grid gap-3">
          {jobs.length > 1 ? (
            <Field label="Job">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {jobs.map((j) => (
                  <ChoiceChip
                    key={j.id}
                    on={j.id === jobId}
                    onClick={() => setJobId(j.id)}
                  >
                    <JobDot color={j.color} />
                    {j.name}
                  </ChoiceChip>
                ))}
              </div>
            </Field>
          ) : null}
          <ContactFields draft={draft} onChange={setDraft} autoFocus />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button disabled={saving || !jobId} onClick={() => void save()}>
            Add
          </Button>
          <Button variant="quiet" onClick={() => select(null)}>
            Cancel
          </Button>
        </div>
      </PaneSection>
    </div>
  );
}
