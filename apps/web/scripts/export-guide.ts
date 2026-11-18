// Writes docs/USER_GUIDE.md from the in-app guide (src/lib/guide.ts).
// Usage (from apps/web): npx tsx --tsconfig tsconfig.json scripts/export-guide.ts
import fs from "node:fs";
import path from "node:path";
import { GUIDE } from "../src/lib/guide.ts";

const part = (audience: "staff" | "client", heading: string) =>
  [`## ${heading}`, "", ...GUIDE.filter((s) => s.audience === audience).flatMap((s) => [`### ${s.title}`, "", `_${s.summary}_`, "", s.body, ""])].join("\n");

const md = [
  "# Analiva Automation Hub: user guide",
  "",
  "Generated from `apps/web/src/lib/guide.ts`, the same text shown in the app under **Help**. Edit it there and run `scripts/export-guide.ts`.",
  "",
  part("staff", "For the practice"),
  part("client", "For clients (portal)"),
].join("\n");

const out = path.resolve(process.cwd(), "../../docs/USER_GUIDE.md");
fs.writeFileSync(out, md.replace(/\n{3,}/g, "\n\n"));
console.log("wrote", out);
