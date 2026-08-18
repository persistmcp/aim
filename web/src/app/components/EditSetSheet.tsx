// Bottom sheet for fixing a single set's weight/reps/RIR from SessionDetail
// (FUNCTIONAL_IMPROVEMENTS_PLAN.md #5) — the other most common "one number" write, without a chat
// round-trip. Mirrors the MCP update_set tool's own patch shape and disambiguation.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "../lib/api";
import { Button } from "./ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "./ui/drawer";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export interface EditSetTarget {
  sessionId: string;
  exerciseId: string;
  occurrence: number;
  setNumber: number;
  weight?: number;
  reps?: number;
  rir?: number;
}

interface EditSetSheetProps {
  target: EditSetTarget | null;
  onOpenChange: (open: boolean) => void;
}

function toInputValue(n: number | undefined): string {
  return n != null ? String(n) : "";
}

function toPatchValue(raw: string): number | null | undefined {
  if (raw.trim() === "") return null; // an explicit blank clears the field
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : undefined; // undefined → leave the key out, don't send garbage
}

export function EditSetSheet({ target, onOpenChange }: EditSetSheetProps) {
  const { t } = useTranslation("session");
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (target) {
      setWeight(toInputValue(target.weight));
      setReps(toInputValue(target.reps));
      setRir(toInputValue(target.rir));
      setError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.sessionId, target?.exerciseId, target?.occurrence, target?.setNumber]);

  const save = async () => {
    if (!target) return;
    // A number input holding unparseable text (e.g. "12..5") reports value "" while the garbage
    // stays visible on screen — indistinguishable from a deliberate clear in React state alone.
    // Without this check the save would silently send null and WIPE the stored value the user
    // was only trying to edit.
    const badInput = ["edit-set-weight", "edit-set-reps", "edit-set-rir"].some(
      (id) => (document.getElementById(id) as HTMLInputElement | null)?.validity.badInput,
    );
    if (badInput) {
      setError(true);
      return;
    }
    const patch: Record<string, number | null> = {};
    for (const [key, raw] of [
      ["weight_kg", weight],
      ["reps", reps],
      ["rir", rir],
    ] as const) {
      const v = toPatchValue(raw);
      if (v !== undefined) patch[key] = v;
    }
    setIsPending(true);
    setError(false);
    try {
      await apiPatch("/sets", {
        session_id: target.sessionId,
        exercise_id: target.exerciseId,
        set_number: target.setNumber,
        occurrence: target.occurrence,
        patch,
      });
      await queryClient.invalidateQueries({ queryKey: ["session", target.sessionId] });
      onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Drawer open={target !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("editSet.title", { n: target?.setNumber ?? "" })}</DrawerTitle>
          <DrawerDescription>{t("editSet.description")}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="edit-set-weight">{t("editSet.weight")}</Label>
            <Input
              id="edit-set-weight"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-set-reps">{t("editSet.reps")}</Label>
            <Input
              id="edit-set-reps"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-set-rir">{t("editSet.rir")}</Label>
            <Input
              id="edit-set-rir"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              className="h-11 text-base"
            />
          </div>
        </div>
        {error && <p className="px-4 pb-2 text-sm text-destructive">{t("editSet.error")}</p>}
        <DrawerFooter>
          <Button onClick={save} disabled={isPending} className="min-h-11">
            {t("editSet.save")}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" className="min-h-11">
              {t("editSet.cancel")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
