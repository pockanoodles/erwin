"use client";

import { ModuleGate } from "@/components/modules/ModuleGate";

export default function CoursesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate id="courses">{children}</ModuleGate>;
}
