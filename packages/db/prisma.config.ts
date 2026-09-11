import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma does not read env files on its own. Load the repo root's .env.local,
// then .env, if they exist. Neither is needed to generate or validate.
for (const name of [".env.local", ".env"]) {
  const file = fileURLToPath(new URL(`../../${name}`, import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}

// The CLI (migrate, db execute) needs a direct connection. On Vercel,
// DATABASE_URL is Neon's pooled string for the serverless functions, so
// DIRECT_URL carries the unpooled one. Locally both can be the same string.
// An empty DIRECT_URL counts as unset.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
});
