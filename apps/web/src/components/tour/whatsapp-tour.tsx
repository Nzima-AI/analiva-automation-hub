"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass } from "@phosphor-icons/react";
import { Button } from "@/components/ui";

const START = "analiva-start-whatsapp-tour";
const KEY = "analiva-whatsapp-tour";

/** Each step highlights a real part of a page ([data-tour] attribute) and explains it. */
const STEPS = [
  { path: "/marketing", target: "kpis", title: "Your WhatsApp marketing, at a glance", body: "Messages sent today, how many people read them, replies waiting and new sign-ups this week. Everything here updates on its own." },
  { path: "/marketing", target: "mission-control", title: "Mission control", body: "Watch a campaign as it happens: sent, delivered, read, clicked, signed up. The forecast estimates where it will end, and the cost shows what you've spent per sign-up." },
  { path: "/marketing", target: "hot-leads", title: "Who to phone today", body: "The warmest people who haven't signed up yet, scored from their reads, clicks and replies, with the hour they usually read WhatsApp." },
  { path: "/marketing", target: "best-times", title: "When your clients respond", body: "The Hub learns which days and hours bring results, and can send each person at the time they usually read." },
  { path: "/marketing/campaigns", target: "phone-preview", title: "See it before they do", body: "The message exactly as each client will see it, with their name filled in, your verified business name, images and buttons. Flip through your contacts." },
  { path: "/marketing/campaigns", target: "campaign-options", title: "Smart sending", body: "Best time per person, quiet hours and public holidays, Meta's daily limit spread over days, an A/B test that picks the winner, and the cost before you send." },
  { path: "/marketing/inbox", target: "inbox", title: "Every reply in one inbox", body: "Replies arrive sorted (interested, price questions, call-backs, opt-outs). Answer with saved replies, assign a colleague, and STOP is handled for you." },
  { path: "/marketing/automations", target: "automations", title: "Set it once, it keeps working", body: "Follow-up sequences, VAT and payroll reminders on WhatsApp at the cheaper utility rate, a referral link for every client, and your WhatsApp QR code." },
  { path: "/marketing/analytics", target: "heatmap", title: "Analytics that tell you what to do", body: "Results by day and hour, how fast people read, campaigns compared, segments and regions, engagement levels and the return on every rand." },
  { path: "/marketing/settings", target: "settings", title: "Safety and control", body: "Monthly budget cap, quiet hours, automatic pause when opt-outs climb, Meta's quality rating and limits, and demo mode to try everything first." },
] as const;

export function WhatsAppTourButton() {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event(START))}>
      <Compass size={16} weight="duotone" aria-hidden /> Take the tour
    </Button>
  );
}

export function WhatsAppTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  const go = useCallback((n: number | null) => {
    try {
      if (n == null) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, String(n));
    } catch {}
    setStep(n);
    if (n != null && STEPS[n] && STEPS[n].path !== pathname) router.push(STEPS[n].path);
  }, [pathname, router]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved != null) setStep(Number(saved));
    } catch {}
    const start = () => go(0);
    window.addEventListener(START, start);
    return () => window.removeEventListener(START, start);
  }, [go]);

  const current = step == null ? null : STEPS[step];
  useLayoutEffect(() => {
    if (!current || current.path !== pathname) { setBox(null); return; }
    let tries = 0;
    let raf = 0;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        window.setTimeout(() => setBox(el.getBoundingClientRect()), 350);
      } else if (tries++ < 40) raf = window.setTimeout(find, 100);
      else setBox(null);
    };
    find();
    const onResize = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
      if (el) setBox(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => { window.clearTimeout(raf); window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onResize, true); };
  }, [current, pathname]);

  useEffect(() => {
    if (step == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") go(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go]);

  if (step == null || !current) return null;
  const pad = 8;
  const cardW = Math.min(360, window.innerWidth - 32);
  // Tall elements (the phone, long cards): put the card beside them, not on top.
  const tall = box && box.height > window.innerHeight - 280;
  const side = tall && box ? (box.left - cardW - 24 >= 16 ? box.left - cardW - 24 : box.right + 24 + cardW <= window.innerWidth - 16 ? box.right + 24 : null) : null;
  const cardTop = !box ? window.innerHeight / 2 - 110 : side != null ? Math.max(16, Math.min(box.top, window.innerHeight - 260)) : box.bottom + 16 + 220 < window.innerHeight ? box.bottom + 16 : Math.max(16, box.top - 236);
  const cardLeft = !box ? window.innerWidth / 2 - cardW / 2 : side ?? Math.min(Math.max(16, box.left), window.innerWidth - cardW - 16);

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-labelledby="wa-tour-title">
      {box ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-4 ring-brand transition-all duration-300"
          style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: "0 0 0 9999px rgb(8 12 20 / 0.62)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(8_12_20/0.62)]" />
      )}
      <div className="absolute w-[min(360px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-5 shadow-2xl" style={{ top: cardTop, left: cardLeft }}>
        <p className="text-xs font-medium text-brand-text">WhatsApp marketing tour · {step + 1} of {STEPS.length}</p>
        <h2 id="wa-tour-title" className="mt-1 text-lg font-semibold tracking-tight">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-2">{current.body}</p>
        <div className="mt-3 flex gap-1" aria-hidden>{STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />)}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => go(null)}>Skip tour</Button>
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="secondary" size="sm" onClick={() => go(step - 1)}>Back</Button>}
            <Button type="button" size="sm" onClick={() => go(step + 1 < STEPS.length ? step + 1 : null)}>{step + 1 < STEPS.length ? "Next" : "Finish"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
