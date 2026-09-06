"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { STAT_ABBREV, type StatKey } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import {
  clearTaskGoals,
  createGoal,
  createTask,
  deleteGoal,
  deleteTask,
  linkGoals,
  linkTask,
  unlinkGoals,
  unlinkTask,
  updateGoal,
  updateTaskTitle,
} from "./api";
import { GoalForm } from "./GoalForm";
import {
  withGoalAdded,
  withGoalLink,
  withGoalRemoved,
  withGoalUpdated,
  withTaskAdded,
  withTaskLinked,
  withTaskRemoved,
  withTaskRenamed,
  withTaskUnlinked,
  withoutGoalLink,
} from "./optimistic";
import {
  ApplyOverview,
  GoalTask,
  GoalsOverview,
  OverviewGoal,
} from "./types";

/* ---------- node components ----------
 * The map is the battle map: Lords (root goals) are the destinations on the
 * right; standard bosses (subgoals) and tasks are the pathing toward them.
 * Hex, Build, and stats live in the header, not here. */

const LORD_SIZE = { width: 260, height: 96 };
const BOSS_SIZE = { width: 240, height: 84 };
const TASK_SIZE = { width: 220, height: 44 };
const TRAY_GAP = 320;

type GoalNodeType = Node<
  {
    title: string;
    importanceScore: number | null;
    whyItMatters: string | null;
    develops: string[];
    isBoss: boolean;
    isLord: boolean;
  },
  "goal"
>;
type TaskNodeType = Node<
  { title: string; status: string; urgencyTier: string | null },
  "task"
>;
type TrayNodeType = Node<{ label: string }, "tray">;
type FlowNode = GoalNodeType | TaskNodeType | TrayNodeType;

