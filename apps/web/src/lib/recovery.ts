import { randomHex32, secretHashOf } from "@harbor/protocol";
import type { Hex } from "viem";
import type { JsonQuote } from "@harbor/protocol";

export type Recovery = {
  protocol:"HARBOR-RECOVERY-1";intentId:Hex;secretHash:Hex;
  iv:string;salt:string;encrypted:string;
  offers?:{quote:JsonQuote;signature:Hex}[];
};
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const fromB64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function derive(passphrase:string,salt:Uint8Array){
  if(passphrase.length<12)throw Error("Use a recovery passphrase of at least 12 characters");
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:new Uint8Array(salt),iterations:250000,hash:"SHA-256"},
    base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function createRecovery(intentId:Hex,secret:Hex,passphrase:string):Promise<Recovery>{
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(passphrase,salt);
  const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(secret));
  return {protocol:"HARBOR-RECOVERY-1",intentId,secretHash:secretHashOf(secret),
    salt:b64(salt),iv:b64(iv),encrypted:b64(new Uint8Array(data))};
}
export async function unlockRecovery(record:Recovery,passphrase:string):Promise<Hex>{
  if(record.protocol!=="HARBOR-RECOVERY-1")throw Error("Invalid backup version");
  const key=await derive(passphrase,fromB64(record.salt));
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(fromB64(record.iv))},key,new Uint8Array(fromB64(record.encrypted)));
  const secret=new TextDecoder().decode(plain) as Hex;
  if(secretHashOf(secret)!==record.secretHash)throw Error("Backup checksum mismatch");
  return secret;
}
export function saveRecovery(record:Recovery){
  localStorage.setItem("harbor-recovery:"+record.intentId.toLowerCase(),JSON.stringify(record));
}
export function loadRecovery(intentId:string):Recovery|null{
  const content=localStorage.getItem("harbor-recovery:"+intentId.toLowerCase());
  return content?JSON.parse(content) as Recovery:null;
}
export function downloadRecovery(record:Recovery){
  const blob=new Blob([JSON.stringify(record,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="harbor-recovery-"+record.intentId.slice(2,10)+".json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
