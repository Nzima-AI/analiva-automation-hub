import type { Metadata } from "next";
// Fonts are bundled with the app, not fetched at build time.
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Analiva Automation Hub", template: "%s · Analiva Automation Hub" },
  description: "Practice platform: inbox capture, client books, statements, VAT and deadlines.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
