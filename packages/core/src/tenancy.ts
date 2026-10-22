/**
 * Tenant scoping. Every query against a tenant-owned model is rewritten so it can only
 * touch rows of the caller's practice, and, for client roles, only rows of their client.
 *
 * This is pure: `packages/db` wires it into a Prisma client extension (`tenantDb`).
 * See docs/decisions/0002-tenant-scoping.md.
 */

export const ROLES = ["OWNER", "STAFF", "CLIENT", "CLIENT_STAFF"] as const;
export type Role = (typeof ROLES)[number];

export interface TenantContext {
  practiceId: string;
  userId: string;
  role: Role;
  /** Set for CLIENT and CLIENT_STAFF; null for practice staff. */
  clientId: string | null;
}

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

export function isPracticeRole(role: Role): boolean {
  return role === "OWNER" || role === "STAFF";
}

/**
 * How each model is owned. Models not listed here cannot be queried through the
 * tenant client at all, which forces every new model to make an explicit choice.
 *
 * - practice:        has practiceId only (client roles see none of it)
 * - client:          has practiceId and a required clientId
 * - client-optional: has practiceId and a nullable clientId (practice-level rows hidden from clients)
 * - client-self:     the Client table itself (client roles see only their own row)
 * - practice-self:   the Practice table itself
 * - user:            the User table (client roles see only users of their client)
 * - audit:           append-only; client roles may write but never read
 */
export type Ownership =
  | "practice"
  | "client"
  | "client-optional"
  | "client-self"
  | "practice-self"
  | "user"
  | "audit";

export const MODEL_OWNERSHIP: Record<string, Ownership> = {
  Practice: "practice-self",
  User: "user",
  Client: "client-self",
  Contact: "client",
  Workspace: "client",
  ClientService: "client",
  Mandate: "client",
  Supplier: "client",
  Invoice: "client",
  InvoiceLine: "client",
  Document: "client-optional",
  AuditLog: "audit",
  MailAccount: "practice",
  EmailMessage: "client-optional",
  Capture: "client-optional",
  SenderRule: "practice",
  SupplierProfile: "practice",
  CaptureCorrection: "practice",
  LedgerAccount: "client",
  JournalEntry: "client",
  JournalLine: "client",
  BankAccount: "client",
  BankTransaction: "client",
  ComplianceFiling: "client",
  BankRule: "practice",
  Enquiry: "client",
  EnquiryMessage: "client",
  OutboundEmail: "client",
};

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const WHERE_WRITE_OPS = new Set(["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

type Args = Record<string, unknown>;
type Data = Record<string, unknown>;

/** The row filter a context is allowed to see for a model. */
export function scopeFilter(model: string, ctx: TenantContext): Data {
  const ownership = MODEL_OWNERSHIP[model];
  if (!ownership) throw new TenantScopeError(`Model ${model} is not registered for tenant scoping`);
  const practiceRole = isPracticeRole(ctx.role);
  if (!practiceRole && !ctx.clientId) {
    throw new TenantScopeError("Client role without a clientId");
  }

  switch (ownership) {
    case "practice-self":
      return { id: ctx.practiceId };
    case "client-self":
      return practiceRole ? { practiceId: ctx.practiceId } : { practiceId: ctx.practiceId, id: ctx.clientId };
    case "user":
    case "client":
    case "client-optional":
      return practiceRole
        ? { practiceId: ctx.practiceId }
        : { practiceId: ctx.practiceId, clientId: ctx.clientId };
    case "practice":
      if (!practiceRole) throw new TenantScopeError(`${ctx.role} cannot access ${model}`);
      return { practiceId: ctx.practiceId };
    case "audit":
      return { practiceId: ctx.practiceId };
  }
}

/** Fields a create must carry for the context (forced, never trusted from input). */
function createStamp(model: string, ctx: TenantContext): Data {
  const ownership = MODEL_OWNERSHIP[model];
  const practiceRole = isPracticeRole(ctx.role);
  switch (ownership) {
    case "practice-self":
      throw new TenantScopeError("Practices cannot be created through a tenant client");
    case "client-self":
      if (!practiceRole) throw new TenantScopeError(`${ctx.role} cannot create clients`);
      return { practiceId: ctx.practiceId };
    case "user":
    case "client":
    case "client-optional":
      return practiceRole ? { practiceId: ctx.practiceId } : { practiceId: ctx.practiceId, clientId: ctx.clientId };
    case "practice":
    case "audit":
      if (ownership === "practice" && !practiceRole) {
        throw new TenantScopeError(`${ctx.role} cannot write ${model}`);
      }
      return { practiceId: ctx.practiceId };
    default:
      throw new TenantScopeError(`Model ${model} is not registered for tenant scoping`);
  }
}

function andWhere(where: unknown, filter: Data): Data {
  const base = (where ?? {}) as Data;
  const existingAnd = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...existingAnd, filter] };
}