function GoalNode({ data, selected }: NodeProps<GoalNodeType>) {
  const size = data.isLord ? LORD_SIZE : BOSS_SIZE;
  return (
    <div
      className={cn(
        "border p-3",
        data.isLord
          ? "border-2 border-foreground bg-foreground text-background"
          : "border-border bg-background",
        selected && "ring-2 ring-cobalt"
      )}
      style={{ width: size.width, minHeight: size.height }}
    >
      <p
        className={cn(
          "font-mono text-[10px] uppercase tracking-wide",
          data.isLord ? "text-background/60" : "text-muted-foreground"
        )}
      >
        {data.isLord ? "Lord" : "Boss"}
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "min-w-0 truncate font-medium",
            data.isLord ? "text-base" : "text-sm"
          )}
        >
          {data.isBoss ? "⚔ " : ""}
          {data.title}
        </p>
        {data.importanceScore != null ? (
          <span
            className={cn(
              "font-mono text-xs",
              data.isLord ? "text-background/70" : "text-muted-foreground"
            )}
          >
            {Math.round(data.importanceScore)}
          </span>
        ) : null}
      </div>
      {data.develops.length > 0 ? (
        <p
          className={cn(
            "mt-1 font-mono text-[10px]",
            data.isLord ? "text-background/70" : "text-muted-foreground"
          )}
        >
          {data.develops
            .map((key) => STAT_ABBREV[key as StatKey] ?? key)
            .join(" ")}
        </p>
      ) : null}
      {/* Path flows left → right into the Lord: feeders arrive on the left,
          and this goal marches on toward its parent from the right. */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function TaskNode({ data, selected }: NodeProps<TaskNodeType>) {
  const done = data.status === "completed";
  return (
    <div
      className={cn(
        "flex items-center gap-2 border border-border/70 bg-background px-3 py-2",
        selected && "ring-2 ring-cobalt"
      )}
      style={{ width: TASK_SIZE.width, minHeight: TASK_SIZE.height }}
    >
      {data.urgencyTier === "DANGER" && !done ? (
        <span className="h-1.5 w-1.5 flex-none bg-red-600" />
      ) : data.urgencyTier === "HIGH" && !done ? (
        <span className="h-1.5 w-1.5 flex-none bg-amber-500" />
      ) : null}
      <p
        className={cn(
          "min-w-0 truncate text-xs",
          done && "text-muted-foreground line-through"
        )}
      >
        {data.title}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function TrayNode({ data }: NodeProps<TrayNodeType>) {
  return (
    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
      {data.label}
    </p>
  );
}

const nodeTypes = {
  goal: GoalNode,
  task: TaskNode,
  tray: TrayNode,
};

/* ---------- graph construction ---------- */

function buildGraph(overview: GoalsOverview): {
  nodes: FlowNode[];
  edges: Edge[];
} {
  const nodes: FlowNode[] = [];
  const edges: Edge[] = [];

  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 100 });

  const seenTasks = new Set<string>();
  for (const goal of overview.goals) {
    const isLord = goal.parentGoalIds.length === 0;
    nodes.push({
      id: `g:${goal.id}`,
      type: "goal",
      position: { x: 0, y: 0 },
      deletable: false,
      data: {
        title: goal.title,
        importanceScore: goal.importanceScore,
        whyItMatters: goal.whyItMatters,
        develops: goal.develops,
        isBoss: goal.isBoss,
        isLord,
      },
    });
    // dagre mutates the label object with x/y — every node needs its own copy.
    layout.setNode(`g:${goal.id}`, isLord ? { ...LORD_SIZE } : { ...BOSS_SIZE });

    // Edges keep parent-first ids (eg:parent:child) but render child → parent,
    // so the arrows march along the path toward the Lord.
    for (const parentId of goal.parentGoalIds) {
      edges.push({
        id: `eg:${parentId}:${goal.id}`,
        source: `g:${goal.id}`,
        target: `g:${parentId}`,
      });
      layout.setEdge(`g:${goal.id}`, `g:${parentId}`);
    }

    for (const task of goal.tasks) {
      // A task can serve several goals — one node, an edge per goal.
      if (!seenTasks.has(task.id)) {
        seenTasks.add(task.id);
        nodes.push({
          id: `t:${task.id}`,
          type: "task",
          position: { x: 0, y: 0 },
          deletable: false,
          data: {
            title: task.title,
            status: task.status,
            urgencyTier: task.urgencyTier,
          },
        });
        layout.setNode(`t:${task.id}`, { ...TASK_SIZE });
      }
      edges.push({
        id: `et:${goal.id}:${task.id}`,
        source: `t:${task.id}`,
        target: `g:${goal.id}`,
      });
      layout.setEdge(`t:${task.id}`, `g:${goal.id}`);
    }
  }

  dagre.layout(layout);
  let minX = 0;
  for (const node of nodes) {
    const placed = layout.node(node.id);
    node.position = {
      x: placed.x - placed.width / 2,
      y: placed.y - placed.height / 2,
    };
    minX = Math.min(minX, node.position.x);
  }

  // Unassigned tasks stack in a tray column left of the map.
  if (overview.unassignedTasks.length > 0) {
    const trayX = minX - TRAY_GAP;
    nodes.push({
      id: "tray",
      type: "tray",
      position: { x: trayX, y: -36 },
      deletable: false,
      selectable: false,
      data: { label: "Unassigned tasks" },
    });
    overview.unassignedTasks.forEach((task, i) => {
      nodes.push({
        id: `t:${task.id}`,
        type: "task",
        position: { x: trayX, y: i * (TASK_SIZE.height + 12) },
        deletable: false,
        data: { title: task.title, status: "todo", urgencyTier: task.urgencyTier },
      });
    });
  }

  return { nodes, edges };
}

/** Client-side mirror of the server's DAG loop check, so a bad drag is
 *  rejected instantly instead of after a round trip. */
function wouldLoop(
  goals: OverviewGoal[],
  parentId: string,
  childId: string
): boolean {
  if (parentId === childId) return true;
  const childrenOf = new Map<string, string[]>();
  for (const goal of goals) {
    for (const p of goal.parentGoalIds) {
      const list = childrenOf.get(p) ?? [];
      list.push(goal.id);
      childrenOf.set(p, list);
    }
  }
  const queue = [childId];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of childrenOf.get(current) ?? []) {
      if (next === parentId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/* ---------- selection panel ---------- */

interface Selected {
  kind: "goal" | "task";
  id: string;
}

/* ---------- main component ---------- */

interface GoalsMapViewProps {
  overview: GoalsOverview;
  apply: ApplyOverview;
  refetch: () => Promise<void>;
  /** Vault-canonical goals: no connect/delete/edit (see goals/page.tsx). */
  readOnly?: boolean;
}

export function GoalsMapView({
  overview,
  apply,
  refetch,
  readOnly = false,
}: GoalsMapViewProps) {
  const { resolvedTheme } = useTheme();
  const graph = useMemo(() => buildGraph(overview), [overview]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskRename, setTaskRename] = useState("");

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  const selectedGoal: OverviewGoal | null =
    selected?.kind === "goal"
      ? (overview.goals.find((g) => g.id === selected.id) ?? null)
      : null;
  const selectedTask: GoalTask | null =
    selected?.kind === "task"
      ? (overview.goals
          .flatMap((g) => g.tasks)
          .find((t) => t.id === selected.id) ??
        overview.unassignedTasks
          .map((t) => ({ ...t, status: "todo" }))
          .find((t) => t.id === selected.id) ??
        null)
      : null;
  const selectedTaskGoalCount =
    selected?.kind === "task"
      ? overview.goals.filter((g) => g.tasks.some((t) => t.id === selected.id))
          .length
      : 0;

  useEffect(() => {
    setTaskRename(selectedTask?.title ?? "");
    setSubTitle("");
    setTaskTitle("");
  }, [selectedTask?.title, selected?.id]);

  /** Optimistic runner: apply the local change now, fire the request, and
   *  only refetch (to resync) if the server disagrees. */
  const run = useCallback(
    (
      local: ((o: GoalsOverview) => GoalsOverview) | null,
      fn: () => Promise<unknown>,
      success?: string
    ) => {
      if (local) apply(local);
      fn()
        .then(() => {
          if (success) toast.success(success);
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "Update failed");
          void refetch();
        });
    },
    [apply, refetch]
  );

  // Dragging A → B means "A is on the path to B": B becomes A's parent.
  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;
      if (source.startsWith("g:") && target.startsWith("g:")) {
        const childId = source.slice(2);
        const parentId = target.slice(2);
        const child = overview.goals.find((g) => g.id === childId);
        if (child?.parentGoalIds.includes(parentId)) return;
        if (wouldLoop(overview.goals, parentId, childId)) {
          toast.error("That link would create a loop");
          return;
        }
        run(
          (o) => withGoalLink(o, parentId, childId),
          () => linkGoals(parentId, childId),
          "Path linked"
        );
      } else if (source.startsWith("t:") && target.startsWith("g:")) {
        const taskId = source.slice(2);
        const goalId = target.slice(2);
        run(
          (o) => withTaskLinked(o, taskId, goalId),
          () => linkTask(taskId, goalId),
          "Task linked"
        );
      }
    },
    [overview.goals, run]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        const [prefix, a, b] = edge.id.split(":");
        if (prefix === "et" && a && b) {
          run(
            (o) => withTaskUnlinked(o, b, a),
            () => unlinkTask(b, a),
            "Task unlinked"
          );
        } else if (prefix === "eg" && a && b) {
          run(
            (o) => withoutGoalLink(o, a, b),
            () => unlinkGoals(a, b),
            "Path unlinked"
          );
        }
      }
    },
    [run]
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection) =>
      connection.source !== connection.target &&
      !!connection.target?.startsWith("g:"),
    []
  );

  const removeGoal = () => {
    if (!selectedGoal) return;
    if (
      !window.confirm(
        `Delete "${selectedGoal.title}"? Linked bosses and tasks are kept — only the links go.`
      )
    ) {
      return;
    }
    setSelected(null);
    run(
      (o) => withGoalRemoved(o, selectedGoal.id),
      () => deleteGoal(selectedGoal.id),
      "Deleted"
    );
  };

  const removeTask = () => {
    if (!selectedTask) return;
    if (!window.confirm(`Delete task "${selectedTask.title}"? This is permanent.`)) {
      return;
    }
    setSelected(null);
    run(
      (o) => withTaskRemoved(o, selectedTask.id),
      () => deleteTask(selectedTask.id),
      "Task deleted"
    );
  };

  const selectedIsLord = selectedGoal
    ? selectedGoal.parentGoalIds.length === 0
    : false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-1">
        {!readOnly && (
          <Button
            size="sm"
            onClick={async () => {
              try {
                const created = await createGoal({ title: "New Lord" });
                apply((o) => withGoalAdded(o, created));
                toast.success("Lord added — click it to rename");
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Failed to add Lord"
                );
              }
            }}
          >
            Add Lord
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="px-2 font-mono text-muted-foreground"
          aria-label="Map help"
          onClick={() => setShowHelp((v) => !v)}
        >
          ?
        </Button>
      </div>
      {showHelp ? (
        <div className="space-y-1 border border-border bg-background p-3 text-xs text-muted-foreground">
          <p>
            Lords are the hex&apos;s main goals; bosses and tasks are the path
            to them.
          </p>
          <p>
            Drag from a task or boss to the goal it fights for — anything can
            feed several goals. Select an edge and press Delete to cut the
            path. Click a node to edit it or add bosses/tasks beneath it.
          </p>
        </div>
      ) : null}
      <div className="h-[calc(100dvh-16rem)] min-h-[520px] w-full border border-border">
      <ReactFlow
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onEdgesDelete={readOnly ? undefined : onEdgesDelete}
        isValidConnection={isValidConnection}
        nodesConnectable={!readOnly}
        onNodeClick={(_, node) => {
          if (readOnly) return;
          if (node.id.startsWith("g:")) {
            setSelected({ kind: "goal", id: node.id.slice(2) });
          } else if (node.id.startsWith("t:")) {
            setSelected({ kind: "task", id: node.id.slice(2) });
          }
        }}
        onPaneClick={() => setSelected(null)}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        fitView
        minZoom={0.2}
        defaultEdgeOptions={{
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />

        {selectedGoal ? (
          <Panel
            position="top-right"
            className="max-h-[calc(100%-2rem)] w-96 overflow-y-auto border border-border bg-background p-4"
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {selectedGoal.isBoss ? "⚔ " : ""}
              {selectedIsLord ? "Lord" : "Boss"}
            </p>
            <GoalForm
              key={selectedGoal.id}
              initialValues={selectedGoal}
              submitLabel="Save"
              onSubmit={async (values) => {
                apply((o) => withGoalUpdated(o, selectedGoal.id, values));
                try {
                  await updateGoal(selectedGoal.id, values);
                  toast.success("Saved");
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Failed to save"
                  );
                  void refetch();
                }
              }}
              onCancel={() => setSelected(null)}
            />
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!subTitle.trim()) return;
                  const title = subTitle.trim();
                  setSubTitle("");
                  try {
                    const created = await createGoal({
                      title,
                      parentGoalIds: [selectedGoal.id],
                    });
                    apply((o) => withGoalAdded(o, created));
                    toast.success("Boss added");
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Failed to add boss"
                    );
                  }
                }}
              >
                <Input
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  placeholder="New boss…"
                  className="h-8 text-sm"
                />
                <Button type="submit" size="sm" variant="secondary">
                  Add
                </Button>
              </form>
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!taskTitle.trim()) return;
                  const title = taskTitle.trim();
                  setTaskTitle("");
                  try {
                    const created = await createTask(title, selectedGoal.id);
                    apply((o) => withTaskAdded(o, selectedGoal.id, created));
                    toast.success("Task added");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Failed to add task"
                    );
                  }
                }}
              >
                <Input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="New task…"
                  className="h-8 text-sm"
                />
                <Button type="submit" size="sm" variant="secondary">
                  Add
                </Button>
              </form>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={removeGoal}
              >
                Delete {selectedIsLord ? "Lord" : "boss"}
              </Button>
            </div>
          </Panel>
        ) : null}

        {selectedTask ? (
          <Panel
            position="top-right"
            className="w-96 border border-border bg-background p-4"
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Task
              {selectedTaskGoalCount > 1
                ? ` · serves ${selectedTaskGoalCount} goals`
                : ""}
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskRename.trim()) return;
                const title = taskRename.trim();
                run(
                  (o) => withTaskRenamed(o, selectedTask.id, title),
                  () => updateTaskTitle(selectedTask.id, title),
                  "Task renamed"
                );
              }}
            >
              <Input
                value={taskRename}
                onChange={(e) => setTaskRename(e.target.value)}
                className="h-8 text-sm"
              />
              <Button type="submit" size="sm" variant="secondary">
                Save
              </Button>
            </form>
            <div className="mt-3 flex gap-2">
              {selectedTaskGoalCount > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() =>
                    run(
                      (o) => withTaskUnlinked(o, selectedTask.id, null),
                      () => clearTaskGoals(selectedTask.id),
                      selectedTaskGoalCount > 1
                        ? "Unlinked from all goals"
                        : "Task unlinked"
                    )
                  }
                >
                  {selectedTaskGoalCount > 1
                    ? "Unlink from all goals"
                    : "Unlink from goal"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={removeTask}
              >
                Delete task
              </Button>
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
      </div>
    </div>
  );
}
