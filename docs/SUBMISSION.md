# Portaldot Hacker House 2026 submission brief

This is the truthful submission brief for HARBOR. It is ready for the DoraHacks description, pitch deck and demonstration recording, but live deployment fields must only be filled after the Portaldot V3 and Base Sepolia gates in [evidence](evidence/README.md) pass.

## DoraHacks description

HARBOR is a non-custodial, solver-quoted testnet settlement route from Base Sepolia hUSD to Portaldot V3 native tPOTv3. Two independently funded solver identities compete with five-minute EIP-712 quotes. A user locks six-decimal hUSD in `HarborSourceEscrow`; the selected solver funds `HarborDestinationEscrow` with native tPOTv3; the user verifies the destination escrow and reveals a secret only when claiming the destination funds. That public secret lets the solver claim the source payment, less a 20-basis-point protocol fee. Expiry refunds remain permissionless.

The system demonstrates practical cross-chain infrastructure without a custody authority, bridge, AMM, browser Substrate signer or arbitrary-chain abstraction. The chain contracts are authoritative; Cloudflare Workers, Queues and Supabase provide retryable coordination and indexed history only. The browser uses injected EIP-1193/EIP-6963 wallets and locally encrypted recovery material. The scope is deliberately one auditable route, two solver identities and three Solidity contracts.

## Architecture

~~~text
  Injected wallet + Next.js UI
          | quotes, encrypted recovery, on-chain verification
          v
  Cloudflare Worker / Queue / Cron
    |                         |
 Base Sepolia RPC       Portaldot V3 EVM RPC
    |                         |
 HarborSourceEscrow     HarborDestinationEscrow
    |                         |
  6-decimal hUSD       native tPOTv3
          ^                         ^
          | source claim             | destination claim
          +--------- Keccak-256 secret -+

 Supabase Postgres = coordination/index only; it cannot move escrow funds.
~~~

## Trust and security boundary

The user wallet controls source approval, source lock, destination verification and claims. The solver keys can fund a destination and claim a source payment, but cannot withdraw another solver's funds, alter beneficiaries, change a quote after signing or recover escrow balances through an admin shortcut. Anyone can call the permissionless claim/refund methods after the contract predicates are true. The source contract verifies the EIP-712 domain, chain IDs, quote expiry, unique intent and replay state; both contracts use hashlocks and reentrancy protection. See [THREAT_MODEL.md](THREAT_MODEL.md) for the detailed adversarial model and accepted limitations.

## Solver economics

Solvers publish competing quotes with a source hUSD amount and destination tPOTv3 amount. The selected solver must reserve the destination amount plus gas before funding. The protocol fee is 20 basis points of the successfully claimed source amount and is transferred only during source settlement; failed or refunded swaps do not create a fee. There is no slashing or custody pool. A solver may decline an unfunded or uneconomic fill, and the permissionless destination refund protects its capital after the destination deadline.

## User instructions

1. Connect an injected EVM wallet and select Base Sepolia.
2. Mint faucet hUSD, enter an amount and generate the encrypted recovery download.
3. Compare Alpha and Bravo quotes, select one, approve hUSD and lock the source escrow.
4. Wait for the selected solver to fund the destination. Verify recipient, solver, amount, hashlock and source quote commitment on-chain.
5. Switch to Portaldot V3 in the injected EVM wallet and claim the destination with the locally restored secret.
6. Switch back to Base Sepolia and verify the solver source claim and fee event.
7. If a fill fails, use the detail screen's eligibility checks; source and destination refunds remain permissionless after their separate deadlines.

Never paste the plaintext secret into the quote API. Do not claim before the destination escrow has been independently verified. If the browser session is lost, import the encrypted recovery JSON and password on the swap detail screen.

## Funding and deployment record

The final public record must replace each `PENDING` value with a checked value:

| Item | Value |
| --- | --- |
| Git commit | `PENDING` |
| Vercel URL | `PENDING` |
| Base hUSD | `PENDING` |
| Base HarborSourceEscrow | `PENDING` |
| Portaldot HarborDestinationEscrow | `PENDING` |
| Solver Alpha address | `PENDING` |
| Solver Bravo address | `PENDING` |
| Base deployment tx/block | `PENDING` |
| Portaldot deployment tx/block | `PENDING` |
| Complete settlement tx set | `PENDING` |

Fund deployers with Base Sepolia ETH and solvers with Portaldot V3 tPOTv3 from the official testnet distribution. For each solver, call the Portaldot V3 runtime's `reviveApi.accountId` with its EVM H160 and send native funds to the returned SS58 account. Measure the EVM raw-value scale with a controlled transfer and payable contract before enabling the precision flag. The official Portaldot V3 guide is [here](https://github.com/ItsCogumellum/portaldot-v3-testnet-guide).

## Three-minute demonstration script

**0:00–0:20 — problem and route.** Show the Base Sepolia → Portaldot V3 route, the two escrows and the non-custodial boundary.

**0:20–0:55 — quote competition.** Connect an injected wallet, mint faucet hUSD, generate the encrypted backup and show two different signed solver quotes with five-minute expiry.

**0:55–1:35 — source lock and destination funding.** Approve and lock hUSD. Show the source receipt, selected solver and the Worker/Queue status. Open the destination record and compare the recipient, value and hashlock directly against the on-chain read.

**1:35–2:10 — claim and settlement.** Switch to Portaldot V3, claim with the locally restored secret, then show the source claim and 20-basis-point fee. Display both receipts and final balances.

**2:10–2:35 — failure safety.** Show a refund-eligible or abandoned testnet swap and the permissionless refund. Briefly show forged quote, invalid secret and replay rejection from the adversarial test evidence.

**2:35–3:00 — contribution and limits.** Show the architecture, live contract addresses and reproducible evidence links. State clearly that this is testnet-only infrastructure, not a bridge with light-client security, oracle pricing or real-money assets.

## Pitch deck outline

1. HARBOR: non-custodial settlement for Portaldot V3.
2. Problem: opaque relayers and custodial bridge assumptions.
3. Product flow: quote → source lock → destination escrow → verified claim.
4. Protocol architecture and authoritative/non-authoritative boundaries.
5. Security: typed quotes, hashlocks, expiries, replay resistance and permissionless recovery.
6. Solver economics and reliability: two identities, funding checks, queues, retries and checkpoints.
7. Live proof: contract addresses, receipts, state reads and balance deltas.
8. Ecosystem contribution, limitations and next safe extension.

## Current limitation

As of the repository audit on 2026-10-15, live Portaldot V3 RPC resolution, deployment credentials and hosting/service credentials were unavailable. Accordingly, no live deployment, production URL or transaction hash is claimed in this repository. That is an explicit release blocker, not a simulated pass.
