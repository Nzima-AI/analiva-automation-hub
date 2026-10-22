import { describe, expect, it } from "vitest";
import { applyTenantScope, TenantScopeError, type TenantContext } from "./tenancy";

const owner: TenantContext = { practiceId: "p1", userId: "u1", role: "OWNER", clientId: null };
const staff: TenantContext = { practiceId: "p1", userId: "u2", role: "STAFF", clientId: null };
const clientA: TenantContext = { practiceId: "p1", userId: "u3", role: "CLIENT", clientId: "cA" };
const clientStaffB: TenantContext = { practiceId: "p1", userId: "u4", role: "CLIENT_STAFF", clientId: "cB" };

describe("applyTenantScope — reads", () => {
  it("adds the practice filter for staff", () => {
    const out = applyTenantScope("Invoice", "findMany", { where: { status: "CAPTURED" } }, staff);
    expect(out.where).toEqual({ status: "CAPTURED", AND: [{ practiceId: "p1" }] });
  });

  it("confines client roles to their own client", () => {
    const out = applyTenantScope("Invoice", "findMany", {}, clientA);
    expect(out.where).toEqual({ AND: [{ practiceId: "p1", clientId: "cA" }] });
  });

  it("a client cannot widen scope by asking for another client's rows", () => {
    const out = applyTenantScope("Invoice", "findMany", { where: { clientId: "cB" } }, clientA);
    // Both conditions must hold, so the result is empty rather than client B's data.
    expect(out.where).toEqual({ clientId: "cB", AND: [{ practiceId: "p1", clientId: "cA" }] });
  });

  it("a client cannot escape via OR", () => {
    const out = applyTenantScope("Document", "findFirst", { where: { OR: [{ clientId: "cA" }, { clientId: "cB" }] } }, clientA);
    expect(out.where).toMatchObject({ AND: [{ practiceId: "p1", clientId: "cA" }] });
  });

  it("keeps existing AND clauses", () => {
    const out = applyTenantScope("Invoice", "count", { where: { AND: { status: "POSTED" } } }, owner);
    expect(out.where).toEqual({ AND: [{ status: "POSTED" }, { practiceId: "p1" }] });
  });

  it("scopes findUnique too", () => {
    const out = applyTenantScope("Invoice", "findUnique", { where: { id: "i9" } }, clientStaffB);
    expect(out.where).toEqual({ id: "i9", AND: [{ practiceId: "p1", clientId: "cB" }] });
  });

  it("client roles only see their own Client row", () => {
    const out = applyTenantScope("Client", "findMany", {}, clientA);
    expect(out.where).toEqual({ AND: [{ practiceId: "p1", id: "cA" }] });
  });

  it("client roles cannot read the audit log", () => {
    expect(() => applyTenantScope("AuditLog", "findMany", {}, clientA)).toThrow(TenantScopeError);
  });

  it("refuses unregistered models", () => {
    expect(() => applyTenantScope("SecretThing", "findMany", {}, owner)).toThrow(/not registered/);
  });

  it("refuses a client role with no clientId", () => {
    const broken: TenantContext = { ...clientA, clientId: null };
    expect(() => applyTenantScope("Invoice", "findMany", {}, broken)).toThrow(TenantScopeError);
  });
});

describe("applyTenantScope — writes", () => {
  it("stamps practiceId on create", () => {
    const out = applyTenantScope("Client", "create", { data: { name: "Acme" } }, staff);
    expect(out.data).toEqual({ name: "Acme", practiceId: "p1" });
  });

  it("stamps clientId for client roles", () => {
    const out = applyTenantScope("Document", "create", { data: { filename: "a.pdf" } }, clientA);
    expect(out.data).toEqual({ filename: "a.pdf", practiceId: "p1", clientId: "cA" });
  });

  it("rejects creating rows in another practice", () => {
    expect(() => applyTenantScope("Invoice", "create", { data: { practiceId: "p2" } }, owner)).toThrow(TenantScopeError);
  });

  it("rejects a client creating rows for another client", () => {
    expect(() => applyTenantScope("Invoice", "create", { data: { clientId: "cB" } }, clientA)).toThrow(TenantScopeError);
  });

  it("stamps every row of createMany", () => {
    const out = applyTenantScope("Contact", "createMany", { data: [{ name: "a" }, { name: "b" }] }, staff);
    expect(out.data).toEqual([
      { name: "a", practiceId: "p1" },
      { name: "b", practiceId: "p1" },
    ]);
  });

  it("client roles cannot create clients", () => {
    expect(() => applyTenantScope("Client", "create", { data: { name: "x" } }, clientA)).toThrow(TenantScopeError);
  });

  it("scopes updates and blocks moving rows across tenants", () => {
    const out = applyTenantScope("Invoice", "update", { where: { id: "i1" }, data: { status: "APPROVED" } }, staff);
    expect(out.where).toEqual({ id: "i1", AND: [{ practiceId: "p1" }] });
    expect(() =>
      applyTenantScope("Invoice", "update", { where: { id: "i1" }, data: { practiceId: "p2" } }, staff),
    ).toThrow(TenantScopeError);
    expect(() =>
      applyTenantScope("Invoice", "update", { where: { id: "i1" }, data: { clientId: "cB" } }, clientA),
    ).toThrow(TenantScopeError);
  });

  it("scopes deleteMany", () => {
    const out = applyTenantScope("Contact", "deleteMany", {}, clientA);
    expect(out.where).toEqual({ AND: [{ practiceId: "p1", clientId: "cA" }] });
  });

  it("the audit log is append-only", () => {
    expect(() => applyTenantScope("AuditLog", "update", { where: { id: "a" }, data: {} }, owner)).toThrow(/append-only/);
    expect(() => applyTenantScope("AuditLog", "deleteMany", {}, owner)).toThrow(/append-only/);
    const out = applyTenantScope("AuditLog", "create", { data: { action: "x" } }, clientA);
    expect(out.data).toEqual({ action: "x", practiceId: "p1" });
  });

  it("practices cannot be created or deleted", () => {
    expect(() => applyTenantScope("Practice", "create", { data: {} }, owner)).toThrow(TenantScopeError);
    expect(() => applyTenantScope("Practice", "delete", { where: { id: "p1" } }, owner)).toThrow(TenantScopeError);
  });

  it("upsert scopes where and stamps create", () => {
    const out = applyTenantScope(
      "ClientService",
      "upsert",
      { where: { id: "s1" }, create: { service: "PAYROLL", clientId: "cA" }, update: { enabled: true } },
      clientA,
    );
    expect(out.where).toEqual({ id: "s1", AND: [{ practiceId: "p1", clientId: "cA" }] });
    expect(out.create).toEqual({ service: "PAYROLL", clientId: "cA", practiceId: "p1" });
  });

  it("rejects raw or unknown operations", () => {
    expect(() => applyTenantScope("Invoice", "$queryRaw", {}, owner)).toThrow(TenantScopeError);
  });
});
