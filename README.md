# HARBOR

**Non-custodial, solver-quoted testnet settlement from Base Sepolia hUSD to Portaldot V3 native tPOTv3.**

[![HARBOR CI](https://github.com/ometere123/harbor/actions/workflows/ci.yml/badge.svg)](https://github.com/ometere123/harbor/actions/workflows/ci.yml)
[![Security](https://github.com/ometere123/harbor/actions/workflows/security.yml/badge.svg)](https://github.com/ometere123/harbor/actions/workflows/security.yml)

> **Testnets only. No real-money assets. No independent security audit.** Status: source implementation and automated tests; live network deployment pending account funding, provider availability, environment secrets and EVM/native-value precision calibration. No testnet transaction or explorer evidence is claimed unless present in deployments/ and docs/evidence/ with verified RPC receipts.

## Problem and product

Cross-chain swaps often route funds through a custodial bridge or depend on an unverified relayer's promise. HARBOR instead uses **two separate hashed-timelock escrow contracts**: a token escrow on Base Sepolia and a payable native-value escrow on Portaldot V3. Two dedicated solver identities compete with individually signed, time-limited EIP-712 quotes. The requesting wallet first signs a non-transaction EIP-191 request message to authenticate the RFQ. The chosen solver funds the Portaldot destination after the source lock is confirmed; the user reveals a private secret only by claiming the Portaldot funds; the public secret lets the solver claim its source hUSD payment.

HARBOR is **not** a trustless light-client bridge or an AMM. Solvers may fail to fill a quote; refunds become available after the specified deadlines. A transaction is not cross-chain atomic in the conventional single-transaction sense. A severe network outage can still impact liveness.

### The route (fixed)

| Component | Source | Destination |
| --- | --- | --- |
| Network | Base Sepolia | Portaldot V3 testnet |
| EVM chain ID | 84532 | 420420777 |
| Asset | hUSD demo ERC-20 | Native tPOTv3 |
| Assets | 6 decimals | Native Substrate metadata 14 decimals; EVM-RPC raw-value scale **must be measured** |
| Contract | HarborSourceEscrow | HarborDestinationEscrow |
| Fee | 0.2% hUSD on successful source claim | No protocol fee |
| Timeouts | 24 hours after source lock | 4 hours after destination funding |
| Solver funding window | 20 minutes after source lock | 4-hour maximum lock duration |
| Quote lifetime | 5 minutes | n/a |

hUSD is a faucet token, **not** real USD or USDC. Quote ratios are artificial testnet values, not price feeds.

### Architecture

~~~text
               Browser (Next.js / Vercel)
             injected EIP-1193 + viem
                            |
                 Quote RFQ / monitoring
                            v
              Cloudflare Worker + Queues
                Alpha & Bravo solvers
                     |           |
           Base Sepolia RPC   Portaldot V3 EVM RPC
                     |           |
            HarborSource      HarborDestination
               Escrow             Escrow
                 |                  |
               hUSD            native tPOTv3
                     \          /
                      shared SHA3
                       hashlock
                            |
               Supabase coordination DB
              (NON-authoritative cache)
~~~

The browser generates a 32-byte random secret and encrypts a downloadable recovery record using PBKDF2-SHA256 + AES-GCM before requesting quotes. The plaintext secret does not go to Supabase or the solver quote API. After the destination is funded, the browser independently checks the destination's amount, solver, recipient and hashlock **and the source's stored quote commitment** before offering the claim action.

Solvers run as distinct signing identities in a single prototype Cloudflare Worker deployment; they are **not** independent infrastructure providers.

### One complete settlement

1. Connect an injected EVM wallet (EIP-6963 discovery / EIP-1193 signing).
2. Mint faucet hUSD on Base Sepolia and enter desired amount.
3. Generate and download an encrypted 32-byte secret recovery backup.
4. Compare two EIP-712 signed quotes, choose a solver, approve hUSD and lock source funds.
5. Cloudflare Queue observes confirmed source events, validates the actual source quote digest and funds native tPOTv3 on Portaldot.
6. User verifies the on-chain destination escrow, changes EVM network and claims tPOTv3 with the secret.
7. The solver observes the public secret and claims the source hUSD net of the 0.2% fee.
8. Both immutable contract statuses, block references and indexed events are available for independent verification.

**Recovery paths:** A user may refund source hUSD after the 24h source timeout if it was not claimed; a solver may refund destination tPOTv3 after its earlier deadline if it was not claimed. Neither is an automatic transfer at the timestamp; Cloudflare automates calls when possible, while the contract methods remain publicly callable.

### Screens

- Home: protocol positioning, destination and asset route.
- Swap: wallet, faucet, encrypted recovery, solver offers and source lock.
- Swap details: live source/destination contract status, tamper-resistant claim validation, claims/refunds and evidence.
- Activity: wallet-associated swap history from the off-chain index with direct chain verification on detail.
- Solvers: the two public solver identities and demo pricing.
- Proof: deployed contract identifiers and limitations.
- Docs: user instructions and safety disclosures.

### Contracts

| Contract | Where deployed | Purpose |
| --- | --- | --- |
| contracts/HarborTestUSD.sol | Base Sepolia | Unredeemable 6-decimal ERC-20 with bounded per-wallet faucet |
| contracts/HarborSourceEscrow.sol | Base Sepolia | EIP-712 quote verification, safe ERC-20 lock, secret claim, timed refund, fee |
| contracts/HarborDestinationEscrow.sol | Portaldot V3 | Restricted solver funding, native-value lock, secret claim, timed refund |

There is **no upgrade proxy, custody admin, hidden withdrawal or solver slashing**. Destination native value is not a wrapped ERC-20.

### Development

~~~bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm compile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
~~~

Web: http://localhost:3000. The UI displays unconfigured deployments and disables swaps until contract addresses exist. Workers are configured separately; see docs/DEPLOYMENT.md.

### Repository layout

~~~text
apps/web/             Next.js frontend + server API proxy
contracts/            Three Solidity contracts
packages/protocol/    Shared typed ABI, quotes and amount helpers
services/solver/      Cloudflare Worker, Cron and Queue solvers
supabase/migrations/  Backend tables, indexes and RLS
scripts/deploy/       Portaldot-first deploy scripts
scripts/smoke/        RPC/chain identity checks
tests/contracts/      Adversarial contract lifecycle tests
docs/                 Threat model, deployment process and evidence
.github/workflows/    CI and security checks
~~~

### Configure without leaking keys

The .env.example contains only names/placeholders and public RPC defaults. The deployer and solver keys, Supabase service role key and worker admin token are required at deployment. **Never commit any actual secret**. Solvers need separate externally funded testnet accounts. Native tPOTv3 must be sent to the correct mapped SS58 account returned by the reviveApi.accountId runtime call, not an assumed Ethereum-style address.

The Portaldot developer guide is here: https://github.com/ItsCogumellum/portaldot-v3-testnet-guide

Follow docs/DEPLOYMENT.md for the exact deployment order, manual validation gates, Cloudflare queues, Vercel and final live evidence. Do not set the value-precision verification flag to true until tested on the actual Portaldot V3 RPC.

### Hackathon and scope

Portaldot Hacker House 2026, **Multi-Chain & Cross-Chain Infra**. Core code has been written during the competition period. The contest requires V3 testnet integration, public Git history, October 24 check-in, November 6 final code freeze, a working demo, ≤3-minute demonstration video and pitch deck.

No later version is promised. The scope is one complete cross-chain route, two signing solvers, three contracts, the full user lifecycle, six primary product screens plus docs/proof, deployment workflows, tests and evidence. Excluded: mainnets, real USDC, generic token swaps, iBridge integration, fabricated finality, oracle-based rates, AMMs, partial fills, staking/slashing, governance tokens and browser Substrate signing.

### Current evidence

| Gate | Evidence |
| --- | --- |
| Code repository | This repository, dated commits |
| Hardhat compilation | GitHub Actions: CI workflow |
| Contract adversarial tests | tests/contracts/escrow.test.ts |
| Protocol helper tests | packages/protocol/src/protocol.test.ts |
| TypeScript/Next.js production build | GitHub Actions: CI workflow |
| Portaldot V3 transaction | **Not yet independently verified** |
| Base Sepolia contract deployment | **Not yet independently verified** |
| Cloudflare solver deployment | **Not yet independently verified** |
| Vercel production deployment | **Not yet independently verified** |

No simulated or mock transaction is represented as a live chain receipt.

**Licence:** MIT, see LICENSE.
