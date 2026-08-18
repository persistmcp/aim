// Segmented toggle. Options may be plain strings (value == label) or {value,label} pairs so callers
// can keep a stable `value` while showing a translated `label` (i18n).
//
// It never wraps. A segmented control that spills onto a second row stops reading as one control
// (owner, 2026-08-09: "текст внутри них смотрится странно в два ряда") — and it wrapped for a
// structural reason, not a cosmetic one: the four period options sat inline next to a heading that
// already ate most of a 390px row. Callers with more than two options pass `fill` and give the
// toggle its own row; the segments then share the width equally and truncate rather than wrap.
//
// The active segment is visibly LARGER, not only tinted: on a dark card the accent fill alone is
// easy to miss mid-scroll, and size reads in both themes and without colour vision. In `fill` mode
// it grows by taking a bigger flex share; inline it grows by padding — either way the label text
// steps up one size, so the growth is legible and not just a wider box.
type Option = string | { value: string; label: string };

interface PeriodToggleProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  /** Stretch to the container width with equal segments — use when it owns its row. */
  fill?: boolean;
  className?: string;
}

const norm = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

export function PeriodToggle({
  options,
  value,
  onChange,
  fill = false,
  className = "",
}: PeriodToggleProps) {
  return (
    <div
      role="group"
      className={`${fill ? "flex w-full" : "inline-flex max-w-full"} bg-secondary rounded-lg p-1 gap-1 ${className}`}
    >
      {options.map((option) => {
        const { value: v, label } = norm(option);
        const active = value === v;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={active}
            className={`min-h-11 min-w-0 inline-flex items-center justify-center rounded-md transition-all duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              fill ? (active ? "flex-[1.4]" : "flex-1") : ""
            } ${
              active
                ? "bg-accent text-accent-foreground font-medium text-[15px] px-3.5"
                : "text-muted-foreground hover:text-foreground text-sm px-2.5"
            }`}
          >
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
