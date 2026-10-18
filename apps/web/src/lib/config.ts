import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { portaldot, BASE_ID, PORTALDOT_ID } from "@harbor/protocol";

const requiredAddress = (value: string | undefined): Address | undefined =>
  /^0x[a-fA-F0-9]{40}$/.test(value || "") ? value as Address : undefined;
export const config = {
  baseId: BASE_ID,
  destId: PORTALDOT_ID,
  baseRpc: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://sepolia.base.org",
  destRpc: process.env.NEXT_PUBLIC_PORTALDOT_EVM_RPC_URL || "https://test-evm-rpc-v3.portaldot.dev",
  sourceEscrow: requiredAddress(process.env.NEXT_PUBLIC_SOURCE_ESCROW_ADDRESS),
  sourceToken: requiredAddress(process.env.NEXT_PUBLIC_SOURCE_TOKEN_ADDRESS),
  destinationEscrow: requiredAddress(process.env.NEXT_PUBLIC_DESTINATION_ESCROW_ADDRESS),
  // Wallet RPC and native substrate decimals can differ. This flag is deliberately
  // separate from the configured display scale and must be proved on live V3.
  destinationValueDecimals: Number(process.env.NEXT_PUBLIC_PORTALDOT_EVM_VALUE_DECIMALS || "18"),
  portaldotValueDecimalsVerified: process.env.NEXT_PUBLIC_PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED === "true",
};
export const baseClient = createPublicClient({chain:baseSepolia,transport:http(config.baseRpc)});
export const destClient = createPublicClient({chain:portaldot,transport:http(config.destRpc)});
export function ready() {
  return Boolean(config.sourceEscrow && config.sourceToken && config.destinationEscrow
    && Number.isInteger(config.destinationValueDecimals)
    && config.destinationValueDecimals >= 0
    && config.destinationValueDecimals <= 30
    && config.portaldotValueDecimalsVerified);
}
