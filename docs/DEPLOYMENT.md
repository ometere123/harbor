# HARBOR testnet deployment and proof gates

**Current source code is not proof of a completed live deployment.** The actual endpoints have had third-party reported outages. Only upload deployment manifests containing independently checked transactions.

## 1. Prepare environment

- Node.js 22, pnpm 9.15.9, Git.
- Copy .env.example to .env.local and export secrets into the terminal environment for Hardhat. Hardhat loads .env with dotenv.
- Fill SOLVER_ALPHA_PRIVATE_KEY and SOLVER_BRAVO_PRIVATE_KEY as dedicated *testnet* keys in Cloudflare secrets. Never reuse an important wallet or put keys in any Next.js NEXT_PUBLIC_* environment variable.
- Confirm two independent EVM signer addresses and mapped Portaldot native SS58 funding addresses from Developer / Runtime calls / reviveApi / accountId.
- Fund deployers and solvers from official testnet token distribution. Base Sepolia deployers need test ETH. Solvers need tPOTv3.
- Create a Supabase free project, execute supabase/migrations/001_harbor.sql in SQL editor. Tables are service-role only by design.

## 2. Verification before writes

- Verify base chain ID 84532 and Portaldot ID 420420777.
- Run live value-unit calibration. Native Substrate POT has 14 decimals, while wallet/EVM RPC may represent currency in 18-decimal wei. Do a controlled native SS58 transfer to its H160 mapping, compare actual eth_getBalance delta, deploy a payable contract, send a known raw msg.value, claim/refund the exact value and check the returned balances. Only then set DEST_EVM_VALUE_DECIMALS and PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED=true in Cloudflare vars. Record transaction hashes.
- Verify RPC fee estimation, events and receipts, contract compilation and published runtime metadata.
- Never use legacy Portaldot mainnet or old local V2 devnet as proof of Portaldot V3 compatibility.

## 3. Deploy contracts

1. pnpm install --no-frozen-lockfile
2. pnpm compile && pnpm test
3. Set SOLVER_ALPHA_ADDRESS and SOLVER_BRAVO_ADDRESS derived from the dedicated solver private keys. Run pnpm exec hardhat run scripts/deploy/portaldot.ts --network portaldotV3
4. Export DESTINATION_ESCROW_ADDRESS from deployments/portaldot-v3.json
5. Export TREASURY_ADDRESS to a dedicated testnet address
6. pnpm exec hardhat run scripts/deploy/base.ts --network baseSepolia
7. Fill SOURCE_TOKEN_ADDRESS, SOURCE_ESCROW_ADDRESS, DESTINATION_ESCROW_ADDRESS and chain start blocks in worker secrets and Next.js env.
8. Verify every receipt, code presence and embedded constructor settings from both RPCs.

Do not consider a deployment accepted just because a transaction hash was returned. Check receipt.status and readable contract code.

## 4. Cloudflare Workers

1. Run the SQL migration.
2. Run pnpm --filter @harbor/solver exec wrangler queues create harbor-jobs
3. Run pnpm --filter @harbor/solver exec wrangler queues create harbor-dead-letter
4. Populate secrets using wrangler secret put for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SOURCE_TOKEN_ADDRESS, SOURCE_ESCROW_ADDRESS, DESTINATION_ESCROW_ADDRESS, SOLVER_ALPHA_PRIVATE_KEY, SOLVER_BRAVO_PRIVATE_KEY, WORKER_ADMIN_TOKEN, SOURCE_START_BLOCK and DEST_START_BLOCK. Provide accurate deployment block numbers; scanning from genesis can consume large free allowances.
5. Set verified EVM value decimals in wrangler.toml only after real measurement.
6. Run pnpm --filter @harbor/solver deploy.
7. Check /health, /v1/solvers, and trigger a controlled /internal/scan with the admin bearer token.
8. Verify queue consumption, checkpoint progress, retries and dead-letter monitoring.

Cloudflare Workers Free CPU and queue-operation allowances must be checked against actual runtime cost, especially secp256k1 signing, JSON-RPC requests and event indexing. Cron is not a permanent process.

## 5. Next.js Vercel

Set Vercel project root to apps/web and package manager pnpm, or build from monorepo root depending on workspace configuration. Configure public chain IDs/RPCs and confirmed contract addresses. Set WORKER_API_URL as a server-side secret/unexposed variable. Deploy only after pnpm build and Playwright pass.

## 6. Real end-to-end proof

- Request two verified distinct solver quotes.
- Download encrypted recovery JSON before signing source lock.
- Faucet hUSD and approve.
- Open source escrow and independently read source status.
- Worker confirms source and funds destination; verify amount, recipient, signer and matching hash directly on Portaldot.
- User decrypts locally and claims destination with injected wallet.
- Confirm worker receives public secret, claims source, protocol fee and both receipts.
- Separately demonstrate solver no-funding and timeout/refund on live testnet when time allows, with accelerated expiry testing on isolated local Hardhat.
- Record explorer links if available, otherwise tx hashes, block heights and RPC reproduction commands.
- Preserve deploy artifact SHA, source commit, ABI and test output in docs/evidence.

## 7. Hackathon submission

Maintain substantial Git commits Oct 14–Nov 6. October 24 check-in requires a functional prototype, README, architecture and ≤3m demo. Final code freeze Nov 6 04:00 UTC. Create a ≤3m end-to-end demo video and pitch deck, and do not claim fake/simulated transactions as real V3 proof.
