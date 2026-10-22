import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

/**
 * The raw, unscoped client. Only for bootstrap work that has no tenant yet:
 * resolving the signed-in user, seeding, and scripts. Everything else uses tenantDb(ctx).
 */
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { __aahPrisma?: PrismaClient };

let instance: PrismaClient | undefined = globalForPrisma.__aahPrisma;

export function rootDb(): PrismaClient {
  if (!instance) {
    instance = createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.__aahPrisma = instance;
  }
  return instance;
}
