import Link from "next/link";
const steps=[
  ["1. Connect","Use an injected EIP-1193 EVM wallet. HARBOR asks you to switch between Base Sepolia and Portaldot V3."],
  ["2. Get hUSD","Use the deployed HarborTestUSD.faucet() function on Base Sepolia to mint demonstration tokens."],
  ["3. Receive quotes","Enter your hUSD amount and destination 0x address, create a recovery passphrase and download the encrypted secret backup."],
  ["4. Lock source","Compare two independently signed EIP-712 solver quotes. Approve hUSD and lock the selected amount in HarborSourceEscrow."],
  ["5. Check destination","The designated solver locks tPOTv3 in HarborDestinationEscrow. Verify recipient, hash, solver and exact amount on-chain."],
  ["6. Claim and settle","Decrypt your secret locally and claim Portaldot funds. The solver sees the preimage and claims its hUSD on Base."],
  ["7. Recover if needed","If the destination is not claimed before expiry, the solver refunds its funds. If the source remains locked at its later deadline, the user refunds hUSD."],
];
export default function Docs(){
  return <section className="py-14 max-w-4xl"><span className="eyebrow">Developer and user documentation</span>
    <h1 className="text-4xl font-semibold mt-4">How HARBOR works</h1><p className="muted mt-4 mb-8">One fixed testnet route: Base Sepolia hUSD to native Portaldot V3 tPOTv3.</p>
    <div className="space-y-4">{steps.map(([title,body])=><article className="panel p-6" key={title}><h2 className="text-xl font-semibold">{title}</h2><p className="muted text-sm leading-relaxed mt-3">{body}</p></article>)}</div>
    <div className="panel p-7 mt-8"><h2 className="text-xl font-semibold">Critical account mapping</h2>
      <p className="muted mt-3 leading-relaxed text-sm">Portaldot requires resolving a MetaMask EVM 0x address to its native SS58 5... funding address using Developer → Runtime calls → reviveApi → accountId. Sending native test POT to an unrelated SS58 address will not fund the corresponding EVM account.</p>
      <p className="muted mt-3 text-sm">Native Substrate tPOTv3 is documented at 14 decimals; the EVM RPC value-unit scale must be verified through a live payable deployment. Do not begin swapping until the deployment precision check is complete.</p>
    </div>
    <div className="panel p-7 mt-5"><h2 className="text-xl font-semibold">Security caveats</h2>
      <p className="muted text-sm mt-3 leading-relaxed">HARBOR has not been independently audited. Solvers can fail to fulfil a quote. No atomic transaction exists across Base and Portaldot. Expiration only makes a refund callable; it does not automatically execute it. Protect your encrypted recovery file and passphrase. This is a hackathon testnet product, not financial infrastructure for real assets.</p>
    </div>
    <Link href="/swap" className="btn btn-primary mt-8">Start a test swap</Link>
  </section>;
}
