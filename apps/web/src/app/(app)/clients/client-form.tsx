import { SERVICES } from "@aah/core";
import { Button, ButtonLink, Field, Input, Select, Textarea, Toggle } from "@/components/ui";
import { humanise } from "@/lib/format";

interface ClientValues {
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  emailDomains: string[];
  status: string;
  notes: string | null;
  isCompany: boolean;
  vatRegistered: boolean;
  vatCategory: string | null;
  payeRegistered: boolean;
  financialYearEndMonth: number;
  incorporationDate: Date | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-6 border-t border-line pt-6 first:border-t-0 first:pt-0 lg:grid-cols-3">
      <legend className="sr-only">{title}</legend>
      <div>
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">{children}</div>
    </fieldset>
  );
}

export function ClientForm({
  action,
  values,
  showServices,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  values?: ClientValues;
  showServices?: boolean;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-6">
      <Section title="Business" description="Legal details as registered with CIPC and SARS.">
        <Field label="Registered or full name" className="sm:col-span-2">
          <Input name="name" required defaultValue={values?.name} autoFocus />
        </Field>
        <Field label="Trading as">
          <Input name="tradingName" defaultValue={values?.tradingName ?? ""} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={values?.status ?? "ONBOARDING"}>
            {["PROSPECT", "ONBOARDING", "ACTIVE", "PAUSED", "ARCHIVED"].map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CIPC registration number" hint="e.g. 2019/123456/07">
          <Input name="registrationNumber" defaultValue={values?.registrationNumber ?? ""} />
        </Field>
        <Field label="Incorporation date" hint="Sets the CIPC annual return date">
          <Input name="incorporationDate" type="date" defaultValue={values?.incorporationDate?.toISOString().slice(0, 10) ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle name="isCompany" defaultChecked={values?.isCompany ?? true} label="Company or close corporation" hint="Files ITR14 and CIPC annual returns. Untick for sole proprietors." />
        </div>
      </Section>

      <Section title="Tax profile" description="Drives VAT treatment in the books and the SARS deadline calendar.">
        <Field label="Income tax number">
          <Input name="taxNumber" defaultValue={values?.taxNumber ?? ""} />
        </Field>
        <Field label="Financial year end">
          <Select name="financialYearEndMonth" defaultValue={String(values?.financialYearEndMonth ?? 2)}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Toggle name="vatRegistered" defaultChecked={values?.vatRegistered ?? false} label="VAT registered" hint="Input VAT is claimed separately; otherwise VAT is part of the cost." />
        </div>
        <Field label="VAT number">
          <Input name="vatNumber" defaultValue={values?.vatNumber ?? ""} inputMode="numeric" />
        </Field>
        <Field label="VAT category" hint="A: periods end Feb, Apr… · B: Jan, Mar… · C: monthly">
          <Select name="vatCategory" defaultValue={values?.vatCategory ?? ""}>
            <option value="">Not set</option>
            <option value="A">Category A (bi-monthly, even months)</option>
            <option value="B">Category B (bi-monthly, odd months)</option>
            <option value="C">Category C (monthly)</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Toggle name="payeRegistered" defaultChecked={values?.payeRegistered ?? false} label="Registered for PAYE / UIF / SDL" hint="Adds EMP201 and EMP501 to the calendar." />
        </div>
      </Section>

      <Section title="Contact" description="Email domains let inbound mail match to this client automatically.">
        <Field label="Email">
          <Input name="email" type="email" defaultValue={values?.email ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={values?.phone ?? ""} />
        </Field>
        <Field label="Email domains" hint="Comma separated, e.g. acme.co.za" className="sm:col-span-2">
          <Input name="emailDomains" defaultValue={values?.emailDomains.join(", ") ?? ""} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={values?.notes ?? ""} />
        </Field>
      </Section>

      {showServices ? (
        <Section title="Services" description="What the practice does for this client.">
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {SERVICES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-xs has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="checkbox" name="services" value={s} defaultChecked={s === "ACCOUNTING"} className="accent-[var(--brand)]" />
                {humanise(s)}
              </label>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="flex gap-2 border-t border-line pt-6">
        <Button type="submit">Save client</Button>
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
