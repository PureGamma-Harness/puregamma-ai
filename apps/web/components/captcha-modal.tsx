"use client";

import { useEffect, useId, useRef } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { PuzzleCaptcha, type CaptchaResult } from "@/components/puzzle-captcha";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function CaptchaModal({
  open,
  busy,
  error,
  resetKey,
  retryToken = 0,
  onSolved,
  onClose,
  onRefresh,
  labels,
  returnFocusTo,
}: {
  open: boolean;
  /** True while the solved offset is being verified with the server (login/register request in flight). */
  busy: boolean;
  /** Captcha-specific failure shown inside the modal; page-level errors are rendered by the caller. */
  error: string;
  /** Bump to remount the slider with a fresh puzzle. */
  resetKey: number;
  /** Bump to retry the SAME puzzle after a failed attempt. */
  retryToken?: number;
  onSolved: (result: CaptchaResult) => void;
  onClose: () => void;
  onRefresh: () => void;
  labels: { title: string; verifying: string; instruction: string; success: string; drag: string };
  returnFocusTo?: HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const zh = useLocale() === "zh";
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const opener = returnFocusTo || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, returnFocusTo]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[360px] overflow-y-auto rounded-2xl border border-border-pg bg-bg-panel p-5 text-text-pg shadow-2xl backdrop:bg-black/70"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="inline-flex items-center gap-2 text-sm font-semibold text-text-pg">
            <ShieldCheck className="h-4 w-4 text-text-pg-muted" />
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            autoFocus
            aria-label={zh ? "关闭验证" : "Close verification"}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-text-pg-dim transition hover:text-text-pg disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <p role="alert" className="border border-border-pg bg-bg-panel-muted px-3 py-2 text-xs text-status-negative rounded-lg">{error}</p>
        ) : null}

        <PuzzleCaptcha
          key={resetKey}
          verified={null}
          disabled={busy}
          onSolved={onSolved}
          onReset={onRefresh}
          retryToken={retryToken}
          labels={{ instruction: labels.instruction, success: labels.success, drag: labels.drag }}
        />

        {busy ? (
          <p role="status" className="flex items-center gap-2 text-xs text-text-pg-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            {labels.verifying}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
