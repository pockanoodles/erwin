"use client";

import { Suspense } from "react";

import { ModuleCatalog } from "@/components/modules/ModuleCatalog";

export default function ModulesPage() {
  return (
    <Suspense fallback={null}>
      <ModuleCatalog />
    </Suspense>
  );
}
