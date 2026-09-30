import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(os.tmpdir(), "voxcut-playwright-browsers");

const isolatedStorage = path.join(process.cwd(), ".e2e-storage");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:3001",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/editor",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, VOXCUT_STORAGE_DIR: isolatedStorage },
  },
});
