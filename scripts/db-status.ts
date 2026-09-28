import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";

const setupDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const node = process.execPath;
const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");

if (!setupDatabaseUrl) {
  console.error("Set DIRECT_URL or DATABASE_URL before checking database migration status.");
  process.exit(1);
}

const result = spawnSync(node, [prismaCli, "migrate", "status"], {
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
