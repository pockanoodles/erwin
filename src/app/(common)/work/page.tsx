"use client";

import { Suspense } from "react";

import { WorkPage } from "@/modules/work/components/WorkPage";

export default function Work() {
  return (
    <Suspense fallback={null}>
      <WorkPage />
    </Suspense>
  );
}
