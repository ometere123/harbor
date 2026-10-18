import { defineChain, isAddress, keccak256, toHex, parseUnits, formatUnits } from "viem";
import type { Address, Hex } from "viem";

export const BASE_ID = 84532;
export const PORTALDOT_ID = 420420777;
export const DEFAULT_BASE_RPC = "https://sepolia.base.org";
export const DEFAULT_PORTALDOT_RPC = "https://test-evm-rpc-v3.portaldot.dev";
export const SOURCE_DURATION = 24n * 60n * 60n;
export const DESTINATION_DURATION = 4n * 60n * 60n;
export const MIN_DESTINATION_DURATION = 3n * 60n * 60n;
export const FUNDING_WINDOW = 20n * 60n;
export const QUOTE_DURATION = 5n * 60n;
export const SOURCE_DECIMALS = 6;
export const FEE_BPS = 20n;

export const portaldot = defineChain({
  id: PORTALDOT_ID,
  name: "Portaldot V3 Testnet",
  nativeCurrency: { name: "tPOTv3 (EVM RPC unit; verify)", symbol: "tPOTv3", decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_PORTALDOT_RPC] } },
  testnet: true,
});
export { parseUnits, formatUnits };

export const quoteFields = [
  { name: "intentId", type: "bytes32" },
  { name: "secretHash", type: "bytes32" },
  { name: "user", type: "address" },
  { name: "solver", type: "address" },
  { name: "destinationUser", type: "address" },
  { name: "destinationSolver", type: "address" },
  { name: "sourceEscrow", type: "address" },
  { name: "sourceToken", type: "address" },
  { name: "destinationEscrow", type: "address" },
  { name: "sourceAmount", type: "uint256" },
  { name: "destinationAmount", type: "uint256" },
  { name: "sourceChainId", type: "uint256" },
  { name: "destinationChainId", type: "uint256" },
  { name: "expiresAt", type: "uint256" },
  { name: "nonce", type: "uint256" },
] as const;

export interface Quote {
  intentId: Hex; secretHash: Hex; user: Address; solver: Address;
  destinationUser: Address; destinationSolver: Address;
  sourceEscrow: Address; sourceToken: Address; destinationEscrow: Address;
  sourceAmount: bigint; destinationAmount: bigint; sourceChainId: bigint;
  destinationChainId: bigint; expiresAt: bigint; nonce: bigint;
}
export const typedQuote = { Quote: quoteFields } as const;
export const quoteDomain = (sourceEscrow: Address) => ({
  name: "HARBOR", version: "1", chainId: BASE_ID, verifyingContract: sourceEscrow,
}) as const;

export type JsonQuote = Omit<Quote, "sourceAmount" | "destinationAmount" | "sourceChainId" | "destinationChainId" | "expiresAt" | "nonce"> & {
  sourceAmount: string; destinationAmount: string; sourceChainId: string;
  destinationChainId: string; expiresAt: string; nonce: string;
};
export const quoteToJson = (q: Quote): JsonQuote => ({
  ...q, sourceAmount: q.sourceAmount.toString(), destinationAmount: q.destinationAmount.toString(),
  sourceChainId: q.sourceChainId.toString(), destinationChainId: q.destinationChainId.toString(),
  expiresAt: q.expiresAt.toString(), nonce: q.nonce.toString(),
});
export const quoteFromJson = (q: JsonQuote): Quote => ({
  ...q, sourceAmount: BigInt(q.sourceAmount), destinationAmount: BigInt(q.destinationAmount),
  sourceChainId: BigInt(q.sourceChainId), destinationChainId: BigInt(q.destinationChainId),
  expiresAt: BigInt(q.expiresAt), nonce: BigInt(q.nonce),
});

