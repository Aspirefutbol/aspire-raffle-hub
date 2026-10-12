import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
    // Makes .env.local values (local Supabase URL/keys) available to DB-backed tests.
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
