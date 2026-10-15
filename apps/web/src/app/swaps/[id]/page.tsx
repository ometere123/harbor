"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Clock, ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import { formatUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { useWallet } from "@/lib/wallet";
import { baseClient, destClient, config, ready } from "@/lib/config";
import { BASE_ID, PORTALDOT_ID, sourceAbi, destinationAbi, quoteFromJson, type JsonQuote } from "@harbor/protocol";
import { loadRecovery, unlockRecovery, saveRecovery, downloadRecovery, type Recovery } from "@/lib/recovery";

type Stored={quote:JsonQuote;signature:Hex;sourceTx:Hex};
type Snapshot={
  source:readonly [string,string,Hex,bigint,bigint,bigint,number];
  destination:readonly [string,string,Hex,bigint,bigint,number];
};
const status=(s:number)=>["NOT FUNDED","LOCKED","CLAIMED","REFUNDED"][s]||"UNKNOWN";
export default function SwapDetails(){
  const {id}=useParams<{id:string}>();
  const wallet=useWallet();
  const [stored,setStored]=useState<Stored|null>(null);
  const [recovery,setRecovery]=useState<Recovery|null>(null);
  const [passphrase,setPassphrase]=useState("");
  const [importJson,setImportJson]=useState("");
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [events,setEvents]=useState<{event_name:string;tx_hash:string;chain:string}[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const refresh=useCallback(async()=>{
    if(!/^0x[0-9a-fA-F]{64}$/.test(id)||!ready())return;
    try{
      const [source,destination]=await Promise.all([
        baseClient.readContract({address:config.sourceEscrow!,abi:sourceAbi,functionName:"swaps",args:[id as Hex]}),
        destClient.readContract({address:config.destinationEscrow!,abi:destinationAbi,functionName:"swaps",args:[id as Hex]}),
      ]);
      setSnapshot({source:source as Snapshot["source"],destination:destination as Snapshot["destination"]});
      const res=await fetch("/api/harbor/v1/swaps/"+id,{cache:"no-store"});
      if(res.ok)setEvents((await res.json()).events||[]);
    }catch(e){setError("Chain state could not be loaded: "+String(e));}
  },[id]);

  useEffect(()=>{
    try{
      const r=localStorage.getItem("harbor-swap:"+id.toLowerCase());
      if(r)setStored(JSON.parse(r) as Stored);
      setRecovery(loadRecovery(id));
    }catch{setError("Saved swap data could not be read.");}
  },[id]);
  useEffect(()=>{
    void refresh();
    const timer=setInterval(()=>void refresh(),15000);
    return ()=>clearInterval(timer);
  },[refresh]);

  function importRecovery(){
    try{
      const imported=JSON.parse(importJson) as Recovery;
      if(imported.protocol!=="HARBOR-RECOVERY-1" || imported.intentId.toLowerCase()!==id.toLowerCase())throw Error("Recovery file does not match this swap");
      saveRecovery(imported);setRecovery(imported);setError("");setMessage("Encrypted record imported. Enter the recovery passphrase to claim.");
    }catch(e){setError(String(e));}
  }

  async function claimDestination(){
    if(!recovery||!snapshot||!stored||!wallet.address)throw Error("Connect the destination wallet and restore the signed swap record");
    const q=quoteFromJson(stored.quote),[solver,recipient,hash,amount,deadline,st]=snapshot.destination;
    if(st!==1)throw Error("Destination escrow is not claimable.");
    if(BigInt(Math.floor(Date.now()/1000))>=deadline)throw Error("Destination escrow has expired.");
    if(solver.toLowerCase()!==q.destinationSolver.toLowerCase()||
      recipient.toLowerCase()!==q.destinationUser.toLowerCase()||
      hash!==q.secretHash || amount!==q.destinationAmount ||
      snapshot.source[1].toLowerCase()!==q.solver.toLowerCase()||
      snapshot.source[2]!==q.secretHash||snapshot.source[3]!==q.sourceAmount||
      snapshot.source[6]!==1)throw Error("On-chain destination/source escrows do not match the selected signed quote.");
    if(wallet.address.toLowerCase()!==q.destinationUser.toLowerCase())throw Error("Connect the destination recipient wallet first.");
    setBusy(true);setError("");
    try{
      setMessage("Decrypting secret locally");
      const secret=await unlockRecovery(recovery,passphrase);
      setMessage("Confirm the Portaldot destination claim in your wallet");
      const tx=await wallet.send(PORTALDOT_ID,async(client,account)=>
        client.writeContract({address:config.destinationEscrow!,abi:destinationAbi,functionName:"claim",
          args:[id as Hex,secret],account,chain:undefined as never}));
      const receipt=await destClient.waitForTransactionReceipt({hash:tx as Hex});
      if(receipt.status!=="success")throw Error("Destination claim reverted.");
      setMessage("Destination claimed. The secret is now public and the solver can claim source funds.");
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }

  async function refundSource(){
    if(!wallet.address||!snapshot)throw Error("Connect your wallet first");
    if(wallet.address.toLowerCase()!==snapshot.source[0].toLowerCase())throw Error("Connect the source user wallet");
    if(snapshot.source[6]!==1||BigInt(Math.floor(Date.now()/1000))<snapshot.source[5])throw Error("Source refund is not due");
    setBusy(true);setError("");
    try{
      const tx=await wallet.send(BASE_ID,async(client,account)=>
        client.writeContract({address:config.sourceEscrow!,abi:sourceAbi,functionName:"refund",args:[id as Hex],account,chain:baseSepolia}));
      const receipt=await baseClient.waitForTransactionReceipt({hash:tx as Hex});
      if(receipt.status!=="success")throw Error("Refund reverted");
      setMessage("Your hUSD was refunded to the original source account");await refresh();
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  if(!/^0x[a-fA-F0-9]{64}$/.test(id))return <p className="py-20 text-red-300">Invalid swap identifier.</p>;
  const q=stored?quoteFromJson(stored.quote):null;
  const safeDest=!!q&&!!snapshot&&snapshot.destination[5]===1&&
    snapshot.destination[0].toLowerCase()===q.destinationSolver.toLowerCase()&&
    snapshot.destination[1].toLowerCase()===q.destinationUser.toLowerCase()&&
    snapshot.destination[2]===q.secretHash&&snapshot.destination[3]===q.destinationAmount;
  return <section className="py-12 max-w-4xl mx-auto">
    <span className="eyebrow">Independent on-chain state</span>
    <h1 className="text-4xl font-semibold mt-3 mb-2">Swap details</h1>
    <p className="mono muted text-xs mb-8">{id}</p>
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      <div className="panel p-6">
        <p className="eyebrow">Base Sepolia · source</p>
        <h2 className="text-2xl mt-3 font-semibold">{snapshot?status(snapshot.source[6]):"Loading…"}</h2>
        <p className="muted mt-2">{snapshot?formatUnits(snapshot.source[3],6)+" hUSD":"Awaiting chain connection"}</p>
        <p className="text-xs muted mt-3">Deadline: {snapshot?.source[5]?new Date(Number(snapshot.source[5])*1000).toLocaleString():"—"}</p>
      </div>
      <div className="panel p-6">
        <p className="eyebrow">Portaldot V3 · destination</p>
        <h2 className="text-2xl mt-3 font-semibold">{snapshot?status(snapshot.destination[5]):"Loading…"}</h2>
        <p className="muted mt-2">{snapshot?formatUnits(snapshot.destination[3],config.destinationValueDecimals)+" tPOTv3":"Awaiting solver"}</p>
        <p className="text-xs muted mt-3">Deadline: {snapshot?.destination[4]?new Date(Number(snapshot.destination[4])*1000).toLocaleString():"—"}</p>
      </div>
    </div>
    {snapshot?.destination[5]===1&&<div className="panel p-6 mb-5">
      <p className="flex gap-2 items-center text-aqua font-semibold"><ShieldCheck size={19}/> Destination escrow ready</p>
      <p className="muted text-sm mt-2">{safeDest?"On-chain escrow recipient, solver, hashlock and value match the signed quote.":"The signed quote is missing or the escrow fields do not match. Claim is blocked."}</p>
    </div>}
    <div className="panel p-6 space-y-5 mb-5">
      <h2 className="text-xl font-semibold">Recovery and actions</h2>
      {recovery?<p className="text-aqua text-sm flex items-center gap-2"><CheckCircle2 size={15}/> Encrypted recovery record available</p>:
        <p className="text-yellow-200 text-sm">No local recovery record. Import the encrypted JSON backup created before you locked hUSD.</p>}
      {recovery&&<button className="btn btn-outline" onClick={()=>downloadRecovery(recovery)}><Download size={16}/> Save recovery record</button>}
      {!recovery&&<div className="space-y-3"><textarea className="field h-32" placeholder="Paste contents of harbor-recovery-*.json" value={importJson} onChange={e=>setImportJson(e.target.value)}/>
        <button className="btn btn-outline" onClick={importRecovery}>Import encrypted record</button></div>}
      {snapshot?.destination[5]===1&&<div className="space-y-3">
        <label htmlFor="unlock" className="block text-sm">Recovery passphrase</label>
        <input id="unlock" type="password" className="field" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/>
        <button className="btn btn-primary" disabled={!wallet.connected||!recovery||!safeDest||busy||!stored} onClick={()=>void claimDestination()}>
          Claim tPOTv3 on Portaldot <ArrowUpRight size={17}/>
        </button>
      </div>}
      {snapshot?.source[6]===1&&BigInt(Math.floor(Date.now()/1000))>=snapshot.source[5]&&
        <button className="btn btn-outline" disabled={busy||!wallet.connected} onClick={()=>void refundSource()}>
          Refund my source hUSD <Clock size={15}/>
        </button>}
      {snapshot?.destination[5]===0&&snapshot.source[6]===1&&<p className="muted text-sm flex gap-2 items-center"><Clock size={16}/> Waiting for the selected solver to fund Portaldot. If it fails, your source hUSD becomes refundable after the source deadline.</p>}
      {snapshot?.source[6]===2&&snapshot.destination[5]===2&&<p className="text-aqua flex gap-2 items-center"><CheckCircle2/> Both escrows settled successfully.</p>}
      {message&&<p className="text-aqua text-sm" role="status">{message}</p>}
      {error&&<p className="text-red-300 text-sm" role="alert">{error}</p>}
    </div>
    <div className="panel p-6">
      <h2 className="text-xl font-semibold">Observed transactions</h2>
      <p className="muted text-sm mt-2">Indexed confirmed events. Confirm against on-chain contract state above.</p>
      <div className="space-y-3 mt-5">{events.length?events.map((event,i)=><div key={i} className="stat">
        <b className="text-sm">{event.event_name}</b><p className="muted text-xs mt-1">{event.chain}</p>
        <p className="mono text-xs mt-2">{event.tx_hash}</p></div>):
        <p className="muted text-sm">No indexed events yet. Indexing runs on Cloudflare's scheduled queue.</p>}</div>
    </div>
  </section>;
}
