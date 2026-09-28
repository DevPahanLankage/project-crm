import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";
import { startPerf, timed } from "@/lib/perf";

const SESSION_COOKIE = "crm_session";
const MOCK_SESSION_COOKIE = "crm_mock_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MOCK_SIGNING_KEY = "crm-local-ui-testing-only";

type CurrentUser = Pick<User, "id" | "email" | "fullName" | "role">;
type MockSessionPayload = CurrentUser & { expiresAt: number };

export function isDevMockAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_MOCK_AUTH === "true";
}

function signMockPayload(encodedPayload: string) {
  return createHmac("sha256", MOCK_SIGNING_KEY).update(encodedPayload).digest("base64url");
}

export async function createMockSession(user: CurrentUser) {
  if (!isDevMockAuthEnabled()) throw new Error("Development mock authentication is disabled.");

  const payload: MockSessionPayload = {
    ...user,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const value = `${encodedPayload}.${signMockPayload(encodedPayload)}`;
  (await cookies()).set(MOCK_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    expires: new Date(payload.expiresAt),
  });
}

async function getMockUser(): Promise<CurrentUser | null> {
  if (!isDevMockAuthEnabled()) return null;
  const value = (await cookies()).get(MOCK_SESSION_COOKIE)?.value;
  if (!value) return null;

  const [encodedPayload, suppliedSignature] = value.split(".");
  if (!encodedPayload || !suppliedSignature) return null;
  const expectedSignature = signMockPayload(encodedPayload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as MockSessionPayload;
    if (payload.expiresAt <= Date.now()) return null;
    return { id: payload.id, email: payload.email, fullName: payload.fullName, role: payload.role };
  } catch {
    return null;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const { db } = await import("@/lib/db");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(MOCK_SESSION_COOKIE);
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (isDevMockAuthEnabled()) {
    cookieStore.delete(SESSION_COOKIE);
    return;
  }
  if (token) {
    const { db } = await import("@/lib/db");
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  const endAuth = startPerf("auth total");

  if (isDevMockAuthEnabled()) {
    try {
      return await getMockUser();
    } finally {
      endAuth();
    }
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    endAuth();
    return null;
  }

  const { db } = await import("@/lib/db");
  const session = await timed("session lookup", () =>
    db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            active: true,
          },
        },
      },
    }),
  );

  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    endAuth();
    return null;
  }
  const { id, email, fullName, role } = session.user;
  endAuth();
  return { id, email, fullName, role };
});

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireAuthenticatedUser();
  if (!roles.includes(user.role)) redirect("/leads");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuthenticatedUser();
  if (user.role !== "ADMIN") redirect("/leads");
  return user;
}
