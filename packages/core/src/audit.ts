/**
 * Audit vocabulary. Every capture, change, email and API call writes an entry
 * with who, what, when and why (CLAUDE.md §7).
 */
export const AUDIT_ACTIONS = [
  "auth.signed_in",
  "auth.mfa_enrolled",
  "client.created",
  "client.updated",
  "client.archived",
  "client.service_toggled",
  "contact.created",
  "contact.deleted",
  "invoice.captured",
  "invoice.updated",
  "invoice.deleted",
  "document.uploaded",
  "document.downloaded",
  "document.deleted",
  "user.invited",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type ActorType = "USER" | "SYSTEM" | "API_KEY";

export interface AuditEntryInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  clientId?: string | null;
  reason?: string | null;
  /** Small, non-sensitive context only. Never full documents or tokens. */
  metadata?: Record<string, string | number | boolean | null>;
}
