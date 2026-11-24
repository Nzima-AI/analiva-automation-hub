import type { ReactNode } from "react";

export function RowDisclosure() {
  return (
    <details className="record-row-disclosure">
      <summary aria-label="Row details"><span aria-hidden="true" /></summary>
    </details>
  );
}

export function ResponsiveCellContent({ label, primary, children }: { label: ReactNode; primary?: boolean; children: ReactNode }) {
  return (
    <>
      <span className="record-field-label">{label || "Actions"}</span>
      <div className="record-field-value">{children}</div>
      {primary ? <RowDisclosure /> : null}
    </>
  );
}

export function ReportTableDisclosure({ children }: { children: ReactNode }) {
  return (
    <div className="report-table-disclosure">
      <details className="report-table-toggle" open>
        <summary>Table details <span aria-hidden="true" /></summary>
      </details>
      <div className="report-table-content">{children}</div>
    </div>
  );
}
