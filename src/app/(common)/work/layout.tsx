"use client";

import { ModuleGate } from "@/components/modules/ModuleGate";

export default function WorkLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate id="work">{children}</ModuleGate>;
}
