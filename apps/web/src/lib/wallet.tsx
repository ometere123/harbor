"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { portaldot, BASE_ID, PORTALDOT_ID } from "@harbor/protocol";
import { config } from "./config";

export type Injected = {
  request: (args: {method:string;params?:unknown[]|object}) => Promise<unknown>;
  on?: (name:string, fn:(...args:any[])=>void)=>void;
  removeListener?: (name:string, fn:(...args:any[])=>void)=>void;
};
type WalletState = {
  address: Address | null; chainId: number | null; connected: boolean;
  provider: Injected | null; providers: {name:string;provider:Injected}[];
  connect: (index?:number)=>Promise<void>; disconnect:()=>void;
  switchChain: (id:number)=>Promise<void>;
  send: (id:number, action:(client:ReturnType<typeof createWalletClient>,address:Address)=>Promise<string>)=>Promise<string>;
};
const Context=createContext<WalletState|null>(null);

declare global {
  interface Window { ethereum?: Injected }
}
export function WalletProvider({children}:{children:ReactNode}){
  const [providers,setProviders]=useState<{name:string;provider:Injected}[]>([]);
  const [provider,setProvider]=useState<Injected|null>(null);
  const [address,setAddress]=useState<Address|null>(null);
  const [chainId,setChainId]=useState<number|null>(null);

  useEffect(()=>{
    function announced(event:Event){
      const detail=(event as CustomEvent<{info:{name:string;uuid:string};provider:Injected}>).detail;
      if(!detail?.provider||!detail.info)return;
      setProviders(old=>old.some(v=>v.provider===detail.provider)?old:[...old,{name:detail.info.name,provider:detail.provider}]);
    }
    window.addEventListener("eip6963:announceProvider",announced);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if(window.ethereum)setProviders(old=>old.some(v=>v.provider===window.ethereum)?old:[...old,{name:"Injected wallet",provider:window.ethereum!}]);
    return ()=>window.removeEventListener("eip6963:announceProvider",announced);
  },[]);
  useEffect(()=>{
    if(!provider)return;
    const onAccounts=(value:unknown)=>setAddress(Array.isArray(value)&&value[0]?value[0] as Address:null);
    const onChain=(value:unknown)=>setChainId(typeof value==="string"?parseInt(value,16):null);
    const onDisconnect=()=>{setAddress(null);setChainId(null);setProvider(null);};
    provider.on?.("accountsChanged",onAccounts);provider.on?.("chainChanged",onChain);provider.on?.("disconnect",onDisconnect);
    void provider.request({method:"eth_accounts"}).then(onAccounts).catch(()=>{});
    void provider.request({method:"eth_chainId"}).then(onChain).catch(()=>{});
    return ()=>{
      provider.removeListener?.("accountsChanged",onAccounts);provider.removeListener?.("chainChanged",onChain);
      provider.removeListener?.("disconnect",onDisconnect);
    };
  },[provider]);

  const connect=useCallback(async(index=0)=>{
    const picked=providers[index]?.provider;
    if(!picked)throw Error("Install an injected EVM wallet first");
    const accounts=await picked.request({method:"eth_requestAccounts"}) as string[];
    if(!accounts?.[0])throw Error("Wallet returned no account");
    setProvider(picked);setAddress(accounts[0] as Address);
    setChainId(parseInt(await picked.request({method:"eth_chainId"}) as string,16));
  },[providers]);

  const disconnect=useCallback(()=>{setProvider(null);setAddress(null);setChainId(null);},[]);
  const switchChain=useCallback(async(id:number)=>{
    if(!provider)throw Error("Connect wallet first");
    if(id!==BASE_ID&&id!==PORTALDOT_ID)throw Error("Unsupported network");
    const hex="0x"+id.toString(16);
    try{await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:hex}]});}
    catch(e:any){
      if(e?.code!==4902)throw e;
      await provider.request({method:"wallet_addEthereumChain",params:[{
        chainId:hex,
        chainName:id===BASE_ID?"Base Sepolia":"Portaldot V3 Testnet",
        nativeCurrency:id===BASE_ID?{name:"Sepolia ETH",symbol:"ETH",decimals:18}:{name:"tPOTv3",symbol:"tPOTv3",decimals:config.destinationValueDecimals},
        rpcUrls:[id===BASE_ID?config.baseRpc:config.destRpc],
      }]});
      await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:hex}]});
    }
    const actual=parseInt(await provider.request({method:"eth_chainId"}) as string,16);
    if(actual!==id)throw Error("Wrong connected chain");
    setChainId(actual);
  },[provider]);

  const send=useCallback(async(id:number,action:(client:ReturnType<typeof createWalletClient>,address:Address)=>Promise<string>)=>{
    if(!provider||!address)throw Error("Connect wallet first");
    await switchChain(id);
    const wallet=createWalletClient({account:address,chain:id===BASE_ID?baseSepolia:portaldot,transport:custom(provider as any)});
    return action(wallet,address);
  },[provider,address,switchChain]);

  return <Context.Provider value={{address,chainId,connected:!!address,provider,providers,connect,disconnect,switchChain,send}}>{children}</Context.Provider>;
}
export function useWallet(){
  const value=useContext(Context);
  if(!value)throw Error("WalletProvider missing");
  return value;
}
