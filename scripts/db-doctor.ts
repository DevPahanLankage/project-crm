import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const EXPECTED_PROJECT_REF = "mftfsyuwcnqkcxrchkbq";
const databaseUrl = process.env.DATABASE_URL;

const prisma = new PrismaClient({
  ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
});

function has(name: string) {
  const value = process.env[name];
  return Boolean(value && value.trim());
}

function projectRefFromUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.username.startsWith("postgres.")) return url.username.slice("postgres.".length);
    if (url.hostname.startsWith("db.")) return url.hostname.split(".")[1];
    return null;
  } catch {
    return null;
  }
}

function maskedUrl(name: string) {
  const raw = process.env[name];
  if (!raw) return "missing";
  try {
    const url = new URL(raw);
    const projectRef = projectRefFromUrl(raw);
    return `${url.protocol}//${url.username ? "***@" : ""}${url.hostname}:${url.port || "default"}${url.pathname}${projectRef ? ` (${projectRef})` : ""}`;
  } catch {
    return "present but not a valid URL";
  }
}

function assertExpectedProject(name: string) {
  const raw = process.env[name];
  if (!raw) return;

  const projectRef = projectRefFromUrl(raw);
  if (projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error(`${name} must point to Supabase project ${EXPECTED_PROJECT_REF}. Current project: ${projectRef ?? "unknown"}.`);
  }
}

async function tableExists(name: string) {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    ) as exists
  `;
  return result[0]?.exists === true;
}

async function main() {
  console.log("Nexa Markets DB doctor");
  console.log(`Expected Supabase project: ${EXPECTED_PROJECT_REF}`);
  console.log(`DATABASE_URL: ${maskedUrl("DATABASE_URL")}`);
  console.log(`DIRECT_URL: ${maskedUrl("DIRECT_URL")}`);
  console.log(`ADMIN_EMAIL: ${has("ADMIN_EMAIL") ? "present" : "missing"}`);
  console.log(`ADMIN_INITIAL_PASSWORD: ${has("ADMIN_INITIAL_PASSWORD") ? "present" : "missing"}`);
  console.log(`DEV_MOCK_AUTH: ${process.env.DEV_MOCK_AUTH ?? "unset"}`);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Prisma cannot query Supabase without the Nexa Markets Postgres connection string.");
  }

  assertExpectedProject("DATABASE_URL");
  assertExpectedProject("DIRECT_URL");

  await prisma.$connect();
  console.log("Connection: ok");

  const requiredTables = ["User", "Session", "Lead", "Deposit", "Note", "_prisma_migrations"];
  for (const table of requiredTables) {
    console.log(`Table ${table}: ${(await tableExists(table)) ? "ok" : "missing"}`);
  }

  const [users, leads, deposits, notes] = await Promise.all([
    prisma.user.count().catch(() => -1),
    prisma.lead.count().catch(() => -1),
    prisma.deposit.count().catch(() => -1),
    prisma.note.count().catch(() => -1),
  ]);

  console.log(`Users: ${users}`);
  console.log(`Leads: ${leads}`);
  console.log(`Deposits: ${deposits}`);
  console.log(`Notes: ${notes}`);

  if (users === 0) console.log("Next: run npm run db:bootstrap after DATABASE_URL, DIRECT_URL, ADMIN_EMAIL, and ADMIN_INITIAL_PASSWORD are set.");
  if (leads === 0) console.log("Next: import your CSV/Excel leads from Admin Settings.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
