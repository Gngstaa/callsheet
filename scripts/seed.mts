import { existsSync } from "node:fs";

import { resetDemoData } from "@/lib/reset-demo-data";

// Next reads .env.local on its own; a plain script has to load it. Values are
// never printed.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const counts = await resetDemoData(new Date());
console.log(
  `Demo data reset: ${counts.placements} placements, ${counts.clients} clients, ${counts.healthSnapshots} health snapshots.`,
);