export const sourceAbi = [
  {
    name: "openSwap", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "q", type: "tuple", components: quoteFields }, { name: "signature", type: "bytes" }], outputs: [],
  },
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [{ name: "intentId", type: "bytes32" }, { name: "secret", type: "bytes32" }], outputs: [] },
  { name: "refund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "intentId", type: "bytes32" }], outputs: [] },
  { name: "swaps", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ name: "user", type: "address" }, { name: "solver", type: "address" }, { name: "secretHash", type: "bytes32" }, { name: "amount", type: "uint256" }, { name: "openedAt", type: "uint64" }, { name: "deadline", type: "uint64" }, { name: "status", type: "uint8" }] },
  { name: "quoteDigests", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { name: "quoteDigest", type: "function", stateMutability: "view", inputs: [{ name: "q", type: "tuple", components: quoteFields }], outputs: [{ type: "bytes32" }] },
  { name: "SourceLocked", type: "event", inputs: [
    { name: "intentId", type: "bytes32", indexed: true }, { name: "user", type: "address", indexed: true },
    { name: "solver", type: "address", indexed: true }, { name: "secretHash", type: "bytes32", indexed: false },
    { name: "amount", type: "uint256", indexed: false }, { name: "deadline", type: "uint64", indexed: false },
    { name: "quoteDigest", type: "bytes32", indexed: false },
  ] },
  { name: "SourceClaimed", type: "event", inputs: [
    { name: "intentId", type: "bytes32", indexed: true }, { name: "secret", type: "bytes32", indexed: false },
    { name: "solverAmount", type: "uint256", indexed: false }, { name: "protocolFee", type: "uint256", indexed: false },
  ] },
  { name: "SourceRefunded", type: "event", inputs: [
    { name: "intentId", type: "bytes32", indexed: true }, { name: "user", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ] },
] as const;

export const destinationAbi = [
  { name: "fundSwap", type: "function", stateMutability: "payable", inputs: [
    { name: "intentId", type: "bytes32" }, { name: "secretHash", type: "bytes32" },
    { name: "recipient", type: "address" }, { name: "deadline", type: "uint64" },
  ], outputs: [] },
  { name: "claim", type: "function", stateMutability: "nonpayable", inputs: [{ name: "intentId", type: "bytes32" }, { name: "secret", type: "bytes32" }], outputs: [] },
  { name: "refund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "intentId", type: "bytes32" }], outputs: [] },
  { name: "swaps", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ name: "solver", type: "address" }, { name: "recipient", type: "address" }, { name: "secretHash", type: "bytes32" },
      { name: "amount", type: "uint256" }, { name: "deadline", type: "uint64" }, { name: "status", type: "uint8" }] },
  { name: "DestinationLocked", type: "event", inputs: [
    { name: "intentId", type: "bytes32", indexed: true }, { name: "solver", type: "address", indexed: true },
    { name: "recipient", type: "address", indexed: true }, { name: "secretHash", type: "bytes32", indexed: false },
    { name: "amount", type: "uint256", indexed: false }, { name: "deadline", type: "uint64", indexed: false },
  ] },
  { name: "DestinationClaimed", type: "event", inputs: [
    { name: "intentId", type: "bytes32", indexed: true }, { name: "secret", type: "bytes32", indexed: false },
    { name: "recipient", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false },
  ] },
  { name: "DestinationRefunded", type: "event", inputs: [
    { name: "intentId", type: "bytes32", indexed: true }, { name: "solver", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ] },
] as const;

export const tokenAbi = [
  { name: "faucet", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export function secretHashOf(secret: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(secret)) throw Error("Expected 32-byte secret");
  return keccak256(secret);
}
export function randomHex32(): Hex {
  const entropy = new Uint8Array(32);
  crypto.getRandomValues(entropy);
  return toHex(entropy);
}
export function destinationRawAmount(sourceRaw: bigint, rateBps: bigint, evmDecimals: number): bigint {
  if (sourceRaw <= 0n || rateBps <= 0n || evmDecimals < 0 || evmDecimals > 30) throw Error("Invalid amount or decimals");
  return sourceRaw * rateBps * (10n ** BigInt(evmDecimals)) / (10_000n * 1_000_000n);
}
export function validQuote(q: Quote, nowSeconds: bigint): boolean {
  const zeroId = "0x" + "0".repeat(64);
  return q.intentId !== zeroId
    && q.secretHash !== zeroId
    && isAddress(q.user)
    && isAddress(q.solver)
    && isAddress(q.destinationUser)
    && isAddress(q.destinationSolver)
    && q.solver.toLowerCase() === q.destinationSolver.toLowerCase()
    && isAddress(q.sourceEscrow)
    && isAddress(q.sourceToken)
    && isAddress(q.destinationEscrow)
    && q.sourceChainId === BigInt(BASE_ID)
    && q.destinationChainId === BigInt(PORTALDOT_ID)
    && q.sourceAmount >= 500_000n
    && q.sourceAmount <= 100_000_000n
    && q.destinationAmount > 0n
    && q.expiresAt > nowSeconds
    && q.expiresAt <= nowSeconds + QUOTE_DURATION;
}
