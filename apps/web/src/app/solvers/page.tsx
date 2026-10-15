"use client";
import { useEffect,useState } from "react";
import { Radio, Activity, Shield } from "lucide-react";
type Entry={name:string;address:string;rateBps:string};
export default function Solvers(){
  const [solvers,setSolvers]=useState<Entry[]>([]),[error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{fetch("/api/harbor/v1/solvers").then(async r=>{if(!r.ok)throw Error("Solver API unavailable");return r.json();})
    .then(x=>setSolvers(x.solvers||[])).catch(e=>setError(String(e))).finally(()=>setLoading(false));},[]);
  return <section className="py-14"><span className="eyebrow">Independent signing identities</span>
    <h1 className="text-4xl font-semibold mt-4">Solver network</h1>
    <p className="muted mt-4 max-w-2xl">Two independently funded testnet solver identities quote for the same intent. They share the prototype&apos;s Cloudflare infrastructure; this is not a decentralised permissionless solver network.</p>
    <div className="grid md:grid-cols-2 gap-5 mt-9">
      {loading&&<p className="muted" role="status">Loading solver identities…</p>}
      {solvers.map(s=><div key={s.address} className="panel p-7">
        <Radio className="text-aqua mb-6"/><h2 className="text-2xl font-semibold">Solver {s.name}</h2>
        <p className="eyebrow mt-5">Signing address</p><p className="mono text-sm mt-2">{s.address}</p>
        <p className="muted text-sm mt-5">Fixed demonstration quote ratio: {(Number(s.rateBps)/10000).toString()} tPOTv3 per 1 hUSD, before any timing/rate constraints.</p>
      </div>)}
    </div>
    {error&&<div className="panel p-6 mt-6 text-yellow-200">{error}</div>}
    <div className="grid md:grid-cols-2 gap-4 mt-8">
      <div className="stat"><Activity className="text-aqua mb-3"/><b>Automated execution</b><p className="muted text-sm mt-2">Cloudflare Cron schedules confirmation-safe block scans and funding/claim/refund jobs.</p></div>
      <div className="stat"><Shield className="text-aqua mb-3"/><b>Immutable recipients</b><p className="muted text-sm mt-2">Neither a solver nor an API operator can redirect an already locked user&apos;s designated destination funds.</p></div>
    </div>
  </section>;
}
