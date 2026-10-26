"use client";

import { Suspense } from "react";

import { TrainingPage } from "@/modules/training/components/TrainingPage";

export default function Training() {
  return (
    <Suspense fallback={null}>
      <TrainingPage />
    </Suspense>
  );
}
