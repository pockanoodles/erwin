import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  HiOutlineCalendar,
  HiOutlineClipboardList,
  HiOutlineCog,
  HiOutlineFlag,
  HiOutlineLightningBolt,
  HiOutlineMenu,
  HiOutlineTrendingUp,
} from "react-icons/hi";

import { useNavUIStore } from "@/store/navUi";

import { Command } from "../types";

export function useNavigationCommands(): Command[] {
  const { isNavOpen, setNavOpen } = useNavUIStore();

  return [
    {
      id: "navigation.calendar",
      title: "Go to Calendar",
      keywords: ["navigation"],
      icon: HiOutlineCalendar,
      section: "navigation",
      shortcut: "gc",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/calendar");
      },
    },
    {
      id: "navigation.tasks",
      title: "Go to Tasks",
      keywords: ["navigation"],
      icon: HiOutlineClipboardList,
      section: "navigation",
      shortcut: "gt",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/tasks");
      },
    },
    {
      id: "navigation.focus",
      title: "Go to Focus",
      keywords: ["navigation"],
      icon: HiOutlineLightningBolt,
      section: "navigation",
      shortcut: "gf",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/focus");
      },
    },
    {
      id: "navigation.progress",
      title: "Go to Progress",
      keywords: ["navigation", "stats"],
      icon: HiOutlineTrendingUp,
      section: "navigation",
      shortcut: "gp",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/progress");
      },
    },
    {
      id: "navigation.goals",
      title: "Go to Bosses",
      keywords: ["navigation", "goals", "bosses", "lords", "hex"],
      icon: HiOutlineFlag,
      section: "navigation",
      shortcut: "gg",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/goals");
      },
    },
    {
      id: "navigation.settings",
      title: "Go to Settings",
      keywords: ["navigation"],
      icon: HiOutlineCog,
      section: "navigation",
      shortcut: "gs",
      perform: (router?: AppRouterInstance) => {
        if (router) router.push("/settings");
      },
    },
    {
      // The rail collapses to zero width, so this and the edge tab in AppNav
      // are the only ways back in — registering it here rather than as a bare
      // keydown gets it into the palette and the shortcuts sheet for free.
      id: "navigation.toggle-sidebar",
      title: "Toggle Sidebar",
      keywords: ["sidebar", "nav", "rail", "toggle", "collapse", "expand"],
      icon: HiOutlineMenu,
      section: "navigation",
      shortcut: "meta+\\",
      perform: () => setNavOpen(!isNavOpen),
    },
  ];
}
