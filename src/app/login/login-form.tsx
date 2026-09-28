"use client";

import { LockKeyhole, Mail } from "lucide-react";
import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="login-form">
      {state.error && <p className="error" role="alert" aria-live="polite">{state.error}</p>}
      <label className="field" htmlFor="email">Email</label>
      <div className="input-shell"><Mail size={15} /><input className="text-input" id="email" name="email" type="email" autoComplete="username" required autoFocus disabled={pending} /></div>
      <label className="field" htmlFor="password">Password</label>
      <div className="input-shell"><LockKeyhole size={15} /><input className="text-input" id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} /></div>
      <button className="primary-button" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
