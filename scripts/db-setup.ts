import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";

const setupDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const node = process.execPath;
const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

if (!setupDatabaseUrl) {
  console.error("Set DIRECT_URL or DATABASE_URL before running database setup.");
  process.exit(1);
}

function run(args: string[]) {
  const result = spawnSync(node, args, {
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

run([prismaCli, "migrate", "deploy"]);
run([tsxCli, "prisma/seed.ts"]);
