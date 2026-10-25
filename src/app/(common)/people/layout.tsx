"use client";

import { ModuleGate } from "@/components/modules/ModuleGate";

export default function PeopleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate id="people">{children}</ModuleGate>;
}
