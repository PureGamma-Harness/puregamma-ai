"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

/** Native top-layer modality and focus return, with a deterministic Tab loop. */
export function OperationConfirmation({ open, title, description, target, confirmLabel, cancelLabel, busy, error, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  target: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, [open]);

  const containTab = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <dialog ref={dialog} tabIndex={-1} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} onKeyDown={containTab}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-h-[calc(100dvh_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-border-pg bg-bg-panel p-6 text-text-pg shadow-2xl backdrop:bg-black/55">
    <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
    <p className="mt-3 break-words rounded-lg border border-border-pg bg-bg-panel-muted px-3 py-2 text-sm font-medium">{target}</p>
    <p id={descriptionId} className="mt-3 text-sm leading-6 text-text-pg-muted">{description}</p>
    {error ? <p role="alert" className="mt-3 text-sm text-status-negative">{error}</p> : null}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button autoFocus type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-lg border border-border-pg px-4 py-2 text-sm font-medium disabled:opacity-50">{cancelLabel}</button>
      <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-status-negative px-4 py-2 text-sm font-medium text-status-negative disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}{confirmLabel}
      </button>
    </div>
  </dialog>;
}
