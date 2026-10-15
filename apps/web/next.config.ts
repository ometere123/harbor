import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "node:path";
loadEnv({path:path.resolve(process.cwd(),"../../.env.local")});
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@harbor/protocol"],
};
export default config;
