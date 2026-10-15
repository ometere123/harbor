import { config } from "@/lib/config";
import { CopyCheck, FileCheck2, ShieldAlert } from "lucide-react";
export default function Proof(){
  const rows=[["Source escrow",config.sourceEscrow,"Base Sepolia (84532)"],
    ["hUSD demo token",config.sourceToken,"Base Sepolia (84532)"],
    ["Destination escrow",config.destinationEscrow,"Portaldot V3 (420420777)"]] as const;
  return <section className="py-14"><span className="eyebrow">Verification without a bridge explorer</span>
    <h1 className="text-4xl font-semibold mt-4">Protocol proof</h1>
    <p className="muted mt-4 max-w-2xl">Settlement is evidenced by two independent escrow states and their transactions, not a bridge&apos;s off-chain promise.</p>
    <div className="panel p-7 mt-8 space-y-5"><h2 className="text-xl font-semibold flex gap-3 items-center"><FileCheck2 className="text-aqua"/> Contract deployments</h2>
      {rows.map(([name,address,chain])=><div key={name} className="stat">
        <p className="eyebrow">{name}</p><p className="mono text-sm mt-2">{address||"Awaiting confirmed testnet deployment"}</p><p className="muted text-xs mt-2">{chain}</p>
      </div>)}
    </div>
    <div className="panel p-7 mt-5">
      <h2 className="text-xl font-semibold">Portaldot value-scale gate</h2>
      <p className="muted text-sm mt-3 leading-relaxed">
        {config.portaldotValueDecimalsVerified
          ? `Live EVM value calibration is enabled at ${config.destinationValueDecimals} display decimals.`
          : "Live EVM/native-value calibration is not verified, so the application keeps settlement disabled."}
      </p>
    </div>
    <div className="panel p-7 mt-5"><h2 className="text-xl flex gap-3 items-center font-semibold"><ShieldAlert className="text-aqua"/> What is and is not proved</h2>
      <p className="muted text-sm mt-4 leading-relaxed">An escrow claim proves that the corresponding on-chain contract accepted the preimage and executed a payout. It does not, by itself, establish the finality of the other network. A swap is displayed as settled only when source and destination contracts both report CLAIMED.</p>
      <p className="muted text-sm mt-3 leading-relaxed">The transaction index is a cache. The actual contract state, receipt status and RPC network identity should be checked independently. The public GitHub repository contains ABIs, test cases and scripts for reproduction.</p>
    </div>
    <a href="https://github.com/ometere123/harbor" className="btn btn-primary mt-6" target="_blank" rel="noreferrer"><CopyCheck size={16}/> Inspect source code</a>
  </section>;
}
