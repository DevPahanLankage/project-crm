"use server";

import argon2 from "argon2";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role } from "@prisma/client";
import {
  createMockSession,
  createSession,
  destroySession,
  isDevMockAuthEnabled,
} from "@/lib/auth";

export type LoginState = { error: string | null };

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});

function logAuthFailure() {
  console.error("Nexa Markets sign-in failed before credential validation.");
}

export async function signIn(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  if (isDevMockAuthEnabled()) {
    const mockUsers = {
      "admin@example.com": {
        id: "dev-admin",
        fullName: "Administrator",
        password: "admin123456",
        role: Role.ADMIN,
      },
      "agent@example.com": {
        id: "dev-agent",
        fullName: "Retention Agent",
        password: "agent123456",
        role: Role.RETENTION_AGENT,
      },
      "sales@example.com": {
        id: "dev-sales",
        fullName: "Sales Agent",
        password: "sales123456",
        role: Role.SALES_AGENT,
      },
    } as const;
    const mockUser = mockUsers[parsed.data.email as keyof typeof mockUsers];
    if (!mockUser || parsed.data.password !== mockUser.password) {
      return { error: "Email or password is incorrect." };
    }

    await createMockSession({
      id: mockUser.id,
      fullName: mockUser.fullName,
      email: parsed.data.email,
      role: mockUser.role,
    });
    redirect("/leads");
  }

  try {
    const { db } = await import("@/lib/db");
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    const valid = user?.active && (await argon2.verify(user.passwordHash, parsed.data.password));
    if (!user || !valid) return { error: "Email or password is incorrect." };

    await createSession(user.id);
  } catch {
    logAuthFailure();
    return { error: "Database is not ready. Check the server environment and apply database migrations." };
  }

  redirect("/leads");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
