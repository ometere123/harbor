# HARBOR threat model

This product is a testnet-only HTLC swap demonstration, not a trustless light-client bridge. The source and destination escrows are separate transactions on separate chains. Strong liveness guarantees and unconditional atomic settlement cannot be promised.

**Source safety:** A 24h source deadline begins when the user locks their demo hUSD. Source claims require a secret matching the on-chain commitment. The source claim always pays the quoted solver and fee treasury. Source refunds return everything to the user after expiry.

**Destination safety:** An at-most-4h native-asset escrow begins when a solver funds it. The destination claim always pays the designated user, and the refund always pays the funding solver. Neither administrator nor indexer may redirect either.

**Secret:** Generate 32 cryptographically random bytes locally. Never submit the secret to a quote API. Back up the secret encrypted under a user passphrase before opening the source escrow. Reveal only when a live destination escrow matches every signed quote field.

**Quotes:** EIP-712 binds both chain IDs, both escrow addresses, token, source amount, destination amount, both recipient identities, intent ID, nonce, and quote expiry. Validation on-chain prevents quote tampering. Signed quotes do not guarantee solver solvency.

**Native value representation:** Portaldot documents native tPOTv3 at 14 decimals on its Substrate interface. That does not demonstrate the scaling used by the EVM JSON-RPC value field. Leave PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED=false until a funded payable contract and exact withdrawal demonstrate that mapping with real testnet transactions. Never infer 14 vs 18 from an Ethereum example.

**Operational trust:** Cloudflare Worker has two distinct solver keys and a service-role Supabase connection. The index is not an oracle; the browser re-reads actual escrows before claim. A compromised worker can withhold solver liquidity or manipulate quotes, but cannot seize escrow balances by overriding recipients.

**Replay/reorg:** Log indexing uses configurable confirmation depths rather than formal chain finality proofs. The worker must be checked against native finalization and reorg tests on the live chain. Duplicate delivery is expected; contracts enforce one settlement per intent.

**Business:** Test hUSD and test tPOTv3 have no guaranteed real-world monetary value. Pricing ratios are demo quotations only. There is no solver slashing, bridge custody or legal representation.

**Liquidity admission (atomic):** Each signed solver offer now acquires a
Postgres advisory-lock-protected short-lived liquidity reservation on the
solver identity. It counts *all* outstanding reserved quote+gas obligations,
not merely one offer's `getBalance`. Reservations last 26 minutes to span
the five-minute quote lifetime and 20-minute destination-funding window.
Unpublished failed quote requests release their reservations. A funded lock
reduces the actual on-chain balance; the retained reservation is conservative
until expiry. This limits oversubscription by the two hosted solver identities
but does **not** guarantee fulfilment through RPC outages or insolvency.
Unauthenticated public requests can still exhaust quote capacity; additional
request-level rate limiting and origin restrictions must be validated before
production exposure.
