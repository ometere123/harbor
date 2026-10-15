# HARBOR evidence ledger

This directory is reserved for independently reproducible deployment and transaction evidence. It intentionally contains no invented hashes, screenshots, balances or explorer links.

## Evidence standard

Each live action must include:

| Field | Required value |
| --- | --- |
| Source commit | Exact Git SHA used for the action |
| Network | `base-sepolia` or `portaldot-v3`, including chain ID |
| RPC | Exact endpoint used, without credentials |
| Transaction | Hash, receipt status, block number and finality check |
| State proof | Before/after reads for the relevant escrow, event fields and balances |
| Signer proof | Public signer address and role; never the private key |
| Reproduction | Read-only RPC commands or script and expected result |

For a complete swap, record both escrow addresses, the two quote digests, the selected solver, source lock, destination funding, destination claim, source claim, fee transfer and the independently reconstructed receipt. A submitted transaction is not proof until the receipt and resulting state are checked.

## Required live proof set

The final submission should add immutable evidence files or links for:

1. Portaldot V3 deployment and bytecode/constructor verification.
2. Base Sepolia hUSD, source escrow and constructor verification.
3. Two distinct, independently signed solver quotes.
4. One successful Base Sepolia → Portaldot V3 settlement with both claims.
5. Source refund, destination refund and an abandoned destination settlement.
6. Invalid secret, forged quote, expired quote and replay rejection.
7. Native-value precision calibration, including the `reviveApi.accountId` H160-to-SS58 mapping and balance deltas.

## Current audit status — 2026-10-15

- Base Sepolia RPC responded with chain ID `84532` during the repository audit.
- The configured Portaldot V3 EVM hostname `testnetv3-eth-rpc.feso-apps.xyz` did not resolve during the audit. No Portaldot transaction, balance, mapping or value-scale claim is recorded.
- No deployer, solver, Supabase service-role or Vercel deployment credentials were present in the workspace environment. No live deployment is claimed.
- `PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED` therefore remains `false`.
- `pnpm audit --prod --audit-level high` passed after dependency overrides. The full development graph still reports the unpatched `braces` advisory through ESLint/Tailwind tooling; it is not in the production graph and is retained as a disclosed residual risk.

The local Hardhat, protocol, Worker and browser test results are engineering evidence, not a substitute for this live evidence set. See [DEPLOYMENT.md](../DEPLOYMENT.md) for the exact collection procedure.
