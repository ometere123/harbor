import { defineConfig } from "@playwright/test";
const localChannel=process.env.PLAYWRIGHT_CHANNEL === "chrome" ? "chrome" as const : undefined;
export default defineConfig({
  testDir:"./tests",
  use:{baseURL:"http://127.0.0.1:3000",browserName:"chromium",channel:localChannel},
  webServer:{command:"pnpm dev",url:"http://127.0.0.1:3000",reuseExistingServer:!process.env.CI,timeout:120000},
});
