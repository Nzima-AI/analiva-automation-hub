"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page's data every few seconds so live numbers move without a reload. */
export function LiveRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
