import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { BrandLogo } from "@/components/brand-logo";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/leads");

  return (
    <main className="login-page">
      <div className="login-shell">
        <BrandLogo className="login-logo" />
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">Login</h1>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
