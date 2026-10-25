"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Today's first-run offer from Courses: Canvas is where its work comes from. */
export function ConnectCanvasOffer() {
  return (
    <Button asChild>
      <Link href="/modules?module=courses">Connect Canvas</Link>
    </Button>
  );
}
