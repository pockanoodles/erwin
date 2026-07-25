"use client";

import { useState } from "react";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RxDragHandleDots2 } from "react-icons/rx";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { format } from "@/lib/date-utils";
import { STAT_ABBREV, type StatKey } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import { createGoal, deleteGoal, reorderGoals, updateGoal } from "./api";
import { GoalForm, GoalFormValues } from "./GoalForm";
import {
  withGoalAdded,
  withGoalRemoved,
  withGoalUpdated,
  withRootsReordered,
} from "./optimistic";
import {
  ApplyOverview,
  GoalsOverview,
  OverviewGoal,
  formatDay,
  goalChildren,
} from "./types";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/** A draggable Lord block: the grip handle carries the drag listeners so the
 *  rest of the row stays clickable; dnd-kit animates siblings out of the way. */
function SortableLord({
  id,
  children,
}: {
  id: string;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const handle = (
    <button
      {...attributes}
      {...listeners}
      aria-label="Reorder"
      className="flex-none cursor-grab touch-none self-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground active:cursor-grabbing group-hover:opacity-100 group-focus-within:opacity-100"
    >
      <RxDragHandleDots2 className="h-4 w-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-70")}
    >
      {children(handle)}
    </div>
  );
}

/** Mirrors the Focus tier treatment (FocusTaskCard): red for DANGER, amber for HIGH. */
function tierBadge(tier: string | null): { label: string; className: string } | null {
  if (tier === "DANGER") {
    return { label: "DANGER", className: "text-red-700 dark:text-red-400" };
  }
  if (tier === "HIGH") {
    return { label: "HIGH", className: "text-amber-700 dark:text-amber-400" };
  }
  return null;
}

interface GoalsListViewProps {
  overview: GoalsOverview;
  apply: ApplyOverview;
  refetch: () => Promise<void>;
}

