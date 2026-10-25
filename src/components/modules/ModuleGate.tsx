"use client";

import { useEffect } from "react";

import Link from "next/link";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { moduleById } from "@/modules";
import type { ModuleId } from "@/modules/types";

import { useModuleOn, useModulesStore } from "@/store/modules";

/**
 * Wraps a module's page. While the module is on, the page renders; while
 * it's off, the page says so and offers to turn it on, so a bookmark or an
 * old link never lands on a page that half works. Nothing renders until it's
 * known whether the module is on.
 */
export function ModuleGate({
  id,
  children,
}: {
  id: ModuleId;
  children: React.ReactNode;
}) {
  const on = useModuleOn(id);
  const load = useModulesStore((s) => s.load);
  const setOn = useModulesStore((s) => s.setOn);

  useEffect(() => {
    void load();
  }, [load]);

  if (on === null) return null;
  if (on) return <>{children}</>;

  const { name, summary } = moduleById(id);
  const turnOn = async () => {
    if (!(await setOn(id, true))) {
      toast.error(`Couldn't turn ${name} on. Try again.`);
    }
  };

  return (
    <div className="max-w-xl space-y-5 p-6 md:p-10">
      <p className="er-label">{name} is off</p>
      <p className="text-lg leading-relaxed text-foreground">{summary}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void turnOn()}>Turn on {name}</Button>
        <Button asChild variant="quiet">
          <Link href={`/modules?module=${id}`}>See what it adds</Link>
        </Button>
      </div>
    </div>
  );
}
