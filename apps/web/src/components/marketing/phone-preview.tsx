"use client";

import { useMemo, useState } from "react";
import { ArrowSquareOut, CaretLeft, CaretRight, Checks, ImageSquare, SealCheck } from "@phosphor-icons/react";

export interface PreviewTemplate {
  name: string;
  bodyText: string;
  header?: string | null;
  quickReplies?: string[];
  urlButton?: boolean;
  carousel?: boolean;
}

const fill = (text: string, values: string[]) => text.replace(/\{\{(\d+)\}\}/g, (m, n: string) => values[Number(n) - 1] ?? m);

/**
 * A WhatsApp phone showing the message exactly as one contact will get it, with the
 * practice's verified name, header media, buttons and carousel cards. Flip through contacts.
 */
export function PhonePreview({
  practiceName,
  template,
  params,
  contacts,
  link = "analiva.app/r/…",
  headerMediaUrl,
}: {
  practiceName: string;
  template: PreviewTemplate | null;
  params: string[];
  contacts: Array<{ name: string; company: string }>;
  link?: string;
  headerMediaUrl?: string | null;
}) {
  const [i, setI] = useState(0);
  const people = contacts.length ? contacts : [{ name: "Thandi Nkosi", company: "Nkosi Trading" }];
  const who = people[i % people.length]!;
  const values = useMemo(
    () => params.map((p) => (p === "firstName" ? who.name.split(" ")[0]! : p === "name" ? who.name : p === "company" ? who.company || "your business" : p === "link" ? link : p)),
    [params, who, link],
  );
  const time = new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });

  return (
    <div className="mx-auto w-full max-w-[320px]" data-tour="phone-preview">
      <div className="rounded-[42px] border-[10px] border-[#111827] bg-[#111827] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.55)]">
        <div className="overflow-hidden rounded-[32px] bg-[#efeae2]">
          <div className="flex items-center gap-2.5 bg-[#075e54] px-3 pb-2.5 pt-6 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-xs font-semibold">{practiceName.slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 truncate text-[13px] font-semibold">{practiceName}<SealCheck size={14} weight="fill" className="shrink-0 text-[#25d366]" /></span>
              <span className="block text-[10.5px] text-white/75">Business account</span>
            </span>
          </div>
          <div className="min-h-[380px] space-y-2 px-3 py-4" style={{ backgroundImage: "radial-gradient(rgb(0 0 0/0.035) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
            <p className="mx-auto w-fit rounded-md bg-[#d9fdd3]/80 px-2 py-0.5 text-[10px] text-[#54656f]">Today</p>
            {template ? (
              <div className="max-w-[92%] rounded-lg rounded-tl-none bg-white text-[13px] leading-[1.35] text-[#111b21] shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]">
                {template.header && template.header !== "TEXT" && (
                  <div className="m-1 grid h-32 place-items-center overflow-hidden rounded-md bg-[#d1d7db] text-[#54656f]">
                    {headerMediaUrl && template.header === "IMAGE"
                      ? <img src={headerMediaUrl} alt="" className="h-full w-full object-cover" />
                      : <span className="flex items-center gap-1.5 text-xs"><ImageSquare size={18} /> {template.header.toLowerCase()} header</span>}
                  </div>
                )}
                <p className="whitespace-pre-wrap px-2.5 pb-1 pt-1.5">{fill(template.bodyText, values)}</p>
                <p className="flex items-center justify-end gap-1 px-2 pb-1 text-[10px] text-[#667781]">{time}<Checks size={14} className="text-[#53bdeb]" /></p>
                {template.urlButton && <p className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-[13px] font-medium text-[#027eb5]"><ArrowSquareOut size={14} /> Open my link</p>}
                {template.quickReplies?.map((b) => <p key={b} className="border-t border-[#e9edef] py-2 text-center text-[13px] font-medium text-[#027eb5]">{b}</p>)}
              </div>
            ) : (
              <p className="pt-24 text-center text-sm text-[#54656f]">Choose a template to see the message.</p>
            )}
            {template?.carousel && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {["Reports", "VAT", "Payroll"].map((card) => (
                  <div key={card} className="w-[150px] shrink-0 rounded-lg bg-white text-[12px] shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]">
                    <div className="m-1 h-20 rounded-md bg-[#d1d7db]" />
                    <p className="px-2 pb-1 font-medium">{card}</p>
                    <p className="border-t border-[#e9edef] py-1.5 text-center font-medium text-[#027eb5]">Learn more</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <button type="button" onClick={() => setI((n) => (n - 1 + people.length) % people.length)} className="grid h-11 w-11 place-items-center rounded-full border border-line hover:bg-subtle" aria-label="Previous contact"><CaretLeft size={16} /></button>
        <span className="min-w-0 truncate text-center text-muted">As <b className="text-ink">{who.name}</b> sees it</span>
        <button type="button" onClick={() => setI((n) => (n + 1) % people.length)} className="grid h-11 w-11 place-items-center rounded-full border border-line hover:bg-subtle" aria-label="Next contact"><CaretRight size={16} /></button>
      </div>
    </div>
  );
}
