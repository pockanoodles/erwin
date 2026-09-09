import { HiOutlineCalendar, HiOutlinePlus } from "react-icons/hi";

import { useTaskStore } from "@/store/task";
import { useTaskModalStore } from "@/store/taskModal";

import { Command } from "../types";

export function useTaskCommands(): Command[] {
  return [
    {
      id: "tasks.create",
      title: "Create Task",
      keywords: ["task", "new", "add", "create"],
      icon: HiOutlinePlus,
      section: "tasks",
      shortcut: "nt", // 'n' for new, 't' for task
      context: {
        navigateIfNeeded: true,
        requiredPath: "/tasks",
      },
      perform: () => {
        useTaskModalStore.getState().openCreate();
      },
    },
    {
      // The top bar hides its Auto Schedule button below `md` (there is no room
      // for it at 393px), and this is the fallback that claim depends on — so
      // it deliberately carries no `context`: a bulk re-slot is valid from any
      // route, not just /tasks.
      id: "tasks.schedule-all",
      title: "Auto Schedule All Tasks",
      keywords: ["schedule", "auto", "reslot", "replan", "all", "tasks"],
      icon: HiOutlineCalendar,
      section: "tasks",
      perform: async () => {
        await useTaskStore.getState().scheduleAllTasks();
      },
    },
  ];
}
