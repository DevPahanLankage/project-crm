import "dotenv/config";

import { spawnSync } from "node:child_process";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient, Role } from "@prisma/client";

const setupDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
const node = process.execPath;
const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");

if (!setupDatabaseUrl) {
  console.error("Set DIRECT_URL or DATABASE_URL before running database bootstrap.");
  process.exit(1);
}

if (!adminEmail || !adminPassword || adminPassword.length < 12) {
  console.error("Set ADMIN_EMAIL and an ADMIN_INITIAL_PASSWORD of at least 12 characters.");
  process.exit(1);
}

function runMigrations() {
  const result = spawnSync(node, [prismaCli, "migrate", "deploy"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: setupDatabaseUrl,
    },
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function upsertAdmin() {
  const prisma = new PrismaClient({ datasourceUrl: setupDatabaseUrl });
  const passwordHash = await argon2.hash(adminPassword as string, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email: adminEmail as string },
    update: {
      fullName: "Administrator",
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
    create: {
      fullName: "Administrator",
      email: adminEmail as string,
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });

  await prisma.$disconnect();
  console.log(`Bootstrap complete. Admin ready: ${adminEmail}. No sample leads or agents were created.`);
}

runMigrations();
upsertAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
