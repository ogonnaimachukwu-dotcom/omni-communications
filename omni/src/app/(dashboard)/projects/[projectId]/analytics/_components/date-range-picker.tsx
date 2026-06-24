import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const PRESETS = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

export function DateRangePicker({ basePath, activeDays }: { basePath: string; activeDays: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {PRESETS.map((p) => (
        <Link
          key={p.days}
          href={`${basePath}?days=${p.days}`}
          className={cn(
            buttonVariants({ variant: p.days === activeDays ? "default" : "outline", size: "sm" }),
          )}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
