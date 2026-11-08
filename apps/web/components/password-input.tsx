"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";

export function PasswordInput({
  value,
  onChange,
  placeholder,
  minLength,
  autoComplete,
  id,
  name,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minLength?: number;
  autoComplete?: string;
  id?: string;
  name?: string;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  const zh = useLocale() === "zh";
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        aria-label={id ? undefined : placeholder}
        aria-describedby={describedBy}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border border-border-pg bg-bg-panel-muted px-3 py-2 pr-10 text-sm text-text-pg placeholder:text-text-pg-dim outline-none focus:border-border-pg-strong rounded-lg"
        required
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? (zh ? "隐藏密码" : "Hide password") : (zh ? "显示密码" : "Show password")}
        aria-pressed={visible}
        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-text-pg-dim transition hover:text-text-pg"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
