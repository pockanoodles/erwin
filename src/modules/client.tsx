"use client";

import type { ComponentType } from "react";

import type { IconType } from "react-icons";
import {
  HiOutlineCollection,
  HiOutlineFlag,
  HiOutlineUserGroup,
} from "react-icons/hi";

import { ConnectCanvasOffer } from "@/components/courses/ConnectCanvasOffer";
import { CourseActivityStatus } from "@/components/courses/CourseActivityStatus";
import {
  CoursesTopBarActions,
  CoursesTopBarViews,
} from "@/components/courses/CoursesTopBar";
import {
  LadderTopBarActions,
  LadderTopBarViews,
} from "@/components/ladder/LadderTopBar";
import {
  CanvasTaskBody,
  CanvasTaskContext,
  CanvasTaskPane,
} from "@/components/packet/TaskSlots";
import { CanvasLmsSettings } from "@/components/settings/CanvasLmsSettings";

import type { FocusQueueTask } from "@/lib/erwin/parse-task";

import { moduleForSource } from "@/modules";
import { TodayGoalSection } from "@/modules/ladder/components/TodayGoalSection";
import {
  PeopleTopBarActions,
  PeopleTopBarViews,
} from "@/modules/people/components/PeopleTopBar";
import type { ModuleId, ModuleManifest } from "@/modules/types";

/**
 * What each module puts into the browser's side of the core. The core reads
 * this list and never imports a module's components itself; each slot only
 * draws while its module is on.
 */
export interface ClientContributions {
  /** Its "Go to" entry in ⌘K. */
  command: { icon: IconType; shortcut?: string };
  /** Top bar, beside the page name on its page: view switchers. */
  Views?: ComponentType;
  /** Top bar, right, on its page: things that change its data. */
  Actions?: ComponentType;
  /** Its settings, on its row in /modules. */
  Settings?: ComponentType;
  /** At most one count in the top bar's status strip, on every route. */
  Status?: ComponentType;
  /** What Today offers before there's anything to rank. */
  FirstRun?: ComponentType;
  /** A section in Today's panel for the selected task. */
  TodayTaskSection?: ComponentType<{ task: FocusQueueTask }>;
  /** Focus's work column for a task from one of its sources, in place of
   *  the plain description. */
  TaskBody?: ComponentType<{ task: FocusQueueTask }>;
  /** More in Focus's context column for a task from one of its sources. */
  TaskContext?: ComponentType<{ task: FocusQueueTask }>;
  /** The task sheet's reading pane for a task from one of its sources. */
  TaskPane?: ComponentType<{ taskId: string }>;
}

export const CLIENT_MODULES: Record<ModuleId, ClientContributions> = {
  courses: {
    command: { icon: HiOutlineCollection, shortcut: "gl" },
    Views: CoursesTopBarViews,
    Actions: CoursesTopBarActions,
    Settings: CanvasLmsSettings,
    Status: CourseActivityStatus,
    FirstRun: ConnectCanvasOffer,
    TaskBody: CanvasTaskBody,
    TaskContext: CanvasTaskContext,
    TaskPane: CanvasTaskPane,
  },
  ladder: {
    command: { icon: HiOutlineFlag, shortcut: "gg" },
    Views: LadderTopBarViews,
    Actions: LadderTopBarActions,
    TodayTaskSection: TodayGoalSection,
  },
  people: {
    command: { icon: HiOutlineUserGroup, shortcut: "gp" },
    Views: PeopleTopBarViews,
    Actions: PeopleTopBarActions,
  },
};

/**
 * The module that owns a task's source, with what it draws for that task.
 * Null for a task from the core (made by hand, a calendar). It doesn't wait
 * to learn which modules are on: a task from a module that's off never
 * reaches the browser (the server hides its source), and waiting would
 * print a Canvas task's raw HTML description for a moment.
 */
export function useTaskModule(
  source: string | null | undefined
): (ClientContributions & { manifest: ModuleManifest }) | null {
  const owner = moduleForSource(source);
  return owner ? { manifest: owner, ...CLIENT_MODULES[owner.id] } : null;
}
