"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
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

import { cn } from "@/lib/utils";

import {
  createGoal,
  createTask,
  deleteGoal,
  deleteTask,
  setTaskGoal,
  updateGoal,
  updateTaskTitle,
} from "./api";
import { GoalForm } from "./GoalForm";
import {
  GoalTask,
  GoalsOverview,
  OverviewGoal,
  goalChildren,
} from "./types";

/* ---------- node components ---------- */

const HEX_SIZE = { width: 220, height: 64 };
const GOAL_SIZE = { width: 240, height: 84 };
const TASK_SIZE = { width: 220, height: 44 };
const TRAY_GAP = 320;

type HexNodeType = Node<{ label: string; theme: string }, "hex">;
type GoalNodeType = Node<
  { title: string; importanceScore: number | null; whyItMatters: string | null },
  "goal"
>;
type TaskNodeType = Node<
  { title: string; status: string; urgencyTier: string | null },
  "task"
>;
type TrayNodeType = Node<{ label: string }, "tray">;
type FlowNode = HexNodeType | GoalNodeType | TaskNodeType | TrayNodeType;

function HexNode({ data }: NodeProps<HexNodeType>) {
  return (
    <div
      className="border border-border bg-background p-3"
      style={{ width: HEX_SIZE.width, minHeight: HEX_SIZE.height }}
    >
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {data.label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold">
        {data.theme || "No theme yet"}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function GoalNode({ data, selected }: NodeProps<GoalNodeType>) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background p-3",
        selected && "ring-2 ring-primary"
      )}
      style={{ width: GOAL_SIZE.width, minHeight: GOAL_SIZE.height }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{data.title}</p>
        {data.importanceScore != null ? (
          <span className="font-mono text-xs text-muted-foreground">
            {Math.round(data.importanceScore)}
          </span>
        ) : null}
      </div>
      {data.whyItMatters ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {data.whyItMatters}
        </p>
      ) : null}
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
        "flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2",
        selected && "ring-2 ring-primary"
      )}
      style={{ width: TASK_SIZE.width, minHeight: TASK_SIZE.height }}
    >
      {data.urgencyTier === "DANGER" && !done ? (
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-red-600" />
      ) : data.urgencyTier === "HIGH" && !done ? (
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
      ) : null}
      <p
        className={cn(
          "min-w-0 truncate text-xs",
          done && "text-muted-foreground line-through"
        )}
      >
        {data.title}
      </p>
      <Handle type="target" position={Position.Left} />
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
  hex: HexNode,
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
  layout.setGraph({ rankdir: "LR", nodesep: 20, ranksep: 90 });

  nodes.push({
    id: "hex",
    type: "hex",
    position: { x: 0, y: 0 },
    deletable: false,
    data: {
      label: overview.activeCycle.hex.label,
      theme: overview.activeCycle.theme,
    },
  });
  layout.setNode("hex", HEX_SIZE);

  for (const goal of overview.goals) {
    nodes.push({
      id: `g:${goal.id}`,
      type: "goal",
      position: { x: 0, y: 0 },
      deletable: false,
      data: {
        title: goal.title,
        importanceScore: goal.importanceScore,
        whyItMatters: goal.whyItMatters,
      },
    });
    layout.setNode(`g:${goal.id}`, GOAL_SIZE);

    if (goal.parentGoalId) {
      edges.push({
        id: `eg:${goal.parentGoalId}:${goal.id}`,
        source: `g:${goal.parentGoalId}`,
        target: `g:${goal.id}`,
      });
      layout.setEdge(`g:${goal.parentGoalId}`, `g:${goal.id}`);
    } else {
      // Hex → top-level goal edges are structural; deleting them means nothing.
      edges.push({
        id: `eh:${goal.id}`,
        source: "hex",
        target: `g:${goal.id}`,
        deletable: false,
        style: { strokeDasharray: "4 4" },
      });
      layout.setEdge("hex", `g:${goal.id}`);
    }

    for (const task of goal.tasks) {
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
      layout.setNode(`t:${task.id}`, TASK_SIZE);
      edges.push({
        id: `et:${goal.id}:${task.id}`,
        source: `g:${goal.id}`,
        target: `t:${task.id}`,
      });
      layout.setEdge(`g:${goal.id}`, `t:${task.id}`);
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

  // Unassigned tasks stack in a tray column left of the tree.
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

/* ---------- selection panel ---------- */

interface Selected {
  kind: "goal" | "task";
  id: string;
}

/* ---------- main component ---------- */

interface GoalsMapViewProps {
  overview: GoalsOverview;
  refetch: () => Promise<void>;
}

export function GoalsMapView({ overview, refetch }: GoalsMapViewProps) {
  const { resolvedTheme } = useTheme();
  const graph = useMemo(() => buildGraph(overview), [overview]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [subTitle, setSubTitle] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskRename, setTaskRename] = useState("");

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  const byParent = useMemo(() => goalChildren(overview.goals), [overview]);
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
  const selectedTaskGoalId =
    selected?.kind === "task"
      ? (overview.goals.find((g) =>
          g.tasks.some((t) => t.id === selected.id)
        )?.id ?? null)
      : null;

  useEffect(() => {
    setTaskRename(selectedTask?.title ?? "");
    setSubTitle("");
    setTaskTitle("");
  }, [selectedTask?.title, selected?.id]);

  const mutate = useCallback(
    async (fn: () => Promise<void>, success?: string) => {
      try {
        await fn();
        if (success) toast.success(success);
        await refetch();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
        await refetch();
      }
    },
    [refetch]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return;
      if (source.startsWith("g:") && target.startsWith("g:")) {
        void mutate(
          () =>
            updateGoal(target.slice(2), { parentGoalId: source.slice(2) }),
          "Subgoal attached"
        );
      } else if (source.startsWith("g:") && target.startsWith("t:")) {
        void mutate(
          () => setTaskGoal(target.slice(2), source.slice(2)),
          "Task linked"
        );
      } else if (source === "hex" && target.startsWith("g:")) {
        void mutate(
          () => updateGoal(target.slice(2), { parentGoalId: null }),
          "Moved to top level"
        );
      }
    },
    [mutate]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        if (edge.id.startsWith("et:")) {
          void mutate(
            () => setTaskGoal(edge.target.slice(2), null),
            "Task unlinked"
          );
        } else if (edge.id.startsWith("eg:")) {
          void mutate(
            () => updateGoal(edge.target.slice(2), { parentGoalId: null }),
            "Moved to top level"
          );
        }
      }
    },
    [mutate]
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection) =>
      connection.target !== "hex" &&
      connection.source !== connection.target &&
      !connection.source?.startsWith("t:"),
    []
  );

  const removeGoal = () => {
    if (!selectedGoal) return;
    const subCount = (byParent.get(selectedGoal.id) ?? []).length;
    const detail = subCount > 0 ? " Its subgoals go with it;" : "";
    if (
      !window.confirm(
        `Delete "${selectedGoal.title}"?${detail} linked tasks are kept.`
      )
    ) {
      return;
    }
    setSelected(null);
    void mutate(() => deleteGoal(selectedGoal.id), "Goal deleted");
  };

  const removeTask = () => {
    if (!selectedTask) return;
    if (!window.confirm(`Delete task "${selectedTask.title}"? This is permanent.`)) {
      return;
    }
    setSelected(null);
    void mutate(() => deleteTask(selectedTask.id), "Task deleted");
  };

  return (
    <div className="h-[70vh] w-full border border-border">
      <ReactFlow
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => {
          if (node.id.startsWith("g:")) {
            setSelected({ kind: "goal", id: node.id.slice(2) });
          } else if (node.id.startsWith("t:")) {
            setSelected({ kind: "task", id: node.id.slice(2) });
          }
        }}
        onPaneClick={() => setSelected(null)}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        minZoom={0.2}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />

        <Panel position="top-left" className="space-y-1">
          <Button
            size="sm"
            onClick={() =>
              void mutate(
                () => createGoal({ title: "New goal" }),
                "Goal added — click it to rename"
              )
            }
          >
            Add goal
          </Button>
          <p className="max-w-[220px] text-xs text-muted-foreground">
            Drag between handles to connect. Select an edge and press Delete
            to disconnect.
          </p>
        </Panel>

        {selectedGoal ? (
          <Panel
            position="top-right"
            className="max-h-[calc(70vh-2rem)] w-96 overflow-y-auto border border-border bg-background p-4 shadow-sm"
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Goal
            </p>
            <GoalForm
              key={selectedGoal.id}
              initialValues={selectedGoal}
              submitLabel="Save"
              onSubmit={(values) =>
                mutate(() => updateGoal(selectedGoal.id, values), "Goal updated")
              }
              onCancel={() => setSelected(null)}
            />
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!subTitle.trim()) return;
                  void mutate(
                    () =>
                      createGoal({
                        title: subTitle.trim(),
                        parentGoalId: selectedGoal.id,
                      }),
                    "Subgoal added"
                  );
                  setSubTitle("");
                }}
              >
                <Input
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  placeholder="New subgoal…"
                  className="h-8 text-sm"
                />
                <Button type="submit" size="sm" variant="secondary">
                  Add
                </Button>
              </form>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!taskTitle.trim()) return;
                  void mutate(
                    () => createTask(taskTitle.trim(), selectedGoal.id),
                    "Task added"
                  );
                  setTaskTitle("");
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
                Delete goal
              </Button>
            </div>
          </Panel>
        ) : null}

        {selectedTask ? (
          <Panel
            position="top-right"
            className="w-96 border border-border bg-background p-4 shadow-sm"
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Task
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskRename.trim()) return;
                void mutate(
                  () => updateTaskTitle(selectedTask.id, taskRename.trim()),
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
              {selectedTaskGoalId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() =>
                    void mutate(
                      () => setTaskGoal(selectedTask.id, null),
                      "Task unlinked"
                    )
                  }
                >
                  Unlink from goal
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
  );
}
