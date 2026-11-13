import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={clsx("pg-card", className)}>{children}</section>;
}

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      className={clsx(
        "pg-button",
        variant === "primary" && "pg-button-primary",
        variant === "secondary" && "pg-button-secondary",
        variant === "danger" && "pg-button-danger",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("pg-input", className)} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("pg-input", className)} {...props}>{children}</select>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block font-medium text-text-pg">{label}</span>
      {children}
      {hint ? <span className="pg-metadata mt-2 block">{hint}</span> : null}
    </label>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "danger" }) {
  return (
    <span
      className={clsx(
        "pg-badge",
        tone === "neutral" && "bg-bg-panel-muted text-text-pg-muted",
        tone === "positive" && "bg-[var(--pg-positive-soft)] text-status-positive",
        tone === "warning" && "bg-[var(--pg-warning-soft)] text-status-warning",
        tone === "danger" && "bg-[var(--pg-danger-soft)] text-status-negative"
      )}
    >
      {children}
    </span>
  );
}

export function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="pg-page-header flex flex-wrap items-center justify-between gap-3">
      <h1 className="pg-page-title">{title}</h1>
      {meta ? <span className="pg-metadata">{meta}</span> : null}
    </div>
  );
}
