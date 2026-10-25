"use client";

import { useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCourseActivityStore } from "@/store/courseActivity";

/**
 * Courses' count in the top bar's status strip: what changed in Canvas since
 * it was last looked at — the one number that exists so a posted exam rule or
 * a moved due date isn't missed. Nothing shows while there's nothing new.
 */
export function CourseActivityStatus() {
  const pathname = usePathname();
  const unseen = useCourseActivityStore((s) => s.unseenCount);
  const load = useCourseActivityStore((s) => s.load);

  // Refresh on navigation; the store throttles it.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  if (unseen <= 0) return null;
  return (
    <Link
      href="/courses?view=activity"
      className="flex flex-none items-center gap-x-1.5 transition-colors duration-150 hover:text-foreground"
      title="Open Courses → Activity"
    >
      <span aria-hidden>·</span>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-lume" />
      <span>{unseen} new</span>
    </Link>
  );
}
