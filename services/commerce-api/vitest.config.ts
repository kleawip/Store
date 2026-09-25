import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Test files share one Postgres database, so run them one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/kleawip_test",
    },
  },
});
