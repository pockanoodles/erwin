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
import { CanvasLmsSettings } from "@/components/settings/CanvasLmsSettings";

import {
  PeopleTopBarActions,
  PeopleTopBarViews,
} from "@/modules/people/components/PeopleTopBar";
import type { ModuleId } from "@/modules/types";

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
}

export const CLIENT_MODULES: Record<ModuleId, ClientContributions> = {
  courses: {
    command: { icon: HiOutlineCollection, shortcut: "gl" },
    Views: CoursesTopBarViews,
    Actions: CoursesTopBarActions,
    Settings: CanvasLmsSettings,
    Status: CourseActivityStatus,
    FirstRun: ConnectCanvasOffer,
  },
  ladder: {
    command: { icon: HiOutlineFlag, shortcut: "gg" },
    Views: LadderTopBarViews,
    Actions: LadderTopBarActions,
  },
  people: {
    command: { icon: HiOutlineUserGroup, shortcut: "gp" },
    Views: PeopleTopBarViews,
    Actions: PeopleTopBarActions,
  },
};
