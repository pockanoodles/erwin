"use client";

import { useEffect } from "react";

import { toast } from "sonner";

import { BoardView } from "@/components/tasks/BoardView/BoardView";
import { LordSidebar } from "@/components/tasks/LordSidebar";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { useLordStore } from "@/store/lord";
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
  } = useTaskStore();
  const { fetchProjects } = useProjectStore();
  const { fetchLords } = useLordStore();
  const { viewMode } = useTaskPageSettings();
  // View switching and Create Task live in the app top bar
  // (components/tasks/TasksTopBar.tsx); the page only owns the modal itself.
  const { isOpen, editingTask, initialGoalId, openEdit, close } =
    useTaskModalStore();

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
    if (editingTask) {
      await updateTask(editingTask.id, task);
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
    // Column on a phone (the Lord filter is a chip strip there), row on a
    // laptop (it's a 224px sidebar). `md` matches useIsMobile's 767px ceiling.
    <div className="flex h-full flex-col md:flex-row">
      <LordSidebar />
      <div className="flex min-w-0 flex-1 flex-col" data-task-page>
        {error && (
          <Alert variant="destructive" className="m-4 mb-0">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {/* The list view is a datasheet and runs edge to edge like one — it
            brings its own chrome and needs the full width for columns. The
            board is a padded canvas. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {viewMode === "list" ? (
            <TaskList
              tasks={tasks}
              onEdit={openEdit}
              onDelete={handleDeleteTask}
              onStatusChange={handleStatusChange}
              onInlineEdit={handleInlineEdit}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <BoardView
                tasks={tasks}
                onEdit={openEdit}
                onDelete={handleDeleteTask}
                onStatusChange={handleStatusChange}
                onInlineEdit={handleInlineEdit}
              />
            </div>
          )}
        </div>

        <TaskModal
          isOpen={isOpen}
          onClose={close}
          onSave={editingTask ? handleUpdateTask : handleCreateTask}
          task={editingTask}
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
