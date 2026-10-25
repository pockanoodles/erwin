"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { updateCycle } from "@/components/goals/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { STAT_ABBREV, STAT_KEYS, STAT_NAMES, type StatKey } from "@/lib/erwin/stats";
import { cn } from "@/lib/utils";

import { useLadderStore } from "@/store/ladder";

/** Respec: the stats the running hex pushes, and what it's about. */
export function BuildDialog() {
  const open = useLadderStore((s) => s.buildOpen);
  const setOpen = useLadderStore((s) => s.setBuildOpen);
  const data = useLadderStore((s) => s.data);
  const load = useLadderStore((s) => s.load);
  const [build, setBuild] = useState<StatKey[]>([]);
  const [theme, setTheme] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && data) {
      setBuild(data.hex.build);
      setTheme(data.hex.theme);
    }
  }, [open, data]);

  const cycleId = data?.hex.cycleId;
  const toggle = (key: StatKey) =>
    setBuild((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleId) return;
    setSaving(true);
    try {
      await updateCycle(cycleId, { focusStats: build, theme: theme.trim() });
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The Build didn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Build for {data?.hex.label}</DialogTitle>
          <DialogDescription>
            Pick the two or three stats this hex pushes. The Ladder shows how much of the XP you earn lands on them.
            {data?.managedExternally
              ? " Your vault's map keeps a Build of its own that doesn't sync here, so set the same stats."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {STAT_KEYS.map((key) => {
              const on = build.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(key)}
                  className={cn(
                    "er-plate er-plate-sm flex h-12 flex-col items-start justify-center px-2.5 text-left transition-colors duration-150",
                    on
                      ? "text-background [--plate:var(--er-ink)]"
                      : "text-foreground [--plate:var(--er-surface)] hover:[--plate:var(--er-hover)]"
                  )}
                >
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">{STAT_ABBREV[key]}</span>
                  <span className={cn("text-[11px]", on ? "text-background/75" : "text-muted-foreground")}>{STAT_NAMES[key]}</span>
                </button>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="hex-theme" className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Theme
            </label>
            <Input
              id="hex-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="What these two months are about"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving || !cycleId}>
              {saving ? "Saving…" : "Save Build"}
            </Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">{build.length} picked</span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
