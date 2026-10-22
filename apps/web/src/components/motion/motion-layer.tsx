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

  // Preloader exit (first paint only).
  useEffect(() => {
    const el = document.getElementById("app-preloader");
    const done = () => document.documentElement.classList.add("preloaded");
    if (!el) return done();
    if (reducedMotion()) return done();
    const tl = gsap.timeline({ onComplete: done });
    tl.to(el.querySelector(".pl-inner"), { y: -8, opacity: 0, duration: 0.35, ease: "power2.in", delay: 0.15 }).to(el, { opacity: 0, duration: 0.35, ease: "power1.out" }, "-=0.1");
    return () => {
      tl.kill();
    };
  }, []);

  // Reveal choreography on route change.
  useEffect(() => {
    const html = document.documentElement;
    const targets = gsap.utils.toArray<HTMLElement>("main [data-reveal]");
    html.classList.remove("reveal-pending");
    if (reducedMotion() || targets.length === 0) {
      gsap.set(targets, { clearProps: "all" });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.7, ease: EASE, stagger: { each: 0.045, from: "start" }, delay: first.current ? 0.25 : 0, clearProps: "transform" },
      );
    });
    first.current = false;
    return () => ctx.revert();
  }, [pathname]);

  // Progress bar: start on internal link clicks / form submits, finish when the URL changes.
  useEffect(() => {
    const start = () => {
      if (!bar.current || reducedMotion()) return;
      progress.current?.kill();
      gsap.set(bar.current, { scaleX: 0, opacity: 1 });
      progress.current = gsap.to(bar.current, { scaleX: 0.85, duration: 6, ease: "power3.out" });
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

  return <div id="route-progress" ref={bar} aria-hidden />;
}
