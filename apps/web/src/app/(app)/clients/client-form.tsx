import { SERVICES } from "@aah/core";
import { Button, ButtonLink, Field, Input, Select, Textarea } from "@/components/ui";
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registered or full name">
          <Input name="name" required defaultValue={values?.name} autoFocus />
        </Field>
        <Field label="Trading as">
          <Input name="tradingName" defaultValue={values?.tradingName ?? ""} />
        </Field>
        <Field label="CIPC registration number" hint="e.g. 2019/123456/07">
          <Input name="registrationNumber" defaultValue={values?.registrationNumber ?? ""} />
        </Field>
        <Field label="VAT number">
          <Input name="vatNumber" defaultValue={values?.vatNumber ?? ""} inputMode="numeric" />
        </Field>
        <Field label="Income tax number">
          <Input name="taxNumber" defaultValue={values?.taxNumber ?? ""} />
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
        <Field label="Email">
          <Input name="email" type="email" defaultValue={values?.email ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={values?.phone ?? ""} />
        </Field>
        <Field
          label="Email domains"
          hint="Used to match inbound email to this client. Comma separated, e.g. acme.co.za"
          className="sm:col-span-2"
        >
          <Input name="emailDomains" defaultValue={values?.emailDomains.join(", ") ?? ""} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={values?.notes ?? ""} />
        </Field>
      </div>

      {showServices ? (
        <fieldset>
          <legend className="text-sm font-medium">Services</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <label key={s} className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm">
                <input type="checkbox" name="services" value={s} defaultChecked={s === "ACCOUNTING"} className="accent-brand" />
                {humanise(s)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit">Save client</Button>
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
