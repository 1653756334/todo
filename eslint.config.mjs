import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
export default defineConfig(
  { ignores: [".next/**", "node_modules/**", "dist/**", "src/lib/**"] },
  { files: ["src/**/*.ts", "src/**/*.tsx", "worker/**/*.ts"], languageOptions: { parser: tseslint.parser }, plugins: { "react-hooks": reactHooks }, rules: {} },
  { files: ["src/shared/**/*.{ts,mjs}"], rules: { "no-restricted-imports": ["error", { patterns: ["@/server/*", "@/lib/*", "@prisma/*", "node:*", "next/*"] }] } },
  { files: ["src/components/**/*.{ts,tsx}"], rules: { "no-restricted-imports": ["error", { patterns: ["@/server/*", "@prisma/*", "node:*", "@/lib/auth", "@/lib/db", "@/lib/settings", "@/lib/env", "@/lib/api", "@/lib/secret.mjs"] }] } },
  { files: ["src/server/**/*.ts", "worker/**/*.ts"], ignores: ["src/server/adapters/**"], rules: { "no-restricted-imports": ["error", { patterns: ["next/*", "react", "react-dom", "@/components/*", "@/app/*"] }] } },
);
