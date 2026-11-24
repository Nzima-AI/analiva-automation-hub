import { NextResponse, type NextRequest } from "next/server";
import { rootDb } from "@aah/db";

export const dynamic = "force-dynamic";

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f6f7f9;color:#14171f}main{max-width:28rem;margin:12vh auto;padding:2rem 1.5rem;background:#fff;border:1px solid #e3e6ea;border-radius:12px}h1{font-size:1.25rem;margin:0 0 .5rem}button{min-height:44px;padding:0 1.25rem;border:0;border-radius:8px;background:#0b7fa8;color:#fff;font:inherit;cursor:pointer}button:hover{background:#096c8f}</style></head>
<body><main>${body}</main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } },
  );

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function leadFor(token: string) {
  const lead = await rootDb().marketingLead.findUnique({ where: { token }, select: { id: true, practiceId: true, optedOutAt: true, practice: { select: { name: true } } } });
  return lead && { ...lead, practice: { name: esc(lead.practice.name) } };
}

/** Shows a button instead of unsubscribing on GET, so link scanners in mail filters can't opt people out. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const lead = await leadFor((await params).token);
  if (!lead) return page("Link not found", "<h1>This link isn't valid</h1><p>It may have been copied incompletely.</p>");
  if (lead.optedOutAt) return page("Unsubscribed", `<h1>You're unsubscribed</h1><p>${lead.practice.name} won't send you marketing emails.</p>`);
  return page("Unsubscribe", `<h1>Stop marketing emails from ${lead.practice.name}?</h1><p>You'll still get messages about work you've asked for.</p><form method="post"><button type="submit">Unsubscribe</button></form>`);
}

/** The button above, and mail apps' one-click unsubscribe (RFC 8058). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const lead = await leadFor((await params).token);
  if (!lead) return page("Link not found", "<h1>This link isn't valid</h1>");
  if (!lead.optedOutAt) {
    await rootDb().$transaction([
      rootDb().marketingLead.updateMany({ where: { id: lead.id }, data: { optedOutAt: new Date() } }),
      rootDb().auditLog.create({ data: { practiceId: lead.practiceId, actorType: "SYSTEM", actorLabel: "Unsubscribe link", action: "lead.opted_out", entityType: "MarketingLead", entityId: lead.id, metadata: { channel: "EMAIL" } } }),
    ]);
  }
  return page("Unsubscribed", `<h1>You're unsubscribed</h1><p>${lead.practice.name} won't send you marketing emails again.</p>`);
}
