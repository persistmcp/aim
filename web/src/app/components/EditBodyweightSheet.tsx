// Bottom sheet for the Home bodyweight tile (FUNCTIONAL_IMPROVEMENTS_PLAN.md #5) — the single most
// common "one number" write, without a chat round-trip. Dated today; the app's weight tile and
// charts read body_metrics, not a stored profile field, so this is the same write log_body_metric
// makes from the coach.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../lib/api";
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

interface EditBodyweightSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentValue?: number;
}

export function EditBodyweightSheet({
  open,
  onOpenChange,
  currentValue,
}: EditBodyweightSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(false);

  // Re-seed with the latest known weight each time the sheet opens, not on every currentValue
  // change — that would clobber whatever the user is mid-typing while the sheet is already open.
  useEffect(() => {
    if (open) {
      setValue(currentValue != null ? String(currentValue) : "");
      setError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const kg = parseFloat(value.replace(",", "."));
    // Upper bound is a frontend-only guard: the backend accepts any value >= 0, so a fat-fingered
    // "7005" would otherwise save and wreck the weight chart's Y axis for good.
    if (!Number.isFinite(kg) || kg <= 0 || kg > 500) {
      setError(true);
      return;
    }
    setIsPending(true);
    setError(false);
    try {
      await apiPost("/body-metrics", { bodyweight_kg: kg });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
        queryClient.invalidateQueries({ queryKey: ["body-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("home.editWeight.title")}</DrawerTitle>
          <DrawerDescription>{t("home.editWeight.hint")}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error}
            aria-label={t("home.editWeight.title")}
            className="h-11 text-base"
          />
          {error && <p className="mt-2 text-sm text-destructive">{t("home.editWeight.error")}</p>}
        </div>
        <DrawerFooter>
          <Button onClick={save} disabled={isPending} className="min-h-11">
            {t("home.editWeight.save")}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" className="min-h-11">
              {t("home.editWeight.cancel")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
