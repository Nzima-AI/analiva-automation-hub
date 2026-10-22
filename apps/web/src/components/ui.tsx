import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- buttons

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";
const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5", lg: "h-11 px-5 text-[15px]" };
const buttonVariants = {
  primary: "bg-gradient-to-b from-brand to-brand-strong text-white shadow-sm hover:from-brand-strong hover:to-brand-deep",
  secondary: "border border-line bg-panel text-ink shadow-xs hover:bg-subtle hover:border-line-strong",
  danger: "border border-danger/30 bg-panel text-danger hover:bg-danger-soft",
  ghost: "text-muted hover:text-ink hover:bg-subtle",
};
type Variant = keyof typeof buttonVariants;
type Size = keyof typeof buttonSizes;

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={cx(buttonBase, buttonSizes[size], buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cx(buttonBase, buttonSizes[size], buttonVariants[variant], className)} {...props} />;
}

// ---------------------------------------------------------------- form fields

const fieldBase =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-xs placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-subtle disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-20", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, "h-9 pr-8", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked?: boolean; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-brand peer-checked:after:translate-x-4 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20" />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-panel shadow-xs", className)}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
              {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const statTones = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-danger",
  brand: "text-brand-text",
  warn: "text-warn",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof statTones;
  href?: string;
  trend?: { value: string; up: boolean; good: boolean } | null;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-faint" aria-hidden /> : null}
      </div>
      <div className={cx("mt-2 font-display text-2xl font-semibold tracking-tight tabular", statTones[tone])}>{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {trend ? (
          <span className={cx("rounded-md px-1.5 py-0.5 font-medium", trend.good ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger")}>
            {trend.up ? "▲" : "▼"} {trend.value}
          </span>
        ) : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </div>
    </>
  );
  const cls = "block rounded-2xl border border-line bg-panel p-4 shadow-xs transition-all";
  return href ? (
    <Link href={href} className={cx(cls, "hover:-translate-y-px hover:border-line-strong hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const badgeTones = {
  neutral: "bg-subtle text-ink-2 border-line",
  brand: "bg-brand-soft text-brand-text border-brand/20",
  positive: "bg-positive-soft text-positive border-positive/20",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/20",
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children, dot }: { tone?: BadgeTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-text">{eyebrow}</div> : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Notice({ tone = "danger", children }: { tone?: "danger" | "brand" | "warn" | "positive"; children: ReactNode }) {
  const tones = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    brand: "border-brand/25 bg-brand-soft text-brand-text",
    warn: "border-warn/25 bg-warn-soft text-warn",
    positive: "border-positive/25 bg-positive-soft text-positive",
  };
  return <div className={cx("mb-4 rounded-xl border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function Empty({ children, icon: Icon, action }: { children: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      {Icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-subtle text-faint">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <div className="max-w-sm text-sm text-muted">{children}</div>
      {action}
    </div>
  );
}

export function Table({ head, children, align }: { head: ReactNode[]; children: ReactNode; align?: Array<"left" | "right"> }) {
  return (
    <div className="-mx-5 overflow-x-auto scroll-thin">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-faint">
            {head.map((h, i) => (
              <th key={i} className={cx("whitespace-nowrap px-5 py-2.5", align?.[i] === "right" && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cx("px-5 py-3 align-top", className)} {...props} />;
}

/** Link-based tabs; the active one is decided by the caller. */
export function Tabs({ items }: { items: Array<{ href: string; label: string; active: boolean; count?: number }> }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line scroll-thin" aria-label="Sections">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cx(
            "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
            t.active ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink",
          )}
          aria-current={t.active ? "page" : undefined}
        >
          {t.label}
          {t.count ? <span className="rounded-full bg-subtle px-1.5 text-xs text-muted">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "positive" | "warn" | "danger" }) {
  const colors = { brand: "bg-brand", positive: "bg-positive", warn: "bg-warn", danger: "bg-danger" };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
      <div className={cx("h-full rounded-full transition-all", colors[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
