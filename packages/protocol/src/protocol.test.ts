import { describe, expect, it } from "vitest";
import { destinationRawAmount, randomHex32, secretHashOf, BASE_ID, PORTALDOT_ID } from "./index";

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
});
