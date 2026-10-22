"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Counts the number inside a formatted string up from zero when it first appears
 * ("R 12 345,67", "84%", "17"). Keeps the surrounding text and SA number format.
 * Communicates: these are live figures, freshly calculated.
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const m = /(-?)(\d[\d\s ]*)(?:,(\d+))?/.exec(value);
    if (!m) return;
    const decimals = m[3]?.length ?? 0;
    const target = Number(`${m[1]}${m[2]!.replace(/[\s ]/g, "")}${decimals ? `.${m[3]}` : ""}`);
    if (!Number.isFinite(target) || target === 0) return;
    const before = value.slice(0, m.index);
    const after = value.slice(m.index + m[0].length);
    const fmt = (n: number) => {
      const fixed = Math.abs(n).toFixed(decimals);
      const [whole, frac] = fixed.split(".");
      const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return `${before}${n < 0 ? "-" : ""}${grouped}${frac ? `,${frac}` : ""}${after}`;
    };
    const state = { n: 0 };
    const tween = gsap.to(state, {
      n: target,
      duration: 1.1,
      ease: "expo.out",
      delay: 0.15,
      onUpdate: () => {
        el.textContent = fmt(state.n);
      },
      onComplete: () => {
        el.textContent = value;
      },
    });
    return () => {
      tween.kill();
      el.textContent = value;
    };
  }, [value]);

  return <span ref={ref}>{value}</span>;
}
