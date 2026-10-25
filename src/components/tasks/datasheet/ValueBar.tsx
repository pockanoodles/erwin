"use client";

import { useEffect, useRef, useState } from "react";

import {
  HiCheck,
  HiChevronDown,
  HiChevronUp,
  HiX,
} from "react-icons/hi";

import { cn } from "@/lib/utils";

import { Task } from "@/types/task";

import type { TaskColumn, TaskPatch } from "./columns";

/**
 * Excel's formula bar, and it's here for exactly Excel's reason: a cell is one
 * line tall and the value usually isn't. A task title runs sixty characters
 * and the column is forty, so the sheet truncates and the only way to read the
 * rest was to open the task. The bar always shows the selected cell in full,
 * and — since it already has the value — it's also where you change it.
 *
 * Editing happens only here, never inside the cell. A 26px row can't hold a
 * date picker or a select without either growing (and breaking the grid's one
 * useful property, that every row is the same height) or opening a popover
 * over the data you're reading. One editor, one place, always the same size.
 */

interface ValueBarProps {
  /** The selected row's task, or null when the sheet is empty. */
  task: Task | null;
  /** 1-based, as shown in the row gutter. */
  rowNumber: number | null;
  /** Replaces "R<n>" for a row a module pinned (Ladder's bosses: "⚔"). */
  rowLabel?: string;
  /** A pinned row that isn't a task (an unbound boss): the cell's value, read-only. */
  readonlyText?: string;
  column: TaskColumn | null;
  onCommit: (patch: TaskPatch) => void;
  /** Called after a successful commit so the grid can advance a row. */
  onCommitted?: () => void;
}

export function ValueBar({
  task,
  rowNumber,
  rowLabel,
  readonlyText,
  column,
  onCommit,
  onCommitted,
}: ValueBarProps) {
  const editable = Boolean(task && column && column.editor.kind !== "readonly");
  const committed = task && column ? column.formValue(task) : "";

  const [draft, setDraft] = useState(committed);
  const [rejected, setRejected] = useState(false);
  /** Excel's formula-bar chevron: drop the field to several lines. */
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(null);

  const isText = column?.editor.kind === "text";

  // Selecting a different cell abandons whatever was half-typed in the old
  // one, the same way clicking away in a spreadsheet does.
  useEffect(() => {
    setDraft(committed);
    setRejected(false);
  }, [committed, task?.id, column?.id]);

  const dirty = draft !== committed;

  const save = () => {
    if (!task || !column?.commit) return;
    const patch = column.commit(draft, task);
    if (!patch) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onCommit(patch);
    onCommitted?.();
  };

  const revert = () => {
    setDraft(committed);
    setRejected(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // The bar is a sibling of the grid's scroll container, not a descendant,
    // so nothing here would reach the grid's own onKeyDown anyway. Kept so the
    // bar stays safe to move inside the grid later.
    e.stopPropagation();
    if (e.key === "Enter" && !(expanded && e.shiftKey)) {
      // Shift+Enter is a newline once the field is expanded, Enter commits —
      // the same split every multi-line editor uses.
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      revert();
      inputRef.current?.blur();
    }
  };

  const fieldClass = cn(
    "h-6 min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-foreground",
    "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0",
    rejected && "text-destructive"
  );

  return (
    <div
      className={cn(
        "flex flex-none gap-2 border-b border-border bg-background px-2 py-1.5",
        expanded && isText ? "items-start" : "min-h-9 items-center"
      )}
    >
      {/* Excel's name box: which cell you're standing on. Row number matches
          the gutter, the column is named rather than lettered — "R7 · Due
          date" tells you what you're editing; "D7" makes you count. */}
      <span className="flex h-6 w-40 flex-none items-center gap-1.5 truncate border border-border px-2 font-mono text-[11px] uppercase tracking-wide">
        {rowNumber != null || rowLabel ? (
          <>
            <span className="text-muted-foreground">{rowLabel ?? `R${rowNumber}`}</span>
            <span aria-hidden className="text-border">
              |
            </span>
            <span className="truncate text-foreground">{column?.label}</span>
          </>
        ) : (
          <span className="text-muted-foreground/50">No selection</span>
        )}
      </span>

      <span aria-hidden className="flex-none font-mono text-xs italic text-muted-foreground">
        fx
      </span>

      <div
        className={cn(
          "flex min-w-0 flex-1 gap-2 border border-border px-2 py-1 focus-within:border-rust",
          expanded && isText ? "items-start" : "items-center"
        )}
      >
        {readonlyText !== undefined && !task ? (
          <span className="truncate text-[13px] text-muted-foreground">
            {readonlyText || "—"}
          </span>
        ) : !task || !column ? (
          <span className="text-[13px] text-muted-foreground/50">
            Select a cell
          </span>
        ) : !editable ? (
          // Derived columns still show their full value — the point of the bar
          // is reading as much as writing.
          <span className="truncate text-[13px] text-muted-foreground">
            {column.text(task) || "—"}
          </span>
        ) : isText && expanded ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            data-value-bar-input
            rows={4}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setRejected(false);
            }}
            onKeyDown={onKeyDown}
            aria-label={`${column.label} value`}
            aria-invalid={rejected || undefined}
            className={cn(fieldClass, "h-auto resize-none leading-snug")}
          />
        ) : column.editor.kind === "enum" ? (
          // Sized to its own content rather than stretched across the bar — a
          // full-width select with one word in it reads as a broken text field.
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            data-value-bar-input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`${column.label} value`}
            className={cn(fieldClass, "w-auto max-w-xs flex-none cursor-pointer pr-6")}
          >
            {column.editor.options().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            data-value-bar-input
            type={
              column.editor.kind === "date"
                ? "date"
                : column.editor.kind === "number"
                  ? "number"
                  : "text"
            }
            value={draft}
            min={column.editor.kind === "number" ? 1 : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              setRejected(false);
            }}
            onKeyDown={onKeyDown}
            aria-label={`${column.label} value`}
            aria-invalid={rejected || undefined}
            className={fieldClass}
          />
        )}

        {column?.editor.kind === "number" ? (
          <span className="flex-none font-mono text-[11px] text-muted-foreground">
            {column.editor.unit}
          </span>
        ) : null}
      </div>

      <div className="flex flex-none items-center gap-1">
        {/* Only while there's something to accept — a bar full of dead buttons
            reads as broken. Enter and Escape do the same thing. */}
        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-150",
            dirty && editable ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <button
            type="button"
            onClick={save}
            title="Commit (Enter)"
            aria-label="Commit"
            className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <HiCheck className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={revert}
            title="Revert (Esc)"
            aria-label="Revert"
            className="flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-destructive"
          >
            <HiX className="h-4 w-4" />
          </button>
        </div>

        {/* The chevron at the end of Excel's formula bar. Only text columns
            can use the room; a date input doesn't get taller. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          disabled={!isText}
          title={expanded ? "Collapse field" : "Expand field"}
          aria-label={expanded ? "Collapse field" : "Expand field"}
          aria-expanded={expanded}
          className={cn(
            "flex h-6 w-6 items-center justify-center transition-colors duration-150",
            isText
              ? "text-muted-foreground hover:text-foreground"
              : "text-muted-foreground/25"
          )}
        >
          {expanded ? (
            <HiChevronUp className="h-4 w-4" />
          ) : (
            <HiChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
