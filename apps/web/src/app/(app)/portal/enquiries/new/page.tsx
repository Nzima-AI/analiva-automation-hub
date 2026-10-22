import { ENQUIRY_CATEGORIES, categoryLabel } from "@/components/enquiry-thread";
import { Button, ButtonLink, Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { requireClient } from "@/lib/session";
import { createEnquiry } from "../../../enquiries/actions";

export const metadata = { title: "New enquiry" };

export default async function NewEnquiryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireClient();
  const { error } = await searchParams;
  return (
    <div className="max-w-2xl">
      <PageHeader title="Ask your accountant" subtitle="Describe what you need. You'll get a reply here and by email." />
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <form action={createEnquiry} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Subject" className="sm:col-span-2">
              <Input name="subject" required autoFocus />
            </Field>
            <Field label="About">
              <Select name="category" defaultValue="GENERAL">
                {ENQUIRY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Message">
            <Textarea name="body" required rows={7} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">Send enquiry</Button>
            <ButtonLink href="/portal/enquiries" variant="secondary">
              Cancel
            </ButtonLink>
          </div>
        </form>
      </Card>
    </div>
  );
}
