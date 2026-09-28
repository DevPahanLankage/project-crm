import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: process.env.DIRECT_URL ? { url: process.env.DIRECT_URL } : undefined,
});
