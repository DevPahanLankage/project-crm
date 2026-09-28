"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "compact-primary", pendingText = "Saving...", disabled = false }: { children: React.ReactNode; className?: string; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={disabled || pending}>{pending ? pendingText : children}</button>;
}
