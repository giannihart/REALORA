/**
 * Fail the build if the service-role key is imported from a client-reachable module.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name)) continue;
    const src = readFileSync(full, "utf8");
    const mentionsKey = /SUPABASE_SERVICE_ROLE_KEY/.test(src);
    const importsAdmin =
      /from\s+["']@\/lib\/supabase\/admin["']/.test(src) || /from\s+["']\.\.?\/.*supabase\/admin["']/.test(src);
    if (!mentionsKey && !importsAdmin) continue;
    const serverOnly = /import\s+["']server-only["']/.test(src) || /from\s+["']server-only["']/.test(src);
    const useServer = /["']use server["']/.test(src);
    const isAdminModule = full.endsWith("/lib/supabase/admin.ts");
    const isRouteHandler = /\/src\/app\/api\//.test(full) && /route\.ts$/.test(full);
    if (serverOnly || useServer || isAdminModule || isRouteHandler) continue;
    offenders.push(relative(process.cwd(), full));
  }
}

walk(ROOT);

if (offenders.length) {
  console.error("Service-role key / admin client leaked into client-reachable modules:");
  for (const file of offenders) console.error(`  - ${file}`);
  process.exit(1);
}

console.log("assert-server-boundary: ok");
