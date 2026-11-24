import Link from "next/link";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import { ResponsiveCellContent } from "./table-disclosure";
import type { Icon } from "@phosphor-icons/react";
import { CountUp } from "@/components/motion/count-up";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- buttons

const buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] disabled:opacity-50 disabled:pointer-events-none active:translate-y-px active:scale-[0.98]";
const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-3.5", lg: "h-11 px-5 text-[15px]" };
const buttonVariants = {
  primary: "btn-sheen bg-gradient-to-b from-[#0074a4] to-[#005d88] text-white shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_16px_-6px_rgb(0_134_195/0.6)] hover:from-[#006893] hover:to-[#034d72] hover:shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_10px_22px_-8px_rgb(0_134_195/0.7)]",
  secondary: "border border-line bg-panel text-ink shadow-xs hover:bg-subtle hover:border-line-strong",
  danger: "border border-danger/30 bg-panel text-danger hover:bg-danger-soft",
  ghost: "text-muted hover:text-ink hover:bg-subtle",
};
type Variant = keyof typeof buttonVariants;
type Size = keyof typeof buttonSizes;

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button data-magnetic={variant === "primary" && size !== "sm" ? "" : undefined} className={cx(buttonBase, buttonSizes[size], buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link data-magnetic={variant === "primary" && size !== "sm" ? "" : undefined} className={cx(buttonBase, buttonSizes[size], buttonVariants[variant], className)} {...props} />;
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
  icon?: Icon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      data-reveal
      data-spotlight
      className={cx(
        "edge-light rounded-[1.15rem] border border-line bg-panel shadow-[0_1px_0_var(--hl)_inset,var(--shadow-xs)] transition-[border-color,box-shadow] duration-500 hover:border-line-strong hover:shadow-sm",
        className,
      )}
    >
      <span className="edge" aria-hidden />
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-ink">
              {Icon ? <Icon className="h-4 w-4 shrink-0 text-brand-text" weight="duotone" aria-hidden /> : null}
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? (title || actions ? "px-5 pb-5 pt-3" : "p-5") : title || actions ? "pt-2" : ""}>{children}</div>
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
  icon?: Icon;
  tone?: keyof typeof statTones;
  href?: string;
  trend?: { value: string; up: boolean; good: boolean } | null;
}) {
  const body = (
    <>
      <span className="edge" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-faint transition-colors group-hover:text-brand-text" weight="duotone" aria-hidden /> : null}
      </div>
      <div className={cx("num mt-2.5 text-[26px] font-medium leading-none", statTones[tone])}>
        {typeof value === "string" || typeof value === "number" ? <CountUp value={String(value)} /> : value}
      </div>
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
  const cls =
    "edge-light group block rounded-2xl border border-line bg-panel p-4 shadow-[0_1px_0_var(--hl)_inset,var(--shadow-xs)] transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]";
  return href ? (
    <Link href={href} data-reveal data-spotlight className={cx(cls, "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div data-reveal data-spotlight className={cls}>
      {body}
    </div>
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
    <div data-reveal className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-[13px] font-medium text-brand-text">{eyebrow}</div> : null}
        <h1 className="editorial-heading break-words text-[clamp(2.35rem,5vw,3.5rem)] font-normal leading-[0.98] text-ink">{title}</h1>
        {subtitle ? <div className="mt-2.5 text-sm text-muted">{subtitle}</div> : null}
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

export function Empty({ children, icon: Icon, action }: { children: ReactNode; icon?: Icon; action?: ReactNode }) {
  return (
    <div className="ledger-lines flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-12 text-center">
      {Icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-panel text-brand-text shadow-sm">
          <Icon className="h-5 w-5" weight="duotone" aria-hidden />
        </span>
      ) : null}
      <div className="max-w-sm text-sm text-muted">{children}</div>
      {action}
    </div>
  );
}

export function Table({ head, children, align, mobilePrimary = 0, mobilePreview }: {
  head: ReactNode[];
  children: ReactNode;
  align?: Array<"left" | "right">;
  mobilePrimary?: number;
  mobilePreview?: number;
}) {
  const rows = Children.map(children, (row) => {
    if (!isValidElement<ComponentProps<"tr">>(row) || row.type !== "tr") return row;
    const cells = Children.toArray(row.props.children);
    if (cells.length !== head.length || !cells.every((cell) => isValidElement<ComponentProps<"td">>(cell))) return row;

    return cloneElement(row, {
      role: "row",
      className: cx(row.props.className, "record-row"),
      children: cells.map((cell, index) => {
        const primary = index === mobilePrimary;
        return cloneElement(cell, {
          role: "cell",
          className: cx(cell.props.className, "record-field", primary && "record-field-primary", index === mobilePreview && "record-field-preview"),
          children: <ResponsiveCellContent label={head[index]} primary={primary}>{cell.props.children}</ResponsiveCellContent>,
        });
      }),
    });
  });

  return (
    <div className="record-table-scroll scroll-thin">
      <table className="record-table w-full text-left text-sm" role="table">
        <thead role="rowgroup">
          <tr role="row">
            {head.map((h, i) => (
              <th key={i} scope="col" role="columnheader" className={cx(align?.[i] === "right" && "text-right")}>
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{rows}</tbody>
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

/** Ink surface: the product's signature dark panel (hero bands, key figures). */
export function InkPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section data-reveal className={cx("ink rounded-3xl border border-white/10 shadow-[0_30px_60px_-30px_rgb(4_17_27/0.55)]", className)}>
      {children}
    </section>
  );
}

/** A large figure with a small currency mark, for ink panels. */
export function Figure({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: ReactNode; tone?: "default" | "up" | "down" }) {
  const m = /^(-?)R\s?(.*)$/.exec(value);
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-white/60">{label}</p>
      <p className={cx("num mt-1.5 truncate text-[30px] font-medium leading-none sm:text-[34px]", tone === "up" ? "text-[#5eead4]" : tone === "down" ? "text-[#fda4af]" : "text-white")}>
        {m ? (
          <>
            {m[1]}
            <span className="mr-1 align-top text-[0.55em] text-white/50">R</span>
            <CountUp value={m[2]!} />
          </>
        ) : (
          <CountUp value={value} />
        )}
      </p>
      {hint ? <p className="mt-2 truncate text-xs text-white/55">{hint}</p> : null}
    </div>
  );
}
