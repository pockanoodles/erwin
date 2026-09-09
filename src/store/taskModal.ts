import { create } from "zustand";

import type { Task } from "@/types/task";

interface TaskModalStore {
  isOpen: boolean;
  /** The task being edited. `undefined` means the modal is in create mode. */
  editingTask: Task | undefined;
  /**
   * Pre-links a new task to the Lord whose section it was created in.
   * `undefined` seeds nothing; `null` explicitly clears any link.
   */
  initialGoalId: string | null | undefined;
  openCreate: (initialGoalId?: string | null) => void;
  openEdit: (task: Task) => void;
  close: () => void;
}

/**
 * Task modal state. `editingTask` and `initialGoalId` used to be `useState` on
 * the tasks page next to the button that set them — but "Create Task" lives in
 * the app top bar now, which renders outside the page, and a bare `setOpen(true)`
 * from out there would reopen the modal still holding whichever task was last
 * edited. Making the open call carry its own mode is what stops that.
 */
export const useTaskModalStore = create<TaskModalStore>((set) => ({
  isOpen: false,
  editingTask: undefined,
  initialGoalId: undefined,
  openCreate: (initialGoalId) =>
    set({ isOpen: true, editingTask: undefined, initialGoalId }),
  openEdit: (task) =>
    set({ isOpen: true, editingTask: task, initialGoalId: undefined }),
  close: () =>
    set({ isOpen: false, editingTask: undefined, initialGoalId: undefined }),
}));
