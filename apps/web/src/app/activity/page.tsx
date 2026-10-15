"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
type Swap={intent_id:string;source_status:string;destination_status:string;source_tx?:string;destination_tx?:string;created_at:string};
export default function Activity(){
  const {address}=useWallet();
  const [swaps,setSwaps]=useState<Swap[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!address){setSwaps([]);return;}
    let active=true;
    fetch("/api/harbor/v1/activity/"+address).then(async res=>{
      if(!res.ok)throw Error("History unavailable");
      return res.json();
    }).then(body=>{if(active)setSwaps(body.swaps||[]);}).catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[address]);
  return <section className="py-14"><span className="eyebrow">Trade history</span>
    <h1 className="text-4xl font-semibold mt-4">Your activity</h1>
    <p className="muted mt-4">The index is a convenience. Every swap detail page independently reads both chain escrows.</p>
    {!address&&<div className="panel p-7 mt-8">Connect your injected wallet to see the swaps associated with it.</div>}
    {error&&<p className="text-red-300 mt-6">{error}</p>}
    <div className="grid gap-4 mt-8">{swaps.map(s=><Link href={"/swaps/"+s.intent_id} key={s.intent_id} className="panel p-6 hover:border-aqua">
      <b className="mono text-sm">{s.intent_id.slice(0,14)}…{s.intent_id.slice(-9)}</b>
      <div className="flex gap-3 mt-3"><span className="stat text-sm">Base: {s.source_status}</span><span className="stat text-sm">Portaldot: {s.destination_status}</span></div>
      <p className="muted text-xs mt-3">{new Date(s.created_at).toLocaleString()}</p>
    </Link>)}
      {address&&!swaps.length&&<div className="panel p-7 muted">No indexed swap activity yet. Start a <Link href="/swap" className="text-aqua underline">testnet swap</Link>.</div>}
    </div>
  </section>;
}
