# HARBOR

Non-custodial solver-quoted hashlocked settlement from Base Sepolia test hUSD to native tPOTv3 on Portaldot V3 testnet.

**Status:** implementation in progress. No testnet deployment is claimed until transactions and receipts are independently verified.

- Source: Base Sepolia (84532), mock hUSD (6 decimals)
- Destination: Portaldot V3 testnet (420420777), native tPOTv3 (14 decimals)
- Browser signing: injected EIP-1193 / EIP-6963 only
- Cloudflare Workers, Cron and Queues for two solver identities; Supabase for off-chain coordination; Next.js on Vercel.

Production safety notice: this is a testnet hackathon application, not audited software or an exchange for real funds.