function stampData(data: unknown, stamp: Data): Data {
  const d = (data ?? {}) as Data;
  for (const [key, value] of Object.entries(stamp)) {
    if (key in d && d[key] !== value) {
      throw new TenantScopeError(`Cannot write ${key} outside your tenant`);
    }
  }
  return { ...d, ...stamp };
}

/** Updates may never move a row to another practice or client. */
function guardUpdateData(model: string, data: unknown, ctx: TenantContext): void {
  const d = (data ?? {}) as Data;
  if ("practiceId" in d && d.practiceId !== ctx.practiceId) {
    throw new TenantScopeError(`Cannot move ${model} to another practice`);
  }
  if (!isPracticeRole(ctx.role) && "clientId" in d && d.clientId !== ctx.clientId) {
    throw new TenantScopeError(`Cannot move ${model} to another client`);
  }
}

/**
 * Rewrite Prisma operation args so they are confined to the tenant.
 * Throws TenantScopeError for operations the context may not perform.
 */
export function applyTenantScope(model: string, operation: string, args: Args | undefined, ctx: TenantContext): Args {
  const a: Args = { ...(args ?? {}) };
  const ownership = MODEL_OWNERSHIP[model];
  if (!ownership) throw new TenantScopeError(`Model ${model} is not registered for tenant scoping`);

  if (ownership === "audit") {
    if (!isPracticeRole(ctx.role) && !CREATE_OPS.has(operation)) {
      throw new TenantScopeError("Client roles cannot read the audit log");
    }
    if (WHERE_WRITE_OPS.has(operation) || operation === "upsert") {
      throw new TenantScopeError("The audit log is append-only");
    }
  }

  if (READ_OPS.has(operation)) {
    a.where = andWhere(a.where, scopeFilter(model, ctx));
    return a;
  }

  if (WHERE_WRITE_OPS.has(operation)) {
    if (ownership === "practice-self" && operation.startsWith("delete")) {
      throw new TenantScopeError("Practices cannot be deleted through a tenant client");
    }
    if (!isPracticeRole(ctx.role) && (ownership === "client-self" || ownership === "user") && operation.startsWith("delete")) {
      throw new TenantScopeError(`${ctx.role} cannot delete ${model}`);
    }
    if ("data" in a) guardUpdateData(model, a.data, ctx);
    a.where = andWhere(a.where, scopeFilter(model, ctx));
    return a;
  }

  if (CREATE_OPS.has(operation)) {
    const stamp = createStamp(model, ctx);
    a.data = Array.isArray(a.data) ? a.data.map((d) => stampData(d, stamp)) : stampData(a.data, stamp);
    return a;
  }

  if (operation === "upsert") {
    const stamp = createStamp(model, ctx);
    guardUpdateData(model, a.update, ctx);
    a.where = andWhere(a.where, scopeFilter(model, ctx));
    a.create = stampData(a.create, stamp);
    return a;
  }

  throw new TenantScopeError(`Operation ${operation} is not allowed through a tenant client`);
}
