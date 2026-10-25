"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { createGoal, deleteGoal, fetchGoal, updateGoal } from "@/components/goals/api";
import { GoalForm, type GoalFormValues } from "@/components/goals/GoalForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useLadderStore } from "@/store/ladder";

const BLANK: GoalFormValues = {
  title: "",
  whyItMatters: null,
  definitionOfDone: null,
  importanceScore: 50,
  develops: [],
  isBoss: false,
  targetDate: null,
};

/**
 * Adding and editing the goals made in Erwin. Goals from the vault never open
 * here: the next projection would overwrite whatever changed.
 */
export function GoalDialog() {
  const dialog = useLadderStore((s) => s.goalDialog);
  const setDialog = useLadderStore((s) => s.setGoalDialog);
  const selectGoal = useLadderStore((s) => s.selectGoal);
  const data = useLadderStore((s) => s.data);
  const load = useLadderStore((s) => s.load);
  const [values, setValues] = useState<GoalFormValues | null>(null);
  const editingId = dialog?.mode === "edit" ? dialog.goalId : null;

  useEffect(() => {
    if (!dialog) return;
    if (dialog.mode === "add") {
      setValues(BLANK);
      return;
    }
    let live = true;
    setValues(null);
    fetchGoal(dialog.goalId).then(
      (goal) => live && setValues(goal),
      (e: unknown) => {
        if (!live) return;
        toast.error(e instanceof Error ? e.message : "That goal couldn't load");
        setDialog(null);
      }
    );
    return () => {
      live = false;
    };
  }, [dialog, setDialog]);

  const close = () => setDialog(null);
  const parents = (data?.goals ?? []).filter((g) => !g.isBoss).map((g) => ({ id: g.id, title: g.title }));

  const submit = async (next: GoalFormValues, parentGoalId: string | null) => {
    try {
      if (editingId) {
        await updateGoal(editingId, next);
      } else {
        await createGoal({ ...next, ...(parentGoalId && { parentGoalIds: [parentGoalId] }) });
      }
      close();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The goal didn't save");
    }
  };

  const remove = async () => {
    if (!editingId || !values) return;
    if (!window.confirm(`Delete "${values.title}"? Its tasks stay, and only their link to it goes.`)) return;
    try {
      await deleteGoal(editingId);
      close();
      selectGoal(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The goal wasn't deleted");
    }
  };

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? (values?.isBoss ? "Edit boss" : "Edit goal") : "Add a goal"}</DialogTitle>
          <DialogDescription>
            A goal names the stats its work develops. Link tasks to it from Tasks, and each one you finish earns XP for
            those stats.
          </DialogDescription>
        </DialogHeader>
        {values ? (
          <GoalForm
            key={editingId ?? "new"}
            initialValues={values}
            parents={editingId ? undefined : parents}
            submitLabel={editingId ? "Save" : "Add goal"}
            onSubmit={submit}
            onCancel={close}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {editingId && values ? (
          <div className="border-t border-border pt-4">
            <Button type="button" size="sm" variant="destructive" onClick={remove}>
              Delete {values.isBoss ? "boss" : "goal"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
