import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests",
  use:{baseURL:"http://127.0.0.1:3000",browserName:"chromium"},
  webServer:{command:"pnpm dev",url:"http://127.0.0.1:3000",reuseExistingServer:!process.env.CI,timeout:120000},
});
