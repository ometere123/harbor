import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const sourceKey = process.env.BASE_DEPLOYER_KEY;
const destKey = process.env.PORTALDOT_DEPLOYER_KEY;
const configuration: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests/contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: process.env.BASE_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: sourceKey ? [sourceKey] : [],
    },
    portaldotV3: {
      url: process.env.PORTALDOT_EVM_RPC_URL || "https://testnetv3-eth-rpc.feso-apps.xyz",
      chainId: 420420777,
      accounts: destKey ? [destKey] : [],
    },
  },
};

export default configuration;
