"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:text-ink" title="Print or save as PDF">
      <Printer className="h-3.5 w-3.5" /> Print / PDF
    </button>
  );
}
