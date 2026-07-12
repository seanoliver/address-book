import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // dbAdmin bypasses RLS: restrict imports of the admin module to the
  // sanctioned call sites (private.* definer calls, token minting, webhook
  // status updates). Everything owner-facing goes through withRls.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/admin"],
              message:
                "dbAdmin bypasses RLS. Use withRls from @/lib/db for owner-facing data access; dbAdmin is only for private.* SECURITY DEFINER calls, update_token minting, and webhook status updates (see the allowlisted paths in eslint.config.mjs).",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/lib/db/**",
      "src/app/api/webhooks/**",
      "src/app/u/**",
      "src/app/b/**",
      "src/app/dashboard/actions.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
