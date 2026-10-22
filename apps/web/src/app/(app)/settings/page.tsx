import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";
import { requireStaff } from "@/lib/session";
import { updatePractice, updateProfile } from "./actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { db, ctx, user } = await requireStaff();
  const { error, saved } = await searchParams;
  const practice = await db.practice.findFirstOrThrow({});
  const owner = ctx.role === "OWNER";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {error ? <Notice>{error}</Notice> : null}
        {saved === "practice" ? <Notice tone="brand">Practice details saved.</Notice> : null}
        <Card title="Practice details">
          <form action={updatePractice}>
            <fieldset disabled={!owner} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Practice name" className="sm:col-span-2">
                  <Input name="name" required defaultValue={practice.name} />
                </Field>
                <Field label="CIPC registration number">
                  <Input name="registrationNumber" defaultValue={practice.registrationNumber ?? ""} />
                </Field>
                <Field label="VAT number">
                  <Input name="vatNumber" defaultValue={practice.vatNumber ?? ""} />
                </Field>
                <Field label="Practice email" hint="Shown to clients; the mailbox itself is set up under Email accounts.">
                  <Input name="email" type="email" defaultValue={practice.email ?? ""} />
                </Field>
                <Field label="Phone">
                  <Input name="phone" type="tel" defaultValue={practice.phone ?? ""} />
                </Field>
                <Field label="Website" className="sm:col-span-2">
                  <Input name="website" defaultValue={practice.website ?? ""} placeholder="https://" />
                </Field>
                <Field label="Physical address" className="sm:col-span-2">
                  <Textarea name="physicalAddress" defaultValue={practice.physicalAddress ?? ""} />
                </Field>
              </div>
              {owner ? <Button type="submit">Save practice details</Button> : <p className="text-sm text-muted">Only the owner can edit these.</p>}
            </fieldset>
          </form>
        </Card>
      </div>

      <div>
        {saved === "profile" ? <Notice tone="brand">Profile saved.</Notice> : null}
        <Card title="My profile">
          <form action={updateProfile} className="space-y-4">
            <Field label="Name">
              <Input name="name" required defaultValue={user.name} />
            </Field>
            <Field label="Login email" hint="To change your login email, ask the owner to create a new login.">
              <Input value={user.email} readOnly disabled />
            </Field>
            <Button type="submit">Save profile</Button>
          </form>
          <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
            Password: use{" "}
            <a href="/forgot-password" className="text-brand hover:underline">
              Forgot password
            </a>{" "}
            on the sign-in page to choose a new one.
          </p>
        </Card>
      </div>
    </div>
  );
}
