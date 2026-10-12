"use client";

import { useEffect, useState } from "react";

import { HiCheck, HiOutlineTrash } from "react-icons/hi";

import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import { type Task, TaskStatus } from "@/types/task";

import type { TaskPatch } from "../datasheet/columns";

interface TaskRowSubtasksProps {
  parent: Task;
  subtasks: Task[];
  onPatch: (patch: TaskPatch) => Promise<void> | void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void> | void;
  onCreateSubtask: (parentId: string, title: string) => Promise<void>;
  onDelete: (taskId: string) => void;
}

/**
 * Compact nested checklist under an expanded TaskRow. Completing a child
 * does not complete the parent (especially Canvas assignments). Canvas
 * parents still accept local skipSync children; sync never creates these.
 */
export function TaskRowSubtasks({
  parent,
  subtasks,
  onPatch,
  onStatusChange,
  onCreateSubtask,
  onDelete,
}: TaskRowSubtasksProps) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const done = subtasks.filter(
    (child) => child.status === TaskStatus.COMPLETED
  ).length;
  const total = subtasks.length;
  const progress = total === 0 ? 0 : done / total;

  const submit = async () => {
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await onCreateSubtask(parent.id, title);
      setDraft("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="pb-2">
      {total > 0 && (
        <div className="mb-1 mr-3 h-px bg-border">
          <div
            className="h-px bg-rust transition-[width] duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      <ul>
        {subtasks.map((child) => (
          <SubtaskRow
            key={child.id}
            task={child}
            onPatch={onPatch}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
          />
        ))}
      </ul>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="Add subtask"
        disabled={adding}
        className="h-11 rounded-none border-0 bg-transparent px-0 shadow-none placeholder:font-mono placeholder:text-[11px] placeholder:uppercase placeholder:tracking-wide focus-visible:ring-0"
      />
    </div>
  );
}

interface SubtaskRowProps {
  task: Task;
  onPatch: (patch: TaskPatch) => Promise<void> | void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void> | void;
  onDelete: (taskId: string) => void;
}

function SubtaskRow({
  task,
  onPatch,
  onStatusChange,
  onDelete,
}: SubtaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const isCompleted = task.status === TaskStatus.COMPLETED;

  useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  const saveTitle = () => {
    const next = draftTitle.trim();
    if (!next || next === task.title) {
      setDraftTitle(task.title);
      setEditing(false);
      return;
    }
    void onPatch({ ...task, title: next });
    setEditing(false);
  };

  return (
    <li className="group flex items-center">
      <button
        type="button"
        onClick={() =>
          void onStatusChange(
            task.id,
            isCompleted ? TaskStatus.TODO : TaskStatus.COMPLETED
          )
        }
        aria-label={isCompleted ? "Mark as todo" : "Mark complete"}
        className="flex h-11 w-11 flex-none items-center justify-center"
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center border transition-colors duration-150",
            isCompleted
              ? "border-foreground bg-foreground text-background"
              : "border-muted-foreground/50"
          )}
        >
          {isCompleted && <HiCheck className="h-3 w-3" />}
        </span>
      </button>
      {editing ? (
        <Input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveTitle();
            }
            if (event.key === "Escape") {
              setDraftTitle(task.title);
              setEditing(false);
            }
          }}
          autoFocus
          className="h-11 rounded-none border-0 px-0 shadow-none focus-visible:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "min-w-0 flex-1 py-2 text-left text-sm leading-snug",
            isCompleted
              ? "text-muted-foreground line-through"
              : "text-foreground"
          )}
        >
          {task.title}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label="Delete subtask"
        className="flex h-11 w-11 flex-none items-center justify-center text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100"
      >
        <HiOutlineTrash className="h-4 w-4" />
      </button>
    </li>
  );
}
