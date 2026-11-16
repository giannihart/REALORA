import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Skill packs + examples are not app code
      ".agents/**",
    ],
  },
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "SUPABASE_SERVICE_ROLE_KEY is server-only. Import createServiceRoleClient from a server module, never from client components.",
            },
            {
              name: "@/lib/services/acris",
              message:
                "lookupProperty is server-only. Call lookupPropertyAction from the client, never import acris.ts into client components.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/lib/supabase/admin.ts",
      "src/lib/services/acris.ts",
      "src/lib/services/esign-dropbox.ts",
      "src/lib/actions/**/*.ts",
      "src/lib/compliance/**/*.ts",
      "src/app/api/**/*.{ts,tsx}",
      "scripts/**/*.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
