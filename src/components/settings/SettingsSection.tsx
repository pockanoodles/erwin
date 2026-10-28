import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

interface SettingRowProps {
  label: string;
  description: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A settings block: equipment-plate title, one quiet sentence, then rows. */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section className={cn("space-y-6", className)}>
      <header className="space-y-1.5 border-b border-border pb-4">
        <h2 className="er-display text-[13px] tracking-[0.12em] text-foreground">
          {title}
        </h2>
        <p className="max-w-prose text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

/** One preference: label and help on the left, control on the right. */
export function SettingRow({
  label,
  description,
  children,
  className,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "grid gap-3 border-b border-border/70 pb-6 last:border-b-0 last:pb-0 md:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] md:items-start md:gap-8",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium leading-none text-foreground">
          {label}
        </div>
        <div className="text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
