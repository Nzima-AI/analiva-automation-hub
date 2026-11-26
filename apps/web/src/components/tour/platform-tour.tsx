"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BookOpen, Broadcast, ChartLineUp, ChatsCircle, Clock, Compass, DeviceMobile, Fire, Flask, Gauge, ListChecks,
  Funnel, GearSix, MagnifyingGlass, PaperPlaneTilt, Phone, QrCode, Repeat, Robot, Scan, SquaresFour, Tray, UsersThree, WhatsappLogo, X, type Icon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui";

/*
 * The guided tour: a spotlight that glides between real features of the Hub, with a short story for
 * each. It moves through the app itself, so the person watching sees the actual screens, not pictures.
 * Same design as the Illu Projects suite tour (welcome splash, gliding spotlight, finish splash).
 */

const OPEN_TOUR = "analiva-open-platform-tour";

type Step =
  | { splash: "welcome" | "finish" }
  | { href: string; target: string; icon: Icon; title: string; body: string; points?: Array<[Icon, string]>; desktop?: boolean; splash?: undefined };

const STAFF: Step[] = [
  { splash: "welcome" },
  // The practice
  { href: "/", target: '[data-tour="dash-hero"]', icon: Gauge, title: "Your practice at a glance", body: "Start each day here. It shows what's waiting for review, what was captured this month and how much filed itself without a person. Click any figure to open the work behind it." },
  { href: "/", target: ".desktop-sidebar", icon: SquaresFour, title: "Everything in one menu", body: "Inbox, review, clients, books, deadlines and WhatsApp marketing all work from the same records. A number on a menu item means something there needs you.", desktop: true },
  { href: "/", target: '[data-tour="wa-band"]', icon: WhatsappLogo, title: "WhatsApp, front and centre", body: "Today's sends, read rate, replies waiting and sign-ups this week, straight on the dashboard. Click the band to open mission control." },
  // WhatsApp marketing
  { href: "/marketing", target: '[data-tour="kpis"]', icon: Broadcast, title: "Mission control", body: "The home of WhatsApp marketing. Check it each morning: what went out, how many read it, who replied and who signed up, with spend against your monthly budget.", points: [[PaperPlaneTilt, "Sent, read and replied, live"], [Fire, "Sign-ups this week"], [Gauge, "Spend against budget; sending pauses at the limit"]] },
  { href: "/marketing", target: '[data-tour="mission-control"]', icon: ChartLineUp, title: "Watch a campaign land", body: "While a campaign runs, follow it from sent to delivered, read, clicked and signed up. The Hub forecasts where it will end and shows the cost per sign-up. Open Live wall to put it on a big screen." },
  { href: "/marketing", target: '[data-tour="hot-leads"]', icon: Phone, title: "Who to phone today", body: "The warmest contacts who haven't signed up yet, scored from how they read, click and reply. Each shows the hour they usually read WhatsApp, so you know when to call." },
  { href: "/marketing/contacts", target: '[data-tour="import"]', icon: UsersThree, title: "Bring in your contacts", body: "Import a spreadsheet or your phone's contacts (up to 5,000 at a time), or press Sync my clients to add every Hub client. Permission is recorded per contact, as POPIA requires.", points: [[Tray, "CSV, Excel, Google, Outlook or phone (.vcf)"], [ListChecks, "WhatsApp and email permission kept separately"], [UsersThree, "Segments such as past client or payroll"]] },
  { href: "/marketing/contacts", target: '[data-tour="contacts"]', icon: MagnifyingGlass, title: "Every contact, with their history", body: "Search and filter by segment, stage or who you can reach. Open a contact to see their timeline (every campaign, WhatsApp message, note and call-back) and add a note after a call. Export CSV gives you everything with consent evidence." },
  { href: "/marketing/pipeline", target: '[data-tour="pipeline"]', icon: Funnel, title: "Your sales pipeline", body: "Contacts in columns from New to Won, warmest first, with an engagement badge on each. Move a contact as the conversation moves; Won marks them as signed up and counts towards your results." },
  { href: "/marketing/campaigns?new=whatsapp", target: '[data-tour="phone-preview"]', icon: DeviceMobile, title: "Write a campaign, see it on a phone", body: "Click New campaign, choose a Meta-approved template and the segment to send to. The phone shows the message exactly as each person gets it, with their name filled in; flip through contacts and check the cost before you send.", points: [[PaperPlaneTilt, "Send a test to your own phone first"], [ListChecks, "An owner approves before anything goes out"], [Clock, "Send now or schedule a date and time"]] },
  { href: "/marketing/campaigns?new=whatsapp", target: '[data-tour="campaign-options"]', icon: Clock, title: "Smart sending does the timing", body: "Leave Best time on and each person gets the message at the hour they usually read WhatsApp. Add an A/B test to try two messages on a sample first: the winner goes to everyone else.", points: [[Clock, "Quiet hours, Sundays and public holidays skipped"], [Flask, "A/B test with an automatic winner"], [DeviceMobile, "Image, video or document header; reply buttons"]] },
  { href: "/marketing/inbox", target: '[data-tour="inbox"]', icon: ChatsCircle, title: "Every reply in one inbox", body: "Replies arrive sorted as interested, price questions, call-backs, complaints or opt-outs. Answer with a saved reply, send their sign-up link, or assign the chat to a colleague. Replies within 24 hours of their message are free.", points: [[ChatsCircle, "Saved replies for common questions"], [UsersThree, "Assign chats to the team"], [Phone, "Call me back buttons become tasks"]] },
  { href: "/marketing/automations", target: '[data-tour="keywords"]', icon: Robot, title: "Keyword auto-replies", body: "Choose a word such as PRICE or VAT and the answer to send. When someone messages just that word, they get the reply at once, day or night, and can be added to a segment for follow-up." },
  { href: "/marketing/automations", target: '[data-tour="automations"]', icon: Repeat, title: "Follow-ups that run themselves", body: "Sequences follow up on their own, for example a second message three days later to people who read but didn't click. Compliance reminders send VAT201, EMP201 and CIPC deadlines to clients at the cheaper utility rate. Referral links track who brought whom." },
  { href: "/marketing/automations", target: '[data-tour="opt-in"]', icon: QrCode, title: "Grow your list with permission", body: "Switch on your sign-up page and share its link or QR code on your website, email signature and at reception. People join themselves, their consent is recorded, and they land in Contacts ready for your next campaign." },
  { href: "/marketing/analytics", target: '[data-tour="heatmap"]', icon: ChartLineUp, title: "The best day and hour to send", body: "A heatmap of when your clients read, click and sign up, learned from every campaign. Below it, compare campaigns, segments and regions, and see what each sign-up cost." },
  { href: "/marketing/settings", target: '[data-tour="settings"]', icon: GearSix, title: "Connect WhatsApp and set the rules", body: "The owner connects the practice's WhatsApp Business number here, once. Set the monthly budget, quiet hours and opt-out limit, and use demo mode to try everything without sending.", points: [[WhatsappLogo, "Meta Cloud API directly: no monthly fee"], [Gauge, "Budget, daily limit and auto-pause"], [Flask, "Demo mode for training and pitches"]] },
  // The rest of the Hub
  { href: "/review", target: '[data-tour="review-queue"]', icon: Scan, title: "Only the exceptions reach you", body: "Invoices from the inbox are read and filed automatically. Anything the Hub isn't sure about waits here, with the original beside the extracted fields. Confirm it in one click." },
  { href: "/books", target: '[data-tour="books"]', icon: BookOpen, title: "Books that follow the work", body: "Client books, bank lines and financial statements in the same workspace as the documents behind them." },
  { href: "/", target: '[data-tour="search"]', icon: MagnifyingGlass, title: "Find anything with Ctrl K", body: "Clients, invoices, amounts, dates and phone numbers from one search box, across every year, while the client is still on the phone.", desktop: true },
  { splash: "finish" },
];

