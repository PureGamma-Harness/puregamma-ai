"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "@/components/chrono/motion";
import { resolveChronoTier, useChronoTierReactive, useHtmlDataset } from "@/lib/chrono";

/**
 * A brief positional settle for noninteractive heading content. Inputs and
 * actions stay visible and usable instead of waiting for a staged reveal.
 *
 * Runs only in Glass + allowed-motion desktop. Otherwise it is a no-op and
 * content is fully visible. Cleanup is automatic through the useGSAP context
 * revert.
 */
export function ChronoEntrance({ children, className = "" }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tier = useChronoTierReactive();
  const style = useHtmlDataset("visualStyle");

  useGSAP(() => {
    // Reactive hooks begin with hydration-safe defaults. Consult the actual
    // document and device before hiding any server-rendered content.
    if (document.documentElement.dataset.visualStyle !== "glass" || resolveChronoTier() === "static" || !rootRef.current) return;
    const els = gsap.utils.toArray<HTMLElement>(rootRef.current.querySelectorAll("[data-chrono-enter]"))
      .filter((el) => !el.matches("input, button, textarea, a, [tabindex]") && !el.querySelector("input, button, textarea, a, [tabindex]"));
    if (!els.length) return;
    gsap.fromTo(els, { y: 6 }, { y: 0, duration: 0.26, stagger: 0.035, ease: "power2.out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, { scope: rootRef, dependencies: [tier, style], revertOnUpdate: true });

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
