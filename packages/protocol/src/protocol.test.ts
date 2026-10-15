import { describe, expect, it } from "vitest";
import { destinationRawAmount, randomHex32, secretHashOf, validQuote, BASE_ID, PORTALDOT_ID } from "./index";
import type { Quote } from "./index";

describe("cross-chain protocol quantities", () => {
  it("binds chain identities", () => {
    expect(BASE_ID).toBe(84532);
    expect(PORTALDOT_ID).toBe(420420777);
  });
  it("hashes exactly 32 bytes", () => {
    expect(secretHashOf(randomHex32())).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => secretHashOf("0x12")).toThrow();
  });
  it("calculates 100 hUSD at a 0.42 testnet quote", () => {
    expect(destinationRawAmount(100_000_000n, 4200n, 18)).toBe(42n * 10n ** 18n);
  });
  it("rejects nonpositive quotes", () => {
    expect(() => destinationRawAmount(0n, 4200n, 18)).toThrow();
  });
  it("accepts only structurally valid, five-minute quotes", () => {
    const now=1_000_000n;
    const q:Quote={
      intentId:randomHex32(),secretHash:randomHex32(),
      user:"0x0000000000000000000000000000000000000001",
      solver:"0x0000000000000000000000000000000000000002",
      destinationUser:"0x0000000000000000000000000000000000000003",
      destinationSolver:"0x0000000000000000000000000000000000000002",
      sourceEscrow:"0x0000000000000000000000000000000000000004",
      sourceToken:"0x0000000000000000000000000000000000000005",
      destinationEscrow:"0x0000000000000000000000000000000000000006",
      sourceAmount:1_000_000n,destinationAmount:420_000_000_000_000_000n,
      sourceChainId:BigInt(BASE_ID),destinationChainId:BigInt(PORTALDOT_ID),
      expiresAt:now+300n,nonce:1n,
    };
    expect(validQuote(q,now)).toBe(true);
    expect(validQuote({...q,destinationSolver:q.destinationUser},now)).toBe(false);
    expect(validQuote({...q,expiresAt:now+301n},now)).toBe(false);
  });
});
