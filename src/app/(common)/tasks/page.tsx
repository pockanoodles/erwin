"use client";

import { useEffect, useState } from "react";

import { BsKanban, BsListTask } from "react-icons/bs";
import { toast } from "sonner";

import { BoardView } from "@/components/tasks/BoardView/BoardView";
import { LordSidebar } from "@/components/tasks/LordSidebar";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { cn } from "@/lib/utils";

import { UNASSIGNED_LORD_ID, useLordStore } from "@/store/lord";
import { useProjectStore } from "@/store/project";
import { useTaskStore } from "@/store/task";
import { useTaskModalStore } from "@/store/taskModal";
import { useTaskPageSettings } from "@/store/taskPageSettings";

import { NewTask, Task, TaskStatus } from "@/types/task";

export default function TasksPage() {
  const {
    tasks,
    tags,
    loading,
    error,
    fetchTasks,
    fetchTags,
    createTask,
    updateTask,
    deleteTask,
    createTag,
    scheduleAllTasks,
  } = useTaskStore();
  const { fetchProjects } = useProjectStore();
  const { fetchLords, activeLordId } = useLordStore();
  const { viewMode, setViewMode } = useTaskPageSettings();
  const { isOpen, setOpen } = useTaskModalStore();

  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [initialGoalId, setInitialGoalId] = useState<string | null | undefined>(
    undefined
  );

  // Fetch tasks, tags, and the Lord sections on mount
  useEffect(() => {
    fetchTasks();
    fetchTags();
    fetchProjects();
    fetchLords();
  }, [fetchTasks, fetchTags, fetchProjects, fetchLords]);

  const handleCreateTask = async (task: NewTask) => {
    await createTask(task);
    await fetchTasks();
    await fetchProjects();
  };

  const handleUpdateTask = async (task: NewTask) => {
    if (selectedTask) {
      await updateTask(selectedTask.id, task);
      await fetchTasks();
      await fetchProjects();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      await deleteTask(taskId);
      await fetchTasks();
      await fetchProjects();
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await updateTask(taskId, { status });
    await fetchTasks();
    await fetchProjects();
  };

  const handleCreateTag = async (name: string, color?: string) => {
    try {
      const newTag = await createTag({ name, color });
      await fetchTags(); // Refresh tags after creation
      return newTag;
    } catch (error) {
      console.error("Error creating tag:", error);
      throw error;
    }
  };

  const handleInlineEdit = async (task: Task & { goalId?: string | null }) => {
    // goalLinks is a relation (display-only); the Lord cell edits it through
    // the API's single-goal `goalId` setter instead.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, tags, createdAt, updatedAt, project, goalLinks, ...updates } =
      task;
    try {
      await updateTask(id, updates);
      await fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task", {
        description: "Please try again later.",
      });
    }
  };

  return (
    <div className="flex h-full">
      <LordSidebar />
      <div className="flex min-w-0 flex-1 flex-col" data-task-page>
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-light tracking-tight text-foreground">
                Tasks
              </h1>
              <div className="flex border border-border">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                    viewMode === "list"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <BsListTask className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  onClick={() => setViewMode("board")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                    viewMode === "board"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <BsKanban className="h-3.5 w-3.5" />
                  Board
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  scheduleAllTasks();
                }}
              >
                Auto Schedule
              </Button>
              <Button
                data-create-task-button
                onClick={() => {
                  setSelectedTask(undefined);
                  // Creating inside a Lord's section pre-links the task to
                  // that Lord; "All" and "Unassigned" seed nothing.
                  setInitialGoalId(
                    activeLordId && activeLordId !== UNASSIGNED_LORD_ID
                      ? activeLordId
                      : undefined
                  );
                  setOpen(true);
                }}
              >
                Create Task
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          {viewMode === "list" ? (
            <TaskList
              tasks={tasks}
              onEdit={(task) => {
                setSelectedTask(task);
                setOpen(true);
              }}
              onDelete={handleDeleteTask}
              onStatusChange={handleStatusChange}
              onInlineEdit={handleInlineEdit}
            />
          ) : (
            <BoardView
              tasks={tasks}
              onEdit={(task) => {
                setSelectedTask(task);
                setOpen(true);
              }}
              onDelete={handleDeleteTask}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>

        <TaskModal
          isOpen={isOpen}
          onClose={() => {
            setOpen(false);
            setSelectedTask(undefined);
            setInitialGoalId(undefined);
          }}
          onSave={selectedTask ? handleUpdateTask : handleCreateTask}
          task={selectedTask}
          tags={tags}
          onCreateTag={handleCreateTag}
          initialGoalId={initialGoalId}
        />

        {loading && (
          <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="border bg-background p-4">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