const CLIENT: Step[] = [
  { splash: "welcome" },
  { href: "/portal", target: "main [data-reveal]", icon: Gauge, title: "Your business at a glance", body: "The figures your accountant shares with you, kept up to date." },
  { href: "/portal/documents", target: "main [data-reveal]", icon: Tray, title: "Send the right file", body: "Upload a requested statement, invoice or receipt, and find the documents your practice shares with you." },
  { href: "/portal/enquiries", target: "main [data-reveal]", icon: ChatsCircle, title: "Questions in one place", body: "Ask your accountant a question and follow the reply in the same thread." },
  { splash: "finish" },
];

const PAD = 10;
const isPhone = () => window.matchMedia("(max-width: 640px)").matches;
// Where the sticky top bar ends: nothing is spotlit under it.
const headerBottom = () => Math.max(0, ...[...document.querySelectorAll(".shell-toolbar")].map((e) => e.getBoundingClientRect().bottom));
const isTall = (r: DOMRect) => r.height > window.innerHeight * 0.55;
type Rect = { top: number; left: number; width: number; height: number };

function measure(sel: string): Rect | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const vh = window.innerHeight;
  const inHeader = !!el.closest(".shell-toolbar");
  const fixed = getComputedStyle(el).position === "sticky" || el.classList.contains("desktop-sidebar");
  const top = inHeader || fixed ? Math.max(4, r.top - PAD) : Math.max(headerBottom() + 6, r.top - PAD);
  let bottom = Math.min(vh - 8, r.bottom + PAD);
  // No room for the card above or below: shorten the spotlight to make room underneath.
  const need = 380;
  if (!inHeader && !fixed && !isPhone() && vh - bottom < need && top - headerBottom() < need) bottom = Math.max(top + 120, vh - need - 12);
  return { top, left: Math.max(8, r.left - PAD), width: Math.min(window.innerWidth - 16, r.width + PAD * 2), height: Math.max(40, bottom - top) };
}

