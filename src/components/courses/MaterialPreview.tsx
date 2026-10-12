"use client";

import { CanvasHtml, PacketStatus, TaskPacketPane } from "@/components/packet/TaskPacket";
import { kindLabel, openTarget, sizeLabel, statusLabel } from "@/components/packet/material-meta";

import { useResource } from "@/hooks/use-resource";
import { format } from "@/lib/date-utils";

import type { LibraryCourse, LibraryMaterial, MaterialDetail } from "@/types/course-materials";

import type { LibraryRow } from "./library-rows";

/**
 * The library's reading pane: whatever the selected row is, shown in Erwin
 * rather than behind a Canvas login. Pages render their text, PDFs and
 * images render inline from the local copy, and an assignment row shows the
 * same packet the Tasks sheet does.
 */

const INLINE_TYPES = /^(application\/pdf|image\/|text\/plain)/;

function Header({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow: string | null;
  title: string;
  meta?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex-none border-b border-border px-4 py-3">
      {eyebrow ? (
        <div className="mb-1 truncate text-[12px] font-medium tracking-tight text-muted-foreground">{eyebrow}</div>
      ) : null}
      <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">{title}</h2>
      {meta ? <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">{meta}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{actions}</div> : null}
    </div>
  );
}

function ActionLink({ href, children, newTab = true }: { href: string; children: React.ReactNode; newTab?: boolean }) {
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-rust-text"
    >
      {children}
    </a>
  );
}

function Syllabus({ course }: { course: LibraryCourse }) {
  const { data, loading, error } = useResource<{ syllabusHtml: string }>(
    `/api/erwin/courses/${course.id}/syllabus`
  );
  return (
    <>
      <Header eyebrow={course.name} title="Syllabus" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {data ? (
          <CanvasHtml html={data.syllabusHtml} className="max-w-[72ch]" />
        ) : (
          <PacketStatus loading={loading} error={error} />
        )}
      </div>
    </>
  );
}

function Page({ m, moduleName }: { m: LibraryMaterial; moduleName: string | null }) {
  const { data, loading, error } = useResource<MaterialDetail>(`/api/erwin/materials/${m.id}`);
  return (
    <>
      <Header
        eyebrow={moduleName}
        title={m.title}
        actions={m.htmlUrl ? <ActionLink href={m.htmlUrl}>Open in Canvas</ActionLink> : null}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {data ? (
          data.bodyHtml ? (
            <CanvasHtml html={data.bodyHtml} className="max-w-[72ch]" />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {m.locked ? "Locked in Canvas — no text yet." : "This page has no text."}
            </p>
          )
        ) : (
          <PacketStatus loading={loading} error={error} />
        )}
      </div>
    </>
  );
}

function File({ m, moduleName }: { m: LibraryMaterial; moduleName: string | null }) {
  const local = `/api/erwin/materials/${m.id}/file`;
  const status = statusLabel(m);
  const meta = [m.fileName, sizeLabel(m.sizeBytes), status].filter(Boolean).join(" · ");
  const inline = m.cached && m.contentType && INLINE_TYPES.test(m.contentType);
  return (
    <>
      <Header
        eyebrow={moduleName}
        title={m.title}
        meta={meta}
        actions={
          <>
            {m.cached ? <ActionLink href={local}>Open file</ActionLink> : null}
            {m.htmlUrl ? <ActionLink href={m.htmlUrl}>Open in Canvas</ActionLink> : null}
          </>
        }
      />
      {inline ? (
        m.contentType?.startsWith("image/") ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local, auth-gated file, not a static asset */}
            <img src={local} alt={m.title} className="max-w-full" />
          </div>
        ) : (
          <iframe key={m.id} src={local} title={m.title} className="min-h-0 w-full flex-1 border-0" />
        )
      ) : (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          {m.cached
            ? `${kindLabel(m)} files don't preview here — open the file to read it.`
            : m.downloadError
              ? `Erwin couldn't save this file: ${m.downloadError}.`
              : "Not saved locally yet."}
        </p>
      )}
    </>
  );
}

function Assignment({ m, moduleName }: { m: LibraryMaterial; moduleName: string | null }) {
  if (m.task) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TaskPacketPane taskId={m.task.id} source="CANVAS" />
      </div>
    );
  }
  return (
    <>
      <Header
        eyebrow={moduleName}
        title={m.title}
        actions={m.htmlUrl ? <ActionLink href={m.htmlUrl}>Open in Canvas</ActionLink> : null}
      />
      <p className="px-4 py-4 text-[13px] text-muted-foreground">
        Not an Erwin task — ungraded, or outside the current term.
      </p>
    </>
  );
}

function Outbound({ m, moduleName }: { m: LibraryMaterial; moduleName: string | null }) {
  const target = openTarget(m);
  return (
    <>
      <Header
        eyebrow={moduleName}
        title={m.title}
        meta={m.kind === "EXTERNAL_TOOL" ? "A tool that runs inside Canvas" : m.htmlUrl}
        actions={target ? <ActionLink href={target.href}>{m.kind === "EXTERNAL_TOOL" ? "Open in Canvas" : "Open link"}</ActionLink> : null}
      />
      <p className="px-4 py-4 text-[13px] text-muted-foreground">
        {m.kind === "EXTERNAL_TOOL"
          ? "Publisher tools only open through Canvas, so Erwin can't mirror them."
          : "An outside link — nothing to mirror."}
      </p>
    </>
  );
}

export function MaterialPreview({ course, row }: { course: LibraryCourse; row: LibraryRow | null }) {
  if (!row || (row.type !== "syllabus" && row.type !== "item")) {
    return <p className="p-4 text-[13px] text-muted-foreground">Select a row to read it here.</p>;
  }
  if (row.type === "syllabus") return <Syllabus course={course} />;

  const { material: m, moduleName } = row;
  switch (m.kind) {
    case "PAGE":
      return <Page key={m.id} m={m} moduleName={moduleName} />;
    case "FILE":
      return <File m={m} moduleName={moduleName} />;
    case "ASSIGNMENT":
    case "QUIZ":
    case "DISCUSSION":
      return <Assignment m={m} moduleName={moduleName} />;
    default:
      return <Outbound m={m} moduleName={moduleName} />;
  }
}

export function dueLabel(m: LibraryMaterial): string | null {
  const due = m.task?.dueDate ?? m.nextTask?.dueDate;
  return due ? format(new Date(due), "MMM d") : null;
}
