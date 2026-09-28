"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/leads/types";

export function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <p className={state.ok ? "action-success" : "action-error"} role="status" aria-live="polite">{state.message}</p>;
}

export function useResettingActionState(action: (state: ActionState, formData: FormData) => Promise<ActionState>, initialState: ActionState) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);
  return { state, formAction, pending, formRef };
}
