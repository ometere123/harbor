# HARBOR — locked product and engineering specification

Status: **FROZEN SCOPE**. Target: Portaldot Hacker House 2026, **Multi-Chain & Cross-Chain Infrastructure**. Code freeze: **2026-11-06 04:00 UTC**. Repository: **https://github.com/ometere123/harbor**. This is **one complete submission**: no v1/v2, staged feature promises, optional roadmap or architectural pivot.

## 1. What HARBOR is

HARBOR is a **testnet-only, non-custodial, solver-quoted, hashlocked cross-chain settlement marketplace**. A user exchanges **hUSD demo ERC-20 on Base Sepolia** for **native tPOTv3 on Portaldot V3 testnet**. Two separately funded solver signing identities compete with signed offers. The selected solver funds the Portaldot destination after verifying the confirmed source escrow. The user claims the destination using a secret, publicly revealing the preimage. The solver uses that preimage to claim the source payment. Timeouts enable refunds of unclaimed locks. Each chain independently enforces its own state; this is **not a light-client bridge or an atomic transaction spanning two chains**, and solver fulfillment/liveness is not guaranteed.

## 2. Frozen network, token and economic choices

| Field | Committed value |
|---|---|
| Source | Base Sepolia testnet, chain ID **84532** |
| Source asset | **hUSD** (Harbor Test USD), faucet-enabled **6-decimal ERC-20**, no real USD backing |
| Destination | **Portaldot V3 testnet**, EVM chain ID **420420777** |
| Destination asset | **native tPOTv3**; native substrate metadata **14 decimals** |
| Portaldot native WSS (published) | `wss://test-node-v3.portaldot.dev` |
| Portaldot EVM RPC (published) | `https://test-evm-rpc-v3.portaldot.dev` |
| Base RPC | `https://sepolia.base.org` |
| Direction | **Base Sepolia hUSD → Portaldot native tPOTv3**, one full fill per intent |
| Quote lifetime | **5 minutes** |
| Solver funding window | **20 minutes** after observed source lock |
| Source HTLC deadline | **24 hours** from the source lock |
| Destination HTLC deadline | **4 hours** from destination funding |
| Protocol fee | **20 bps / 0.20% of source hUSD**, paid only upon successful source claim |
| Demo solver identities | **Alpha and Bravo**, separate wallets and funding balances |
| Testnet quote prices | Configured demo quote rates, **not real market prices/oracle feeds** |

**Critical network invariant:** the EVM JSON-RPC representation of `msg.value` must be **empirically checked against native tPOTv3 quantities before enabling real settlement**. The repository's `NEXT_PUBLIC_PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED` and `PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED` remain `false` until a real payable-contract round trip proves the scale; **do not assume 14 or 18 EVM RPC decimals**. H160↔SS58 mapping must be obtained using `reviveApi.accountId` before transferring native gas funds to a deployer/solver.

## 3. Frozen stack

- **Monorepo/toolchain:** GitHub `ometere123/harbor`, Node.js **22**, `pnpm@9.15.9`, TypeScript, GitHub Actions.
- **Website:** Next.js **15** App Router, React **19**, Tailwind CSS **3**, Radix UI primitives, Lucide; deployed on **Vercel**.
- **Browser wallets:** injected **EIP-1193 only**, with **EIP-6963** provider discovery and **viem** for interaction. No WalletConnect, no Polkadot browser extension signing and no hidden browser keys.
- **Contracts:** **Solidity 0.8.24**, **Hardhat 2**, **OpenZeppelin Contracts 5**, TypeScript deploy and test scripts.
- **Off-chain coordination:** **Supabase Postgres**, SQL migrations and restricted service-role access; Realtime for live application updates as used by the application; **never settlement authority**.
- **Solver and observers:** **one Cloudflare Worker deployment hosting two separately keyed agents**, **Cloudflare Cron Triggers**, **Cloudflare Queues** including a **dead-letter queue**; Wrangler for deployment. **No Railway** or permanent Node.js daemon.
- **Tests and diagnostics:** Hardhat/Chai, Vitest, Playwright, production build, static types, lint, security workflows, RPC smoke tests; adversarial tests.
- **Credentials:** copy `.env.example` to local `.env.local`, configure Vercel environment values and Cloudflare secrets. **No private keys in Git or public NEXT_PUBLIC variables**.

Cloudflare Cron **schedules discrete invocations; it does not provide an always-on background process**. The Workers/Queues system is designed for bounded, repeatable scans with persistent Supabase checkpoints. Cost-free delivery is a goal subject to provider account quotas, not a guaranteed property.

## 4. Frozen contracts: exactly three

1. **`HarborTestUSD.sol`** on Base Sepolia. Unredeemable faucet-funded 6-decimal demo ERC-20.
2. **`HarborSourceEscrow.sol`** on Base Sepolia. Verifies EIP-712 signed solver quote with chain/contract/asset/participant/amount/hashlock/nonce/expiry binding; escrows exactly the ERC-20 amount; immutable solver/user and source deadline; releases net amount and protocol fee on a valid claim; refunds the original user after timeout.
3. **`HarborDestinationEscrow.sol`** on Portaldot V3. Accepts precisely funded native-value locks from the two designated solver addresses; binds intent/secret hash/recipient/amount/deadline; sends native currency to the designated user on a valid claim; returns unclaimed native currency to the funding solver after timeout.

Claims and refunds can be sent by any account, **but payouts cannot be redirected**. No administrator sweep, contract upgrade proxy, off-chain settlement authority, bridged token minting, or trusted on-chain cross-chain oracle.

