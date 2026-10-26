"use client";

import { ModuleGate } from "@/components/modules/ModuleGate";

export default function NutritionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate id="nutrition">{children}</ModuleGate>;
}
