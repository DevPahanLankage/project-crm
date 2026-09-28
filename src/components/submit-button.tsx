"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "compact-primary", pendingText = "Saving..." }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? pendingText : children}</button>;
}