export function GoalsListView({ overview, apply, refetch }: GoalsListViewProps) {
  // "root" = adding a top-level goal; a goal id = adding a subgoal under it
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const byParent = goalChildren(overview.goals);
  const topLevel = byParent.get(null) ?? [];

  const emptyGoal: GoalFormValues = {
    title: "",
    whyItMatters: null,
    definitionOfDone: null,
    importanceScore: null,
    develops: [],
    isBoss: false,
    targetDate: null,
  };

  const submitAdd = async (values: GoalFormValues) => {
    try {
      const created = await createGoal({
        ...values,
        ...(addingUnder !== "root" &&
          addingUnder && { parentGoalIds: [addingUnder] }),
      });
      setAddingUnder(null);
      apply((o) => withGoalAdded(o, created));
      toast.success("Goal added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add goal");
    }
  };

  const submitEdit = async (id: string, values: GoalFormValues) => {
    setEditingId(null);
    apply((o) => withGoalUpdated(o, id, values));
    try {
      await updateGoal(id, values);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update goal");
      void refetch();
    }
  };

  const remove = (goal: OverviewGoal) => {
    if (
      !window.confirm(
        `Delete "${goal.title}"? Linked goals and tasks are kept — only the links go.`
      )
    ) {
      return;
    }
    apply((o) => withGoalRemoved(o, goal.id));
    deleteGoal(goal.id).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete goal");
      void refetch();
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = topLevel.map((g) => g.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    apply((o) => withRootsReordered(o, next));
    reorderGoals(next).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Failed to reorder");
      void refetch();
    });
  };

  const renderGoal = (
    goal: OverviewGoal,
    depth: number,
    path: Set<string>,
    dragHandle?: React.ReactNode
  ): React.ReactNode => {
    if (path.has(goal.id)) return null; // defensive: the API forbids loops
    const children = byParent.get(goal.id) ?? [];
    const nextPath = new Set(path).add(goal.id);
    return (
      <div
        key={`${[...path].join(".")}:${goal.id}`}
        className={cn(depth > 0 && "ml-4 border-l border-border pl-4")}
      >
        {editingId === goal.id ? (
          <div className="border-t border-border pt-4">
            <GoalForm
              initialValues={goal}
              submitLabel="Save"
              onSubmit={(values) => submitEdit(goal.id, values)}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <div className="group border-t border-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-2">
                {dragHandle}
                {goal.parentGoalIds.length === 0 ? (
                  <span className="flex-none rounded border border-foreground px-1 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                    Lord
                  </span>
                ) : null}
                {goal.isBoss ? (
                  <span
                    className="flex-none text-sm"
                    title={
                      goal.targetDate
                        ? `Boss — ${formatDay(goal.targetDate)}`
                        : "Boss"
                    }
                  >
                    ⚔
                  </span>
                ) : null}
                <h3
                  className={cn(
                    "font-semibold tracking-tight",
                    depth === 0 ? "text-lg" : "text-base"
                  )}
                >
                  {goal.title}
                </h3>
                {goal.develops.length > 0 ? (
                  <span className="flex flex-none gap-1">
                    {goal.develops.map((key) => (
                      <span
                        key={key}
                        title={key}
                        className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {STAT_ABBREV[key as StatKey] ?? key}
                      </span>
                    ))}
                  </span>
                ) : null}
                {goal.parentGoalIds.length > 1 ? (
                  <span
                    className="flex-none font-mono text-[10px] text-muted-foreground"
                    title="This goal feeds multiple goals"
                  >
                    ⋔ {goal.parentGoalIds.length}
                  </span>
                ) : null}
              </span>
              <span className="flex items-baseline gap-3">
                {goal.importanceScore != null ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.round(goal.importanceScore)}/100
                  </span>
                ) : null}
                <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
                    onClick={() => {
                      setEditingId(null);
                      setAddingUnder(goal.id);
                    }}
                  >
                    Add boss
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
                    onClick={() => {
                      setAddingUnder(null);
                      setEditingId(goal.id);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => remove(goal)}
                  >
                    Delete
                  </Button>
                </span>
              </span>
            </div>
            {goal.whyItMatters ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {goal.whyItMatters}
              </p>
            ) : null}
            {goal.definitionOfDone ? (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Done when:</span>{" "}
                {goal.definitionOfDone}
              </p>
            ) : null}
            {goal.tasks.length > 0 ? (
              <ul className="mt-2 divide-y divide-border/60">
                {goal.tasks.map((task) => {
                  const badge = tierBadge(task.urgencyTier);
                  const done = task.status === "completed";
                  return (
                    <li
                      key={task.id}
                      className="flex items-baseline justify-between gap-4 py-1.5"
                    >
                      <span
                        className={cn(
                          "min-w-0 truncate text-sm",
                          done && "text-muted-foreground line-through"
                        )}
                      >
                        {task.title}
                      </span>
                      <span className="flex flex-none items-baseline gap-3">
                        {badge && !done ? (
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              badge.className
                            )}
                          >
                            {badge.label}
                          </span>
                        ) : null}
                        {task.dueDate ? (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(task.dueDate), "MMM d")}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}
        {addingUnder === goal.id ? (
          <div className="ml-4 border-l border-border pl-4 pt-4">
            <GoalForm
              initialValues={emptyGoal}
              submitLabel="Add boss"
              onSubmit={submitAdd}
              onCancel={() => setAddingUnder(null)}
            />
          </div>
        ) : null}
        {children.map((child) => renderGoal(child, depth + 1, nextPath))}
      </div>
    );
  };

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>Bosses</SectionLabel>
          {addingUnder === null && editingId === null ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
              onClick={() => setAddingUnder("root")}
            >
              Add Lord
            </Button>
          ) : null}
        </div>
        {addingUnder === "root" ? (
          <div className="border-t border-border pt-4">
            <GoalForm
              initialValues={emptyGoal}
              submitLabel="Add Lord"
              onSubmit={submitAdd}
              onCancel={() => setAddingUnder(null)}
            />
          </div>
        ) : null}
        {topLevel.length === 0 && addingUnder !== "root" ? (
          <p className="text-sm text-muted-foreground">
            No Lords in this hex yet — name the two or three big fights that
            define it.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={topLevel.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {topLevel.map((goal) => (
                <SortableLord key={goal.id} id={goal.id}>
                  {(handle) => renderGoal(goal, 0, new Set(), handle)}
                </SortableLord>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </section>

    </div>
  );
}
