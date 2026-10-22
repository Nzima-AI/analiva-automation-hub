import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Env lives at the repo root (.env) locally; Vercel/CI inject it directly.
config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct/session connection, not the transaction pooler.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
