import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";

// Shared back-to-tools header for individual tool screens.
export function ToolHeader({ title }: { title: string }) {
  const { t } = useTranslation("tools");
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1 mb-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/tools")}
        className="-ml-2"
        aria-label={t("backAria")}
      >
        <ArrowLeft className="w-4 h-4 mr-2" aria-hidden />
        {t("back")}
      </Button>
      <h1 className="sr-only">{title}</h1>
    </div>
  );
}
