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

// Hide reveal blocks until GSAP animates them in (only when motion is allowed).
// The timeout guarantees content shows even if scripts fail to load.
const revealScript = `(function(){try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches){var d=document.documentElement;d.classList.add('reveal-pending');setTimeout(function(){d.classList.remove('reveal-pending');d.classList.add('preloaded')},3500)}else{document.documentElement.classList.add('preloaded')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: revealScript }} />
      </head>
      <body className="min-h-screen">
        <div id="app-preloader" role="status" aria-label="Loading">
          <div className="pl-inner flex flex-col items-center">
            <div className="pl-mark">A</div>
            <div className="pl-track">
              <div className="pl-bar" />
            </div>
            <p className="pl-caption">Analiva Automation Hub</p>
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
