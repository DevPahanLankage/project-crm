"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button className="refresh-button" type="button" title="Refresh results" aria-label="Refresh results" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw className={pending ? "spinning" : ""} size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