function place(rect: Rect | null, card?: DOMRect) {
  const vw = window.innerWidth, vh = window.innerHeight, w = card?.width || 392, h = card?.height || 270, gap = 16;
  if (!rect || isPhone()) return null;
  const clampX = (x: number) => Math.min(vw - w - 16, Math.max(16, x));
  const clampY = (y: number) => Math.min(vh - h - 16, Math.max(16, y));
  if (vh - (rect.top + rect.height) > h + gap + 16) return { top: rect.top + rect.height + gap, left: clampX(rect.left) };
  if (rect.top > h + gap + 16) return { top: rect.top - h - gap, left: clampX(rect.left) };
  if (vw - (rect.left + rect.width) > w + gap + 16) return { top: clampY(rect.top), left: rect.left + rect.width + gap };
  if (rect.left > w + gap + 16) return { top: clampY(rect.top), left: rect.left - w - gap };
  return { top: clampY(vh - h - 24), left: clampX(vw - w - 24) };
}

// Glides the spotlight toward its target over ~460 ms (ease-out), frame by frame, in every browser.
function useGlide(target: Rect | null) {
  const [cur, setCur] = useState<Rect | null>(target);
  const from = useRef<Rect | null>(target);
  useEffect(() => {
    if (!target) {
      setCur(null);
      from.current = null;
      return undefined;
    }
    const start = from.current ?? target;
    const t0 = performance.now();
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 460;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3;
      const r = { top: start.top + (target.top - start.top) * e, left: start.left + (target.left - start.left) * e, width: start.width + (target.width - start.width) * e, height: start.height + (target.height - start.height) * e };
      from.current = r;
      setCur(r);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target?.top, target?.left, target?.width, target?.height]); // eslint-disable-line react-hooks/exhaustive-deps
  return cur;
}

/** Help and Mission control open the tour with this. */
export function TourLauncher({ label = "Take the tour", from }: { label?: string; from?: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TOUR, { detail: from }))}>
      <Compass size={16} weight="duotone" aria-hidden /> {label}
    </Button>
  );
}

export function PlatformTour({ userId, staff, demo = false }: { userId: string; staff: boolean; demo?: boolean }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);
  const storageKey = `analiva-tour-v2:${userId}:${staff ? "staff" : "client"}`;
  const all = staff ? STAFF : CLIENT;

  useEffect(() => {
    const openTour = (e: Event) => {
      const from = (e as CustomEvent<string | undefined>).detail;
      const at = from ? all.findIndex((s) => !s.splash && s.href.startsWith(from)) : 0;
      setStart(at > 0 ? at : 0);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR, openTour);
    // Opens by itself once per person and browser (every demo visitor sees it on their first visit).
    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(storageKey)) return;
        localStorage.setItem(storageKey, "seen");
      } catch {
        return;
      }
      setStart(0);
      setOpen(true);
    }, 900);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_TOUR, openTour);
    };
  }, [storageKey, all]);

  if (!open) return null;
  return <Tour key={start} steps={all} start={start} demo={demo} staff={staff} onClose={() => setOpen(false)} />;
}

