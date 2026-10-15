import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";
loadEnv({path:path.resolve(process.cwd(),"../../.env.local")});
const config: NextConfig = {
  reactStrictMode: true,
  // Keep tracing rooted at the monorepo, regardless of whether Next runs from
  // the workspace root or from the Vercel apps/web project root.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@harbor/protocol"],
};
export default config;
