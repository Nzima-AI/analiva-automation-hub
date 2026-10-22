import { Badge } from "@/components/ui";
import { humanise } from "@/lib/format";

const invoiceTones = {
  CAPTURED: "neutral",
  NEEDS_REVIEW: "warn",
  APPROVED: "brand",
  POSTED: "brand",
  REJECTED: "danger",
} as const;

export function InvoiceStatusBadge({ status }: { status: keyof typeof invoiceTones }) {
  return <Badge tone={invoiceTones[status]}>{humanise(status)}</Badge>;
}
