"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChartBar, Check, Compass, FunnelSimple, PaperPlaneTilt, Scan, Sparkle, Tray, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { clientTour, staffTour } from "./tour-content";

const OPEN_TOUR = "analiva-open-platform-tour";
const icons = { inbox: Tray, review: Scan, crm: FunnelSimple, report: ChartBar, ready: PaperPlaneTilt, growth: Sparkle };

export function TourLauncher() {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_TOUR))}>
      <Compass size={16} weight="duotone" aria-hidden /> Platform tour
    </Button>
  );
}

export function PlatformTour({ userId, staff }: { userId: string; staff: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dismissed = useRef(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = staff ? staffTour : clientTour;
  const step = steps[stepIndex]!;
  const Graphic = icons[step.icon];
  const last = stepIndex === steps.length - 1;
  const storageKey = `analiva-platform-tour-v1:${userId}:${staff ? "staff" : "client"}`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    function open() {
      if (!element || element.open) return;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setStepIndex(0);
      element.showModal();
      heading.current?.focus();
    }
    window.addEventListener(OPEN_TOUR, open);
    const timer = window.setTimeout(() => {
      if (dismissed.current) return;
      try {
        if (localStorage.getItem(storageKey)) return;
      } catch {}
      open();
    }, 1000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_TOUR, open);
    };
  }, [storageKey]);

  useEffect(() => {
    if (dialog.current?.open) heading.current?.focus();
  }, [stepIndex]);

  function remember() {
    dismissed.current = true;
    try { localStorage.setItem(storageKey, "seen"); } catch {}
  }

  function close() {
    remember();
    dialog.current?.close();
  }

  return (
    <dialog
      ref={dialog}
      className="platform-tour no-print"
      aria-labelledby="platform-tour-heading"
      onCancel={remember}
      onClose={() => {
        remember();
        returnFocus.current?.focus();
      }}
    >
      <div className="tour-frame">
        <button type="button" className="tour-close shell-icon" aria-label="Close tour" onClick={close}>
          <X size={20} aria-hidden />
        </button>
        <div className="tour-story" key={stepIndex}>
          <div className="tour-copy">
            <div className="tour-step-caption"><Compass size={16} weight="duotone" aria-hidden /> {step.area}</div>
            <h2 ref={heading} tabIndex={-1} id="platform-tour-heading" className="editorial-heading">{step.title}</h2>
            <p>{step.description}</p>
            <Link className="tour-destination" href={step.href} onClick={close}>
              {step.action} <ArrowUpRight size={15} aria-hidden />
            </Link>
          </div>
          <div className="tour-visual">
            <Graphic size={47} weight="duotone" className="tour-feature-icon" aria-hidden />
            <ul>
              {step.proof.map((item) => <li key={item}><Check size={15} aria-hidden /> {item}</li>)}
            </ul>
          </div>
        </div>
        <div className="tour-controls">
          <div className="tour-progress">
            <span>Step {stepIndex + 1} of {steps.length}</span>
            <div className="tour-progress-track" aria-hidden>
              {steps.map((item, index) => <span key={item.area} data-active={index <= stepIndex} />)}
            </div>
          </div>
          <div className="tour-navigation">
            <button type="button" className="tour-skip" onClick={close}>Skip tour</button>
            {stepIndex > 0 ? <Button type="button" size="sm" variant="secondary" onClick={() => setStepIndex(stepIndex - 1)}><ArrowLeft size={15} aria-hidden /> Back</Button> : null}
            <Button type="button" size="sm" onClick={last ? close : () => setStepIndex(stepIndex + 1)}>
              {last ? "Finish tour" : "Next"} <ArrowRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
