import "dotenv/config";
import argon2 from "argon2";
import { Prisma, PrismaClient, RetentionStatus, Role } from "@prisma/client";

const datasourceUrl = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  ...(datasourceUrl ? { datasourceUrl } : {}),
});

const firstNames = ["Avery", "Briar", "Cato", "Della", "Elio", "Faye", "Galen", "Hera", "Indie", "Juno", "Kian", "Lena", "Miro", "Nora", "Owen"];
const lastNames = ["Stone", "Vale", "North", "Ember", "Quill", "Reed", "Voss", "Hart", "Lane", "Morrow", "Pine", "Cross"];
const countries = ["GB", "CA", "RO", "PT", "DE", "FR", "ES", "IT", "NL", "PL", "US", "AU"];
const statuses = Object.values(RetentionStatus);

function usd(value: number) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

async function upsertUser(fullName: string, email: string, password: string, role: Role) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const shouldResetPassword = process.env.RESET_SEEDED_PASSWORDS === "true";
    return prisma.user.update({
      where: { email },
      data: {
        fullName,
        role,
        active: true,
        ...(shouldResetPassword ? { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) } : {}),
      },
    });
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.user.create({
    data: { fullName, email, passwordHash, role },
  });
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!datasourceUrl) {
    throw new Error("Set DATABASE_URL before running the seed.");
  }

  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_INITIAL_PASSWORD of at least 12 characters.");
  }

  const admin = await upsertUser("Administrator", adminEmail, adminPassword, Role.ADMIN);
  const agents = await Promise.all([
    upsertUser("Izzy Retention", "izzy.agent@example.com", "agent-password-123", Role.RETENTION_AGENT),
    upsertUser("Morgan Orbit", "morgan.agent@example.com", "agent-password-123", Role.RETENTION_AGENT),
    upsertUser("Riley Quartz", "riley.agent@example.com", "agent-password-123", Role.RETENTION_AGENT),
    upsertUser("Sam Ledger", "sam.agent@example.com", "agent-password-123", Role.RETENTION_AGENT),
  ]);

  const existingSeedLeads = await prisma.lead.findMany({
    where: { email: { startsWith: "lead.", endsWith: "@example.com" } },
    select: { email: true },
  });
  const existingSeedEmails = new Set(existingSeedLeads.map((lead) => lead.email));
  let createdLeads = 0;

  for (let index = 0; index < 140; index += 1) {
    const email = `lead.${String(index + 1).padStart(3, "0")}@example.com`;
    if (existingSeedEmails.has(email)) continue;
    const createdAt = new Date(Date.UTC(2026, index % 8, (index % 27) + 1, 8 + (index % 10), (index * 11) % 60));
    const assignedAgent = index % 5 === 0 ? null : agents[index % agents.length];
    const lead = await prisma.lead.create({
      data: {
        firstName: firstNames[index % firstNames.length],
        lastName: lastNames[(index * 5) % lastNames.length],
        email,
        phone: `+44753767${String(8000 + index).padStart(4, "0")}`,
        countryCode: countries[index % countries.length],
        prefix: index % 3 === 0 ? "+44" : null,
        language: index % 2 === 0 ? "English" : null,
        timeZone: index % 4 === 0 ? "UTC" : null,
        additionalInfo: index % 7 === 0 ? "Prefers afternoon callbacks." : null,
        retentionStatus: statuses[index % statuses.length],
        assignedAgentId: assignedAgent?.id ?? null,
        createdAt,
      },
    });

    let totalBalance = usd(0);
    if (index % 4 === 0) {
      const firstAmount = usd(100 + (index % 9) * 50);
      const firstDepositAt = new Date(createdAt.getTime() + 2 * 86_400_000);
      await prisma.deposit.create({ data: { leadId: lead.id, amount: firstAmount, createdByUserId: admin.id, createdAt: firstDepositAt } });
      totalBalance = totalBalance.plus(firstAmount);
      let lastDepositAt = firstDepositAt;

      if (index % 8 === 0) {
        const secondAmount = usd(75 + (index % 5) * 25);
        lastDepositAt = new Date(firstDepositAt.getTime() + 5 * 86_400_000);
        await prisma.deposit.create({ data: { leadId: lead.id, amount: secondAmount, createdByUserId: admin.id, createdAt: lastDepositAt } });
        totalBalance = totalBalance.plus(secondAmount);
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: { totalBalance, firstDepositAt, lastDepositAt },
      });
    }

    if (index % 3 !== 0) {
      const noteAt = new Date(createdAt.getTime() + 36 * 60 * 60 * 1000);
      await prisma.note.create({
        data: {
          leadId: lead.id,
          body: index % 6 === 0 ? "Client requested callback tomorrow." : "Initial contact reviewed.",
          isPinned: index % 10 === 0,
          createdByUserId: assignedAgent?.id ?? admin.id,
          createdAt: noteAt,
        },
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { firstNoteAt: noteAt, lastNoteAt: noteAt } });
    }

    createdLeads += 1;
  }

  const totalSeedLeads = await prisma.lead.count({
    where: { email: { startsWith: "lead.", endsWith: "@example.com" } },
  });

  console.log(`Seed complete. Admin: ${adminEmail}. Agents: ${agents.length}. Created leads: ${createdLeads}. Seed leads total: ${totalSeedLeads}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
