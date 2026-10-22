import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Analiva Automation Hub", template: "%s · Analiva Automation Hub" },
  description: "Practice platform: clients, invoices, documents and instant lookup.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
