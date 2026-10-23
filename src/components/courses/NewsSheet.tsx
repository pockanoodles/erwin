"use client";

import { useEffect, useMemo, useState } from "react";

import { HiSearch } from "react-icons/hi";

import { CanvasHtml } from "@/components/packet/TaskPacket";
import { Input } from "@/components/ui/input";

import { useResource } from "@/hooks/use-resource";
import { format, isToday } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { useCourseActivityStore } from "@/store/courseActivity";

import type { NewsItem } from "@/types/course-activity";

import { courseTab } from "./course-tab";
import { SEEN_DWELL_MS } from "./LibrarySheet";
import {
  FilterStrip,
  HEAD,
  ROW,
  SheetLayout,
  StripCount,
  StripToggle,
  Tag,
  UnseenPip,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "./sheet";

/**
 * News: what instructors said — announcements and Canvas Inbox threads,
 * newest first, read in full in the pane (an exam's format, a room change,
 * a deadline the syllabus got wrong).
 */
export function NewsSheet({
  courseKey,
  selected,
  onSelect,
}: {
  /** One course's id, or null for every course. */
  courseKey: string | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data, loading, error } = useResource<NewsItem[]>(
    courseKey ? `/api/erwin/news?courseId=${courseKey}` : "/api/erwin/news"
  );
  const markSeen = useCourseActivityStore((s) => s.markSeen);
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data ?? [];
    if (!q) return all;
    return all.filter((n) =>
      [n.title, n.author, n.type === "announcement" ? n.bodyHtml : n.messages.map((m) => m.body).join(" ")]
        .some((s) => s?.toLowerCase().includes(q))
    );
  }, [data, query]);

  const selectedIndex = selected ? items.findIndex((n) => n.id === selected) : -1;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : items.length ? 0 : -1;
  const active = activeIndex >= 0 ? items[activeIndex] : null;
  useScrollActiveIntoView([activeIndex, courseKey]);

  // Only a post you picked counts as read, not the one the sheet opens on.
  useEffect(() => {
    if (!active?.unseen || selectedIndex < 0) return;
    const t = setTimeout(
      () => void markSeen(active.type === "announcement" ? { announcementId: active.id } : { conversationId: active.id }),
      SEEN_DWELL_MS
    );
    return () => clearTimeout(t);
  }, [active, selectedIndex, markSeen]);

  const onKeyDown = sheetKeyHandler({
    count: items.length,
    active: activeIndex,
    isSelectable: () => true,
    select: (i) => onSelect(items[i].id),
    open: () => {
      if (active?.type === "announcement" && active.htmlUrl) window.open(active.htmlUrl, "_blank", "noopener,noreferrer");
    },
  });

  const unseen = (data ?? []).filter((n) => n.unseen).length;
  const examOnly = query.trim().toLowerCase() === "exam";

  return (
    <>
      <FilterStrip>
        <div className="relative">
          <HiSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts…"
            className="h-8 w-64 pl-8"
          />
        </div>
        <StripToggle
          pressed={examOnly}
          onClick={() => setQuery(examOnly ? "" : "exam")}
          title="Posts that mention an exam: format, room, what to bring"
        >
          Exam posts
        </StripToggle>
        <StripCount>
          {unseen} unseen · {items.length} shown
        </StripCount>
      </FilterStrip>
      <SheetLayout
        label="Announcements and messages"
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <table className="w-full min-w-[600px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 56 }} />
              <col />
              <col style={{ width: 128 }} />
              {!courseKey ? <col style={{ width: 76 }} /> : null}
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(ROW, HEAD, "left-0 z-30 text-right")}>#</th>
                <th scope="col" className={cn(ROW, HEAD)}>Kind</th>
                <th scope="col" className={cn(ROW, HEAD)}>Title</th>
                <th scope="col" className={cn(ROW, HEAD)}>From</th>
                {!courseKey ? <th scope="col" className={cn(ROW, HEAD)}>Course</th> : null}
                <th scope="col" className={cn(ROW, HEAD, "border-r-0")}>Posted</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[13px] text-muted-foreground">
                    {error ?? (loading ? "Loading…" : query ? "Nothing matches." : "No announcements or messages yet.")}
                  </td>
                </tr>
              ) : (
                items.map((n, i) => {
                  const isActive = i === activeIndex;
                  const cell = cellClass(isActive);
                  const at = new Date(n.at);
                  return (
                    <tr key={n.id} data-active-row={isActive || undefined} onClick={() => onSelect(n.id)} className="group cursor-cell">
                      <td className={gutterClass(isActive)}>{i + 1}</td>
                      <td className={cell}>
                        <Tag>{n.type === "announcement" ? "News" : "Inbox"}</Tag>
                      </td>
                      <td className={cn(cell, titleCellClass(isActive), "text-foreground")} title={n.title}>
                        <span className="flex items-center gap-1.5 truncate">
                          {n.unseen ? <UnseenPip /> : null}
                          <span className={cn("truncate", n.unseen && "font-medium")}>{n.title}</span>
                        </span>
                      </td>
                      <td className={cn(cell, "text-muted-foreground")}>{n.author}</td>
                      {!courseKey ? (
                        <td className={cn(cell, "font-mono text-[11px] text-muted-foreground")}>{courseTab(n.course)}</td>
                      ) : null}
                      <td className={cn(cell, "border-r-0 tabular-nums text-muted-foreground")}>
                        {isToday(at) ? format(at, "h:mm a") : format(at, "MMM d")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        }
        pane={active ? <NewsPreview key={active.id} item={active} /> : <p className="p-4 text-[13px] text-muted-foreground">Select a post to read it here.</p>}
      />
    </>
  );
}

/** One announcement or inbox thread in full. */
export function NewsPreview({ item }: { item: NewsItem }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none border-b border-border px-4 py-3">
        <div className="mb-1 truncate text-[12px] font-medium tracking-tight text-muted-foreground">
          {courseTab(item.course)} · {item.type === "announcement" ? "Announcement" : "Canvas Inbox"}
        </div>
        <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">{item.title}</h2>
        <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
          {[item.author, format(new Date(item.at), "EEE MMM d, p")].filter(Boolean).join(" · ")}
        </p>
        {item.type === "announcement" && item.htmlUrl ? (
          <a
            href={item.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[13px] text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-rust-text"
          >
            Open in Canvas
          </a>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {item.type === "announcement" ? (
          item.bodyHtml ? (
            <CanvasHtml html={item.bodyHtml} className="max-w-[72ch]" />
          ) : (
            <p className="text-[13px] text-muted-foreground">No text.</p>
          )
        ) : (
          <ul className="max-w-[72ch] space-y-4">
            {item.messages.map((m) => (
              <li key={m.id} className="border-t border-border pt-2">
                <p className="mb-1 text-[12px] text-muted-foreground">
                  {m.mine ? "You" : (m.author ?? "Canvas Inbox")} · {format(new Date(m.createdAt), "MMM d, p")}
                </p>
                <p className="whitespace-pre-wrap text-[14px] text-foreground">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
