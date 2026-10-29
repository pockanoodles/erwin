"use client";

import Link from "next/link";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { brand } from "@/lib/brand";

import { MODULES } from "@/modules";
import { CLIENT_MODULES } from "@/modules/client";

import { useModulesStore } from "@/store/modules";

/**
 * Today before there's anything to rank — the first screen a new install
 * shows. It asks what Sigwald should keep track of: each module can be turned
 * on right here, and one that's on offers its own first step (Courses:
 * connect Canvas). A calendar or a task by hand works without any module.
 */
export function FirstRun() {
  const states = useModulesStore((s) => s.states);
  const known = useModulesStore((s) => s.known);
  const setOn = useModulesStore((s) => s.setOn);

  const turnOn = async (id: (typeof MODULES)[number]["id"], name: string) => {
    if (!(await setOn(id, true))) {
      toast.error(`Couldn't turn ${name} on. Try again.`);
    }
  };

  return (
    <div className="max-w-xl space-y-6 p-6 md:p-10">
      <div className="space-y-3">
        <p className="er-label">Nothing to rank yet</p>
        <p className="text-lg leading-relaxed text-foreground">
          {brand.name} ranks what you have to do, so give it something to rank.
          Add a calendar or a task by hand, or turn on a module that brings its
          own work.
        </p>
      </div>

      {known ? (
        <ul className="border-t border-border">
          {MODULES.map((m) => {
            const on = states.some((s) => s.id === m.id && s.on);
            const Offer = CLIENT_MODULES[m.id].FirstRun;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {m.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{m.summary}</p>
                </div>
                {on ? (
                  Offer ? (
                    <Offer />
                  ) : (
                    <span className="er-bracketed font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                      On
                    </span>
                  )
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => void turnOn(m.id, m.name)}
                  >
                    Turn on
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/settings#accounts">Add a calendar</Link>
        </Button>
        <Button asChild variant="quiet">
          <Link href="/tasks">Add a task</Link>
        </Button>
        <Button asChild variant="quiet">
          <Link href="/modules">All modules</Link>
        </Button>
      </div>
    </div>
  );
}
