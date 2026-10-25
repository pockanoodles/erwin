"use client";

import { ModuleGate } from "@/components/modules/ModuleGate";

export default function LadderLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate id="ladder">{children}</ModuleGate>;
}