Source and destination transactions **cannot be proven atomic across chains**. A source contract cannot itself verify source-side conditions from Portaldot, and a destination contract cannot independently prove the Base source lock absent cross-chain proofs. The solver verifies the source chain, and the browser independently checks both authoritative contract states before revealing the secret.

## 5. Frozen complete product flow

1. Discover and connect an injected wallet; verify networks and chain IDs.
2. Connect to Base Sepolia, obtain demo hUSD using the on-chain faucet, enter the source amount and destination account.
3. Generate a cryptographically random 32-byte secret locally. Create/download an **encrypted recovery record** before source funds are locked; never submit the unrevealed secret to quote APIs or Supabase.
4. Display **two distinct signed solver quotes**, each with all economic and cryptographic commitments, expiration, fee and destination amount. Prevent selection of an unfunded or expired quote.
5. User selects one solver, approves the exact source amount and signs the `HarborSourceEscrow.openSwap` lock.
6. Cloudflare observer verifies sufficient source confirmations, the exact stored quote commitment, chain identities and the solver's destination liquidity. The selected solver locks the native destination amount before its 20-minute off-chain funding cutoff.
7. User independently verifies source and destination escrow state, chain identities, amounts, actual solver, recipient and hashlock. User switches to Portaldot and claims using the restored local secret.
8. Solver observes the disclosed secret in the actual Portaldot transaction and claims source hUSD. The fee is collected only on this successful claim.
9. If source remains unclaimed after 24 hours, its original depositor is refunded; if destination remains unclaimed after its four-hour deadline, its funding solver is refunded. Eligible refunds are publicly callable; Cron/Queues can trigger them without redirecting the beneficiary.
10. Present a reconstructed, individually verified two-chain settlement/timeout history, status and receipts.

**Browser recovery is required:** encryption and download of a recovery record using a user-chosen passphrase; decryption locally after app reload and an explicit preimage-reveal confirmation. Worker failure, duplicate queue jobs, event replay and RPC interruption must not cause double payment or invalid state transitions.

## 6. Frozen product interfaces

Exactly **six main product views**: **Home, Swap, Swap details, Activity, Solvers, Proof**. A **Docs** route supports these views. Required functions include faucet, wallet network switching, quote comparison, secret backup/recovery, transaction signing, escrow reads, claim/refund buttons, observable swap status, solver liquidity/status and independent evidence. Accessible loading, failure, disconnected and wrong-chain states and responsive mobile layout are part of completion.

The **two solver identities** share Cloudflare Worker infrastructure. They are independent signing/funding accounts **but not independently hosted companies or decentralized service providers**. Do not claim otherwise.

Supabase tables record intents, quotes, solver profiles, indexed swaps and events, worker checkpoints and health. **Blockchain contract reads and verified receipts remain the sole source of monetary truth.**

## 7. Frozen scope exclusions

No mainnet or real-money transfers; no real USD/USDC promise; no additional chains, assets or trade directions; no AMM, liquidity pool, partial fill or on-chain order book; no protocol token, DAO, governance or staking; no solver bonds/slashing without verifiable cross-chain proof; no iBridge dependency or generic bridge; no cross-chain light-client claims; no price oracle; no gas abstraction; no user-key custody; no WalletConnect, native Substrate browser signing or ink!/WASM contract requirement; no paid backend or Railway; no unverified fake transactions presented as testnet proof.

These are **fixed non-features**, not a future backlog.

## 8. Definition of finished

**Engineering:** complete features in sections 4–6; local Hardhat contracts and adversarial lifecycles; viem helpers and signature checks; two solver quote logic; Cloudflare Cron/Queues/indexer/recovery; Supabase RLS and migrations; complete Next.js routes, responsive UI, secret recovery; all TypeScript, build, lint, unit, integration and browser CI green; documented security assumptions.

**Deployment:** verify live RPC identities and H160→SS58 mapping; fund deployment and solver accounts; demonstrate payable native tPOTv3 transfer and calibrate EVM value precision; deploy all 3 contracts on the intended testnets; configure Cloudflare and Supabase and Vercel; no live deployment may be inferred from a local Hardhat pass.

**Evidence:** actual successful two-solver offer display, a single complete source→destination claim and solver source claim with verified tx receipts, plus real testnet refunds/failure evidence where relevant and local time-travel adversarial tests clearly labelled. Validate balances, code at deployed addresses, log and storage receipts, confirmation depth and source SHA. Do not invent explorer links or network status.

**Submission:** public meaningful Git history in the Oct 14–Nov 6 hackathon period, Oct 24 check-in demo, complete README, architecture and threat model, reproducible setup, pitch deck and maximum-three-minute final demo video. No unsupported security certification or guaranteed scores.

**Quality goal:** target top judge outcomes; **5/5 is an aspiration, not a verifiable guarantee**. A deployed, independently evidenced product is not complete if core security or end-to-end behaviours fail.

## 9. Change control

**This document is the single source of truth.** Fixes needed to make the frozen behaviour correct, secure and verifiable are within scope. No added features, optional deliverables, staged versions, future milestones, undocumented chain assumptions, or new stacks. Any genuine incompatibility must be surfaced explicitly with proof rather than hidden behind a mocked transaction or unilateral redesign.

Current state at scope lock: **source exists on GitHub; live Base Sepolia / Portaldot deployment, Cloudflare/Vercel setup and real cross-chain evidence are still to be verified**.
