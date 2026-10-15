"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Download, AlertTriangle } from "lucide-react";
import { recoverTypedDataAddress, type Address, type Hex, formatUnits, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { BASE_ID, PORTALDOT_ID, randomHex32, secretHashOf, typedQuote, quoteDomain, quoteFromJson,
  validQuote, tokenAbi, sourceAbi, type JsonQuote } from "@harbor/protocol";
import { useWallet } from "@/lib/wallet";
import { baseClient, config, ready } from "@/lib/config";
import { createRecovery, saveRecovery, downloadRecovery, type Recovery } from "@/lib/recovery";

type Offer={solverName:string;quote:JsonQuote;signature:Hex};
export default function Swap(){
  const router=useRouter();
  const wallet=useWallet();
  const [amount,setAmount]=useState("10");
  const [destUser,setDestUser]=useState("");
  const [passphrase,setPassphrase]=useState("");
  const [offers,setOffers]=useState<Offer[]>([]);
  const [backup,setBackup]=useState<Recovery|null>(null);
  const [downloaded,setDownloaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [phase,setPhase]=useState("");
  const [walletBalance,setWalletBalance]=useState<string>("");
  const [selected,setSelected]=useState<number|null>(null);
  const usdRaw=(()=>{try{return parseUnits(amount,6);}catch{return 0n;}})();
  const effectiveRecipient=(destUser||wallet.address||"").trim();

async function faucet(){
    if(!wallet.address || !config.sourceToken)throw Error("Connect your wallet and configure the source token");
    setBusy(true);setError("");setPhase("Requesting test hUSD from faucet");
    try{
      const tx=await wallet.send(BASE_ID,async(client,account)=>
        client.writeContract({address:config.sourceToken!,abi:tokenAbi,functionName:"faucet",args:[],account,chain:baseSepolia}));
      const receipt=await baseClient.waitForTransactionReceipt({hash:tx as Hex});
      if(receipt.status!=="success")throw Error("Faucet reverted");
      const balance=await baseClient.readContract({address:config.sourceToken!,abi:tokenAbi,functionName:"balanceOf",args:[wallet.address]});
      setWalletBalance(formatUnits(balance,6));
      setPhase("Test hUSD received");
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function getQuotes(){
    if(!wallet.address||!ready())throw Error("Connect a wallet and configure deployed contract addresses.");
    if(!/^0x[a-fA-F0-9]{40}$/.test(effectiveRecipient))throw Error("Enter the Portaldot EVM recipient address.");
    if(usdRaw<500_000n||usdRaw>100_000_000n)throw Error("Allowed amount is 0.5 to 100 hUSD.");
    if(passphrase.length<12)throw Error("Choose a recovery passphrase of 12 or more characters.");
    setBusy(true);setError("");setOffers([]);setDownloaded(false);
    try{
      setPhase("Generating encrypted recovery backup");
      const secret=randomHex32(),intentId=randomHex32();
      const record=await createRecovery(intentId,secret,passphrase);
      saveRecovery(record);
      setBackup(record);
      // Plaintext secret never enters any network request.
      setPhase("Requesting signed solver quotes");
      const res=await fetch("/api/harbor/v1/quotes",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({intentId,secretHash:secretHashOf(secret),user:wallet.address,
          destinationUser:effectiveRecipient,sourceAmount:usdRaw.toString()})});
      const json=await res.json();
      if(!res.ok)throw Error(json.error||"Solver quotes unavailable");
      const valid:Offer[]=[];
      for(const offer of json.quotes as Offer[]){
        const q=quoteFromJson(offer.quote);
        if(!validQuote(q,BigInt(Math.floor(Date.now()/1000)))||
          q.secretHash!==record.secretHash||q.intentId!==intentId||
          q.sourceEscrow.toLowerCase()!==config.sourceEscrow!.toLowerCase()||
          q.sourceToken.toLowerCase()!==config.sourceToken!.toLowerCase()||
          q.destinationEscrow.toLowerCase()!==config.destinationEscrow!.toLowerCase()||
          q.sourceChainId!==BigInt(BASE_ID)||q.destinationChainId!==BigInt(PORTALDOT_ID)||
          q.user.toLowerCase()!==wallet.address.toLowerCase()||
          q.destinationUser.toLowerCase()!==effectiveRecipient.toLowerCase()||
          q.sourceAmount!==usdRaw)throw Error("Solver returned a quote with mismatched terms");
        const recovered=await recoverTypedDataAddress({domain:quoteDomain(config.sourceEscrow!),types:typedQuote,primaryType:"Quote",message:q,signature:offer.signature});
        if(recovered.toLowerCase()!==q.solver.toLowerCase())throw Error("Solver quote signature is invalid");
        valid.push(offer);
      }
      if(valid.length!==2||valid[0].quote.solver.toLowerCase()===valid[1].quote.solver.toLowerCase())throw Error("Two distinct signed offers required");
      const completed={...record,offers:valid.map(x=>({quote:x.quote,signature:x.signature}))};
      saveRecovery(completed);setBackup(completed);setDownloaded(false);
      setOffers(valid);setPhase("Choose a solver");
    }catch(e){setError(e instanceof Error?e.message:String(e));setPhase("");}
    finally{setBusy(false);}
  }

  async function lockSource(index:number){
    if(!wallet.address||!backup||!downloaded||!ready())throw Error("First download the encrypted backup and connect your wallet.");
    const offer=offers[index],q=quoteFromJson(offer.quote);
    if(!validQuote(q,BigInt(Math.floor(Date.now()/1000))))throw Error("Quote expired. Request new quotes.");
    setBusy(true);setError("");setSelected(index);
    try{
      setPhase("Checking hUSD allowance");
      const allowance=await baseClient.readContract({address:config.sourceToken!,abi:tokenAbi,
        functionName:"allowance",args:[wallet.address,config.sourceEscrow!]});
      if(allowance<q.sourceAmount){
        setPhase("Approve hUSD in your wallet");
        const tx=await wallet.send(BASE_ID,async(client,account)=>
          client.writeContract({address:config.sourceToken!,abi:tokenAbi,functionName:"approve",
            args:[config.sourceEscrow!,q.sourceAmount],account,chain:baseSepolia}));
        const receipt=await baseClient.waitForTransactionReceipt({hash:tx as Hex});
        if(receipt.status!=="success")throw Error("Token approval reverted");
      }
      setPhase("Sign the source escrow transaction");
      const tx=await wallet.send(BASE_ID,async(client,account)=>
        client.writeContract({address:config.sourceEscrow!,abi:sourceAbi,functionName:"openSwap",
          args:[q,offer.signature],account,chain:baseSepolia}));
      const receipt=await baseClient.waitForTransactionReceipt({hash:tx as Hex});
      if(receipt.status!=="success")throw Error("Source escrow reverted");
      const stored={quote:offer.quote,signature:offer.signature,sourceTx:tx};
      localStorage.setItem("harbor-swap:"+q.intentId.toLowerCase(),JSON.stringify(stored));
      setPhase("Source funds locked");
      router.push("/swaps/"+q.intentId);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }

  return <section className="py-12 md:py-16 max-w-4xl mx-auto">
    <span className="eyebrow">Non-custodial intent settlement</span>
    <h1 className="text-4xl md:text-5xl font-semibold mt-4">Swap to Portaldot</h1>
    <p className="muted mt-3 mb-9">Compare two signed solver quotes. Your hUSD is held by a Base Sepolia contract, never by the solver.</p>
    <div className="panel p-6 md:p-9 space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="stat"><p className="eyebrow">Pay on Base Sepolia</p><h2 className="mt-2 text-xl font-semibold">hUSD</h2><p className="muted text-xs">Test ERC-20 · 6 decimals</p></div>
        <div className="stat"><p className="eyebrow">Receive on Portaldot V3</p><h2 className="mt-2 text-xl font-semibold">tPOTv3</h2><p className="muted text-xs">Native testnet currency · confirmed EVM units required</p></div>
      </div>
      <div className="stat flex flex-wrap gap-4 items-center justify-between"><div><p className="eyebrow">Demo token faucet</p><p className="muted text-sm mt-2">1,000 hUSD per wallet, once every 24 hours.</p>{walletBalance&&<p className="text-aqua mt-2">Your balance: {walletBalance} hUSD</p>}</div><button className="btn btn-outline" disabled={!wallet.address||busy||!config.sourceToken} onClick={()=>void faucet()}>Mint test hUSD</button></div>
      <div><label className="text-sm block mb-2" htmlFor="amount">You pay (hUSD)</label>
        <input id="amount" className="field text-xl" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setOffers([]);}}/>
        <p className="muted text-xs mt-2">0.5 to 100 hUSD per swap. Demo-only exchange rates.</p>
      </div>
      <div><label className="text-sm block mb-2" htmlFor="recipient">Portaldot EVM recipient</label>
        <input id="recipient" className="field mono text-sm" value={destUser} onChange={e=>{setDestUser(e.target.value);setOffers([]);}}
          placeholder={wallet.address||"0x... (connect wallet to use same account)"}/>
        <p className="muted text-xs mt-2">Use an injected-wallet EVM address you control on Portaldot, not a 5... SS58 address.</p>
      </div>
      <div><label className="text-sm block mb-2" htmlFor="passphrase">Recovery passphrase</label>
        <input id="passphrase" type="password" autoComplete="new-password" className="field" value={passphrase}
          onChange={e=>setPassphrase(e.target.value)} placeholder="At least 12 characters"/>
        <p className="muted text-xs mt-2">Encrypts your secret locally. Never transmitted to a server. Losing both passphrase and backup means waiting for a refundable timeout.</p>
      </div>
      {!wallet.connected&&<p className="text-yellow-200 text-sm flex gap-2"><AlertTriangle size={16}/> Connect an injected wallet using the top-right button.</p>}
      {!ready()&&<p className="text-yellow-200 text-sm flex gap-2"><AlertTriangle size={16}/> Live contract addresses and Portaldot EVM value-unit calibration are required before swaps are enabled.</p>}
      <button className="btn btn-primary w-full" disabled={!wallet.connected||busy||!ready()} onClick={()=>void getQuotes()}>
        Request competing quotes <ArrowRight size={16}/>
      </button>
      {backup&&<div className="border border-aqua/30 p-5 rounded-xl bg-aqua/5">
        <b className="text-aqua flex gap-2 items-center"><CheckCircle2 size={17}/> Encrypted recovery record created</b>
        <p className="muted text-sm mt-2">Download and safely store this encrypted record before locking any funds. It is useless without your passphrase.</p>
        <button className="btn btn-outline mt-3" disabled={busy} onClick={()=>{downloadRecovery(backup);setDownloaded(true);}}>
          <Download size={17}/> Download encrypted recovery file
        </button>
      </div>}
      {!!offers.length&&<div className="space-y-3">
        <h2 className="font-semibold text-xl">Signed solver quotes</h2>
        {offers.map((offer,index)=>{
          const q=quoteFromJson(offer.quote);
          return <div key={offer.quote.solver} className="stat flex flex-wrap items-center justify-between gap-3">
            <div><b>{offer.solverName}</b><p className="muted mono text-xs">{q.solver.slice(0,10)}…{q.solver.slice(-6)}</p>
              <p className="text-2xl font-semibold mt-2">{formatUnits(q.destinationAmount,config.destinationValueDecimals)} tPOTv3</p>
              <p className="muted text-xs">Expires {new Date(Number(q.expiresAt)*1000).toLocaleTimeString()}</p></div>
            <button className="btn btn-primary" disabled={busy||!downloaded} onClick={()=>void lockSource(index)}>
              {busy&&selected===index?"Signing…":"Select & lock"}
            </button>
          </div>;
        })}
        <p className="muted text-xs">The wallet will request hUSD approval if necessary, followed by a separate source-escrow transaction.</p>
      </div>}
      {phase&&<p className="text-aqua text-sm" role="status">{phase}</p>}
      {error&&<p className="text-red-300 text-sm" role="alert">{error}</p>}
    </div>
    <p className="muted text-sm mt-6">Need test hUSD? <Link href="/docs" className="text-aqua underline">See the faucet and funding instructions.</Link></p>
  </section>;
}
