"use client";

import { ModuleGate } from "@/components/modules/ModuleGate";

export default function TrainingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate id="training">{children}</ModuleGate>;
}
