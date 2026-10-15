"use client";
import { useState } from "react";
import { Wallet, ChevronDown, LogOut } from "lucide-react";
import { useWallet } from "@/lib/wallet";
export function WalletConnect(){
  const {address,providers,connect,disconnect,chainId}=useWallet();
  const [expanded,setExpanded]=useState(false);
  const [error,setError]=useState("");
  if(address)return <div className="flex gap-2 items-center">
    <span className="hidden sm:inline muted text-xs">{chainId===84532?"Base Sepolia":chainId===420420777?"Portaldot V3":"Switch network"}</span>
    <button onClick={disconnect} className="btn btn-outline text-sm" aria-label="Disconnect local wallet session">
      <Wallet size={16}/>{address.slice(0,6)}…{address.slice(-4)}<LogOut size={14}/>
    </button>
  </div>;
  return <div className="relative">
    <button className="btn btn-primary text-sm" onClick={()=>setExpanded(!expanded)}><Wallet size={16}/> Connect wallet <ChevronDown size={14}/></button>
    {expanded&&<div className="absolute z-50 right-0 top-14 panel p-3 min-w-64 space-y-2">
      {!providers.length&&<p className="text-sm muted">Install MetaMask or an EIP-1193 injected wallet.</p>}
      {providers.map((p,i)=><button key={i} className="btn btn-outline w-full" onClick={async()=>{
        try{await connect(i);setExpanded(false);setError("");}catch(e){setError(String(e));}
      }}>{p.name}</button>)}
      {error&&<p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>}
  </div>;
}
