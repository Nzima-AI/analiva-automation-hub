import { Suspense } from "react";
import type { Metadata } from "next";
// Fonts are bundled with the app, not fetched at build time.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { MotionLayer } from "@/components/motion/motion-layer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Analiva Automation Hub", template: "%s · Analiva Automation Hub" },
  description: "Practice platform: inbox capture, client books, statements, VAT and deadlines.",
  robots: { index: false, follow: false },
};

// Apply preferences before paint. The first-visit intro never blocks interaction.
const appearanceScript = `(() => {
  const root = document.documentElement;
  try {
    const theme = localStorage.getItem("analiva-hub-theme");
    if (theme === "dark" || theme === "light") root.dataset.theme = theme;
    if (localStorage.getItem("analiva-hub-sidebar") === "collapsed") root.dataset.sidebar = "collapsed";
  } catch {}
  try {
    if (!sessionStorage.getItem("analiva-hub-intro") && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem("analiva-hub-intro", "seen");
      root.classList.add("intro-pending");
      setTimeout(() => root.classList.remove("intro-pending"), 1400);
    }
  } catch {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-screen">
        <div id="app-preloader" aria-hidden="true">
          <div className="pl-inner flex flex-col items-center">
            <div className="pl-mark"><span>A</span></div>
            <div className="pl-track">
              <div className="pl-bar" />
            </div>
            <p className="pl-caption">Analiva</p>
          </div>
        </div>
        <Suspense>
          <MotionLayer />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
