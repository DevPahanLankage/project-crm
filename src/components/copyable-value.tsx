"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyableValue({ value, label, displayValue }: { value: string | null | undefined; label: string; displayValue?: React.ReactNode }) {
  const cleanValue = value?.trim();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  if (!cleanValue) return <span className="muted">-</span>;

  async function copyValue() {
    if (!cleanValue) return;
    try {
      await navigator.clipboard.writeText(cleanValue);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="copyable-wrap">
      <button className="copyable-value" type="button" onClick={copyValue} title={`Copy ${label}`} aria-label={`Copy ${label}`}>
        <span>{displayValue ?? cleanValue}</span>
        <Copy size={12} aria-hidden="true" />
      </button>
      {copied && <span className="copy-toast" role="status" aria-live="polite">{label} copied</span>}
    </span>
  );
}
