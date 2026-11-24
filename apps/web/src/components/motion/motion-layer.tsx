"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";

const EASE = "expo.out";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One client island for all app-wide motion:
 * - preloader exit on first load
 * - staggered reveal of [data-reveal] blocks on every route change (hierarchy: header, stats, then cards)
 * - top progress bar while a navigation is in flight (feedback)
 * - cursor spotlight on [data-spotlight] surfaces (feedback), via one delegated pointer listener
 */
export function MotionLayer() {
  const pathname = usePathname();
  const search = useSearchParams();
  const bar = useRef<HTMLDivElement>(null);
  const progress = useRef<gsap.core.Tween | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    const preloader = document.getElementById("app-preloader");
    if (!preloader || !root.classList.contains("intro-pending")) return;
    const finish = () => root.classList.remove("intro-pending");
    if (reducedMotion()) return finish();

    const timeline = gsap.timeline({ onComplete: finish });
    timeline
      .from(preloader.querySelector(".pl-mark"), { y: 7, scale: 0.92, duration: 0.32, ease: "power3.out" })
      .to(preloader.querySelector(".pl-inner"), { y: -12, opacity: 0, duration: 0.29, ease: "power2.in" }, 0.27)
      .to(preloader, { opacity: 0, duration: 0.36, ease: "power2.out" }, 0.31);

    return () => { timeline.kill(); };
  }, []);

  useEffect(() => {
    if (reducedMotion()) return;
    const targets = gsap.utils.toArray<HTMLElement>("main [data-reveal]").filter((element) => {
      return element.getBoundingClientRect().top < window.innerHeight + 32;
    }).slice(0, 10);
    const intro = first.current && document.documentElement.classList.contains("intro-pending");
    first.current = false;
    if (!targets.length) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(targets, { opacity: 0, y: 13 }, {
        opacity: 1, y: 0, duration: 0.52, ease: EASE, stagger: 0.045,
        delay: intro ? 0.34 : 0, clearProps: "opacity,transform",
      });
    });
    return () => ctx.revert();
  }, [pathname]);

  // Progress bar: start on internal link clicks / form submits, finish when the URL changes.
  useEffect(() => {
    const start = () => {
      if (!bar.current || reducedMotion()) return;
      progress.current?.kill();
      gsap.set(bar.current, { scaleX: 0, opacity: 1 });
      progress.current = gsap.to(bar.current, {
        scaleX: 0.85, duration: 4, ease: "power3.out", overwrite: true,
        onComplete: () => {
          if (bar.current) gsap.to(bar.current, { opacity: 0, duration: 0.25, overwrite: "auto" });
          progress.current = null;
        },
      });
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      if (url.pathname.includes("/download") || url.pathname.includes("/export")) return;
      start();
    };
    const onSubmit = () => start();
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  useEffect(() => {
    if (!bar.current || !progress.current) return;
    progress.current.kill();
    progress.current = null;
    gsap.to(bar.current, { scaleX: 1, duration: 0.25, ease: "power2.out", onComplete: () => void gsap.to(bar.current, { opacity: 0, duration: 0.3 }) });
  }, [pathname, search]);

  // Spotlight: write the pointer position into CSS variables on the hovered surface.
  useEffect(() => {
    if (reducedMotion() || !matchMedia("(hover: hover)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-spotlight]");
      if (!el) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Magnetic primary buttons: a small pull toward the cursor, springing back on leave.
  useEffect(() => {
    if (reducedMotion() || !matchMedia("(hover: hover)").matches) return;
    const movers = new WeakMap<HTMLElement, { x: gsap.QuickToFunc; y: gsap.QuickToFunc }>();
    const get = (el: HTMLElement) => {
      let m = movers.get(el);
      if (!m) {
        m = { x: gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" }), y: gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" }) };
        movers.set(el, m);
      }
      return m;
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-magnetic]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const m = get(el);
      m.x(((e.clientX - r.left) / r.width - 0.5) * 8);
      m.y(((e.clientY - r.top) / r.height - 0.5) * 6);
    };
    const onOut = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-magnetic]");
      if (!el || el.contains(e.relatedTarget as Node)) return;
      const m = get(el);
      m.x(0);
      m.y(0);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return <div id="route-progress" ref={bar} aria-hidden />;
}