function Tour({ steps: all, start, demo, staff, onClose }: { steps: Step[]; start: number; demo: boolean; staff: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phone] = useState(isPhone);
  const steps = all.filter((s) => s.splash || !(s.desktop && phone));
  const [i, setI] = useState(() => Math.max(0, steps.indexOf(all[start]!)));
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ready, setReady] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const spot = useGlide(rect);
  const step = steps[i]!;
  const real = steps.filter((s): s is Extract<Step, { href: string }> => !s.splash);
  const n = step.splash ? 0 : real.indexOf(step) + 1;
  const path = useRef(pathname);
  path.current = pathname;

  // Go to the step's page, wait for its target to render, then glide the spotlight to it.
  useEffect(() => {
    let alive = true, tries = 0;
    setReady(false);
    setRect(null);
    if (step.splash) {
      setReady(true);
      return undefined;
    }
    const want = step.href.split("?")[0]!;
    if (path.current !== want || step.href.includes("?")) router.push(step.href);
    const find = () => {
      if (!alive) return;
      const el = path.current === want ? document.querySelector(step.target) : null;
      if (el && el.getBoundingClientRect().height) {
        (el as HTMLElement).style.scrollMarginTop = `${headerBottom() + 20}px`;
        if (!el.classList.contains("desktop-sidebar")) el.scrollIntoView({ block: isTall(el.getBoundingClientRect()) ? "start" : "center", behavior: "smooth" });
        setTimeout(() => {
          if (alive) {
            setRect(measure(step.target));
            setReady(true);
          }
        }, 450);
      } else if (++tries < 80) setTimeout(find, 100);
      else {
        // Not on screen for this person: show the card on its own.
        setRect(null);
        setReady(true);
      }
    };
    setTimeout(find, 160);
    return () => {
      alive = false;
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the spotlight on its target as the page scrolls or resizes.
  useEffect(() => {
    if (step.splash) return undefined;
    let raf = 0;
    const upd = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setRect(measure(step.target)));
    };
    window.addEventListener("resize", upd);
    window.addEventListener("scroll", upd, true);
    return () => {
      window.removeEventListener("resize", upd);
      window.removeEventListener("scroll", upd, true);
      cancelAnimationFrame(raf);
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    setPos(place(rect, card.current?.getBoundingClientRect()));
  }, [rect, ready]);

  const next = useCallback(() => setI((x) => Math.min(steps.length - 1, x + 1)), [steps.length]);
  const back = useCallback(() => setI((x) => Math.max(0, x - 1)), []);
  const finish = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (step.splash === "finish") finish();
        else next();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [next, back, finish, step]);

  if (step.splash === "welcome") {
    const pills: Array<[Icon, string]> = staff
      ? [[WhatsappLogo, "WhatsApp marketing"], [Tray, "Inbox capture"], [Scan, "Review queue"], [UsersThree, "Clients"], [BookOpen, "Books"], [MagnifyingGlass, "Instant search"]]
      : [[Gauge, "Your figures"], [Tray, "Documents"], [ChatsCircle, "Enquiries"]];
    return createPortal(
      <div className="gt-splash" role="dialog" aria-modal="true" aria-label="Welcome to the Analiva Automation Hub">
        <i className="gt-orb a" /><i className="gt-orb b" /><i className="gt-orb c" />
        <div className="gt-welcome">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="gt-logo"><img src="/brand/analiva-mark.png" alt="" /></span>
          <small className="gt-kicker">{demo ? "Demo practice · sample data" : "Welcome"}</small>
          <h1>{staff ? "The whole practice, in one place" : "Your accountant, in one place"}</h1>
          <p>{staff ? "Inbox capture, client records, books and a full WhatsApp marketing CRM, working from the same records. About 5 minutes; use the arrow keys or Next." : "Your figures, documents and questions to your accountant, together."}</p>
          <div className="gt-pills">
            {pills.map(([P, l], k) => <span key={l} style={{ animationDelay: `${0.35 + k * 0.07}s` }}><P size={14} weight="bold" />{l}</span>)}
          </div>
          <div className="gt-cta">
            <button type="button" className="gt-btn primary" onClick={next} autoFocus>{staff ? "Take the full tour" : "Take the tour"} <ArrowRight size={18} weight="bold" /></button>
            {staff ? <button type="button" className="gt-btn ghost" onClick={() => setI(steps.findIndex((s) => !s.splash && s.href.startsWith("/marketing")))}>Just WhatsApp marketing</button> : null}
            <button type="button" className="gt-btn text" onClick={finish}>{demo ? "Explore on my own" : "Skip for now"}</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  if (step.splash === "finish") {
    return createPortal(
      <div className="gt-splash" role="dialog" aria-modal="true" aria-label="Tour complete">
        <i className="gt-orb a" /><i className="gt-orb b" />
        <div className="gt-welcome">
          <svg className="gt-done" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" /><path d="M25 41l10 10 21-22" /></svg>
          <h1>That&apos;s the Hub</h1>
          <p>{demo ? "Everything you saw runs on a sample practice. Click around freely: WhatsApp sending is simulated and nothing is sent for real. Jump back to any step below." : "Jump back to any step below, or replay the tour any time from Help or Mission control."}</p>
          <div className="gt-pills">
            {real.map((s, k) => {
              const P = s.icon;
              return <button type="button" key={s.title} style={{ animationDelay: `${0.2 + k * 0.05}s` }} onClick={() => setI(steps.indexOf(s))}><P size={14} weight="bold" />{s.title.replace(/ with Ctrl K|, front and centre|, see it on a phone/, "")}</button>;
            })}
          </div>
          <div className="gt-cta">
            <button type="button" className="gt-btn primary" onClick={finish} autoFocus>Start exploring <ArrowRight size={18} weight="bold" /></button>
            <button type="button" className="gt-btn ghost" onClick={() => setI(1)}>Replay</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const page = step as Extract<Step, { href: string }>;
  const I = page.icon;
  return createPortal(
    <div className="gt" role="dialog" aria-modal="true" aria-label={page.title}>
      {spot ? (
        <>
          {/* Four dark panels frame the spotlight: plain boxes, so Safari draws them the same as Chrome. */}
          <div className="gt-shade" style={{ top: 0, left: 0, right: 0, height: spot.top }} />
          <div className="gt-shade" style={{ top: spot.top + spot.height, left: 0, right: 0, bottom: 0 }} />
          <div className="gt-shade" style={{ top: spot.top, left: 0, width: spot.left, height: spot.height }} />
          <div className="gt-shade" style={{ top: spot.top, left: spot.left + spot.width, right: 0, height: spot.height }} />
          <div className="gt-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}><i /></div>
        </>
      ) : <div className="gt-dim" />}
      <div ref={card} key={i} className={`gt-card${ready ? " in" : ""}${pos ? "" : " docked"}`} style={pos ? { top: pos.top, left: pos.left } : undefined}>
        <header>
          <span className="gt-ic"><I size={18} weight="bold" /></span>
          <small>{n} of {real.length}</small>
          <button type="button" className="gt-x" onClick={finish} aria-label="End the tour"><X size={16} /></button>
        </header>
        <h2>{page.title}</h2>
        <p>{page.body}</p>
        {page.points ? <ul>{page.points.map(([P, t]) => <li key={t}><span><P size={13} weight="bold" /></span>{t}</li>)}</ul> : null}
        <div className="gt-progress" aria-hidden="true">{real.map((s, k) => <i key={s.title} className={k < n ? "on" : ""} />)}</div>
        <footer>
          <button type="button" className="gt-btn text" onClick={finish}>Skip tour</button>
          <span className="grow" />
          <button type="button" className="gt-btn ghost icon" onClick={back} aria-label="Previous"><ArrowLeft size={16} weight="bold" /></button>
          <button type="button" className="gt-btn primary" onClick={next}>{n === real.length ? "Finish" : "Next"} <ArrowRight size={16} weight="bold" /></button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
