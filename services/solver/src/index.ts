import { createPublicClient, createWalletClient, http, isAddress, isHex, hashTypedData } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  BASE_ID, PORTALDOT_ID, QUOTE_DURATION, FUNDING_WINDOW, DESTINATION_DURATION,
  quoteDomain, typedQuote, quoteToJson, quoteFromJson, destinationRawAmount,
  sourceAbi, destinationAbi, portaldot, secretHashOf, type Quote, type JsonQuote,
} from "@harbor/protocol";
import { db, upsert, iso, type Env, type Job } from "./store";

type SavedQuote = { intent_id: string; solver: string; payload: JsonQuote; signature: Hex; created_at: string };
type SwapRow = {
  intent_id: string; user_address?: string; solver_address?: string;
  source_status?: string; destination_status?: string;
  source_deadline?: number; destination_deadline?: number;
  source_tx?: string; destination_tx?: string;
};
const isBytes32 = (x: unknown): x is Hex => typeof x === "string" && isHex(x) && /^0x[0-9a-fA-F]{64}$/.test(x) && x !== "0x" + "0".repeat(64);
const addr = (x: string): Address => { if (!isAddress(x)) throw Error("Invalid address config"); return x as Address; };
const sourceAddress = (e: Env) => addr(e.SOURCE_ESCROW_ADDRESS);
const destAddress = (e: Env) => addr(e.DESTINATION_ESCROW_ADDRESS);
const src = (e: Env) => createPublicClient({ chain: baseSepolia, transport: http(e.BASE_RPC_URL, { timeout: 12000 }) });
const dst = (e: Env) => createPublicClient({ chain: portaldot, transport: http(e.PORTALDOT_EVM_RPC_URL, { timeout: 12000 }) });
const json = (x: unknown, status = 200) => Response.json(x, { status, headers: { "Cache-Control": "no-store" } });
function identities(e: Env) {
  const a = privateKeyToAccount(e.SOLVER_ALPHA_PRIVATE_KEY as Hex);
  const b = privateKeyToAccount(e.SOLVER_BRAVO_PRIVATE_KEY as Hex);
  if (a.address.toLowerCase() === b.address.toLowerCase()) throw Error("Solver private keys must differ");
  return [{ account: a, name: "Alpha", rate: BigInt(e.SOLVER_ALPHA_RATE_BPS) },
    { account: b, name: "Bravo", rate: BigInt(e.SOLVER_BRAVO_RATE_BPS) }];
}
function solver(e: Env, address: Address) {
  const matching = identities(e).find(x => x.account.address.toLowerCase() === address.toLowerCase());
  if (!matching) throw Error("Not one of our solver identities");
  return matching.account;
}
async function chains(e: Env) {
  const [a,b] = await Promise.all([src(e).getChainId(),dst(e).getChainId()]);
  if (a!==BASE_ID || b!==PORTALDOT_ID) throw Error("Chain identity mismatch");
}
async function saveSwap(e: Env, data: Partial<SwapRow> & {intent_id:string}) {
  await upsert(e,"swaps",[data],"intent_id");
}
async function saveEvent(e:Env,chain:string,log:{transactionHash:Hex|null;logIndex:number;blockNumber:bigint|null},event:string,id:Hex) {
  if (!log.transactionHash || log.blockNumber===null) return;
  await upsert(e,"observed_events",[{chain,tx_hash:log.transactionHash,log_index:log.logIndex,
    block_number:log.blockNumber.toString(),event_name:event,intent_id:id,observed_at:iso()}],"chain,tx_hash,log_index");
}

async function createQuotes(e: Env, body: any): Promise<Response> {
  if (!body || !isBytes32(body.intentId) || !isBytes32(body.secretHash)
    || !isAddress(body.user||"") || !isAddress(body.destinationUser||"")
    || typeof body.sourceAmount!=="string" || !/^\d{1,12}$/.test(body.sourceAmount)
    || BigInt(body.sourceAmount)<500000n || BigInt(body.sourceAmount)>100000000n)
    return json({error:"Enter 0.5–100 hUSD and valid intent addresses"},400);
  if(e.PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED!=="true")
    return json({error:"Portaldot EVM value-unit verification pending"},503);
  await chains(e);
  const decimals=Number(e.DEST_EVM_VALUE_DECIMALS);
  if(!Number.isInteger(decimals)||decimals<0||decimals>30) throw Error("Invalid EVM value scale");
  const now=BigInt(Math.floor(Date.now()/1000));
  const entropy=new Uint8Array(8);crypto.getRandomValues(entropy);
  const nonce=BigInt("0x"+Array.from(entropy).map(x=>x.toString(16).padStart(2,"0")).join(""));
  const entries:SavedQuote[]=[];
  for(const [i,s] of identities(e).entries()){
    const q: Quote={
      intentId:body.intentId,secretHash:body.secretHash,user:body.user,
      solver:s.account.address,destinationUser:body.destinationUser,destinationSolver:s.account.address,
      sourceEscrow:sourceAddress(e),sourceToken:addr(e.SOURCE_TOKEN_ADDRESS),destinationEscrow:destAddress(e),
      sourceAmount:BigInt(body.sourceAmount),
      destinationAmount:destinationRawAmount(BigInt(body.sourceAmount),s.rate,decimals),
      sourceChainId:BigInt(BASE_ID),destinationChainId:BigInt(PORTALDOT_ID),
      expiresAt:now+QUOTE_DURATION,nonce:nonce+BigInt(i),
    };
    const signature=await s.account.signTypedData({
      domain:quoteDomain(sourceAddress(e)),types:typedQuote,primaryType:"Quote",message:q,
    });
    entries.push({intent_id:q.intentId,solver:q.solver,payload:quoteToJson(q),signature,created_at:iso()});
  }
  await upsert(e,"quotes",entries,"intent_id,solver");
  return json({quotes:entries.map((q,i)=>({solverName:identities(e)[i].name,quote:q.payload,signature:q.signature}))});
}
async function quotes(e:Env,id:Hex):Promise<SavedQuote[]> {
  return db<SavedQuote[]>(e,"quotes","?intent_id=eq."+id+"&select=*");
}
async function checkpoint(e:Env,chain:string):Promise<bigint>{
  const records=await db<{last_block:string}[]>(e,"worker_checkpoints","?chain=eq."+chain+"&select=last_block");
  return records.length ? BigInt(records[0].last_block)+1n :
    BigInt(chain==="source" ? (e.SOURCE_START_BLOCK||"0"):(e.DEST_START_BLOCK||"0"));
}
async function scan(e:Env,chain:"source"|"destination"){
  await chains(e);
  const pc=chain==="source"?src(e):dst(e);
  const safe=(await pc.getBlockNumber())-BigInt(chain==="source"?e.SOURCE_CONFIRMATIONS:e.DEST_CONFIRMATIONS);
  const start=BigInt(chain==="source"?(e.SOURCE_START_BLOCK||"0"):(e.DEST_START_BLOCK||"0"));
  const from=(await checkpoint(e,chain))>start?(await checkpoint(e,chain)):start;
  if(from>safe) return;
  const to=from+199n<safe?from+199n:safe;
  if(chain==="source"){
    const logs=await Promise.all([
      src(e).getContractEvents({address:sourceAddress(e),abi:sourceAbi,eventName:"SourceLocked",fromBlock:from,toBlock:to}),
      src(e).getContractEvents({address:sourceAddress(e),abi:sourceAbi,eventName:"SourceClaimed",fromBlock:from,toBlock:to}),
      src(e).getContractEvents({address:sourceAddress(e),abi:sourceAbi,eventName:"SourceRefunded",fromBlock:from,toBlock:to}),
    ]);
    const timeline=logs.flat().sort((a,b)=>Number(a.blockNumber-b.blockNumber)||a.logIndex-b.logIndex);
    for(const log of timeline){
      if(!log.args.intentId) continue;
      await saveEvent(e,chain,log,log.eventName,log.args.intentId);
      if(log.eventName==="SourceLocked"){
        await saveSwap(e,{intent_id:log.args.intentId,user_address:log.args.user,
          solver_address:log.args.solver,source_status:"LOCKED",source_deadline:Number(log.args.deadline),
          source_tx:log.transactionHash ?? undefined});
        await e.HARBOR_JOBS.send({type:"fund",intentId:log.args.intentId});
      }else if(log.eventName==="SourceClaimed"){
        await saveSwap(e,{intent_id:log.args.intentId,source_status:"CLAIMED"});
      }else{
        await saveSwap(e,{intent_id:log.args.intentId,source_status:"REFUNDED"});
      }
    }
  }else{
    const logs=await Promise.all([
      dst(e).getContractEvents({address:destAddress(e),abi:destinationAbi,eventName:"DestinationLocked",fromBlock:from,toBlock:to}),
      dst(e).getContractEvents({address:destAddress(e),abi:destinationAbi,eventName:"DestinationClaimed",fromBlock:from,toBlock:to}),
      dst(e).getContractEvents({address:destAddress(e),abi:destinationAbi,eventName:"DestinationRefunded",fromBlock:from,toBlock:to}),
    ]);
    const timeline=logs.flat().sort((a,b)=>Number(a.blockNumber-b.blockNumber)||a.logIndex-b.logIndex);
    for(const log of timeline){
      if(!log.args.intentId) continue;
      await saveEvent(e,chain,log,log.eventName,log.args.intentId);
      if(log.eventName==="DestinationLocked"){
        await saveSwap(e,{intent_id:log.args.intentId,destination_status:"LOCKED",
          destination_deadline:Number(log.args.deadline),destination_tx:log.transactionHash});
      }else if(log.eventName==="DestinationClaimed"){
        await saveSwap(e,{intent_id:log.args.intentId,destination_status:"CLAIMED"});
        if(log.args.secret) await e.HARBOR_JOBS.send({type:"claimSource",intentId:log.args.intentId,secret:log.args.secret});
      }else{
        await saveSwap(e,{intent_id:log.args.intentId,destination_status:"REFUNDED"});
      }
    }
  }
  await upsert(e,"worker_checkpoints",[{chain,last_block:to.toString(),checked_at:iso()}],"chain");
  if(to<safe) await e.HARBOR_JOBS.send({type:"scan",chain});
}
async function fund(e:Env,id:Hex){
  if(e.PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED!=="true") throw Error("Portaldot precision not verified");
  await chains(e);
  const source=await src(e).readContract({address:sourceAddress(e),abi:sourceAbi,functionName:"swaps",args:[id]});
  const [user,sol,hash,amount,openedAt,deadline,status]=source;
  if(status!==1) return;
  const now=BigInt(Math.floor(Date.now()/1000));
  if(now>openedAt+FUNDING_WINDOW || deadline-now<DESTINATION_DURATION+3600n) return;
  const destination=await dst(e).readContract({address:destAddress(e),abi:destinationAbi,functionName:"swaps",args:[id]});
  if(destination[5]!==0) return;
  const record=(await quotes(e,id)).find(x=>x.solver.toLowerCase()===sol.toLowerCase());
  if(!record) return;
  const q=quoteFromJson(record.payload);
  const digest=hashTypedData({domain:quoteDomain(sourceAddress(e)),types:typedQuote,primaryType:"Quote",message:q});
  const onChain=await src(e).readContract({address:sourceAddress(e),abi:sourceAbi,functionName:"quoteDigests",args:[id]});
  if(digest!==onChain || q.secretHash!==hash || q.user.toLowerCase()!==user.toLowerCase()
    || q.sourceAmount!==amount || q.destinationEscrow.toLowerCase()!==destAddress(e).toLowerCase()) throw Error("Quote does not match locked source");
  const account=solver(e,sol);
  if(q.destinationSolver.toLowerCase()!==account.address.toLowerCase()) throw Error("Wrong destination solver");
  const pc=dst(e);
  if((await pc.getBalance({address:account.address})) <= q.destinationAmount) throw Error("Insufficient destination gas/liquidity");
  const wallet=createWalletClient({account,chain:portaldot,transport:http(e.PORTALDOT_EVM_RPC_URL)});
  const sim=await pc.simulateContract({account,address:destAddress(e),abi:destinationAbi,
    functionName:"fundSwap",args:[id,hash,q.destinationUser,now+DESTINATION_DURATION],value:q.destinationAmount});
  const tx=await wallet.writeContract(sim.request);
  const receipt=await pc.waitForTransactionReceipt({hash:tx,confirmations:Number(e.DEST_CONFIRMATIONS),timeout:120000});
  if(receipt.status!=="success") throw Error("Destination funding reverted");
  await saveSwap(e,{intent_id:id,destination_status:"LOCKED",destination_deadline:Number(now+DESTINATION_DURATION),destination_tx:tx});
}
async function claimSource(e:Env,id:Hex,secret:Hex){
  await chains(e);
  const source=await src(e).readContract({address:sourceAddress(e),abi:sourceAbi,functionName:"swaps",args:[id]});
  if(source[6]!==1) return;
  const destination=await dst(e).readContract({address:destAddress(e),abi:destinationAbi,functionName:"swaps",args:[id]});
  if(destination[5]!==2 || source[2]!==secretHashOf(secret)) throw Error("Unproven destination claim");
  const account=solver(e,source[1]);
  const pc=src(e),wallet=createWalletClient({account,chain:baseSepolia,transport:http(e.BASE_RPC_URL)});
  const sim=await pc.simulateContract({account,address:sourceAddress(e),abi:sourceAbi,functionName:"claim",args:[id,secret]});
  const tx=await wallet.writeContract(sim.request);
  const receipt=await pc.waitForTransactionReceipt({hash:tx,confirmations:Number(e.SOURCE_CONFIRMATIONS),timeout:120000});
  if(receipt.status!=="success") throw Error("Source claim reverted");
  await saveSwap(e,{intent_id:id,source_status:"CLAIMED"});
}
async function refund(e:Env,chain:"source"|"destination",id:Hex){
  const isSource=chain==="source",pc=isSource?src(e):dst(e);
  const address=isSource?sourceAddress(e):destAddress(e),abi=isSource?sourceAbi:destinationAbi;
  if(isSource){
    const s=await src(e).readContract({address:sourceAddress(e),abi:sourceAbi,functionName:"swaps",args:[id]});
    if(s[6]!==1 || BigInt(Math.floor(Date.now()/1000))<s[5]) return;
    const account=solver(e,s[1]);
    const wallet=createWalletClient({account,chain:baseSepolia,transport:http(e.BASE_RPC_URL)});
    const sim=await src(e).simulateContract({account,address:sourceAddress(e),abi:sourceAbi,functionName:"refund",args:[id]});
    const tx=await wallet.writeContract(sim.request);
    const receipt=await src(e).waitForTransactionReceipt({hash:tx,timeout:120000});
    if(receipt.status!=="success")throw Error("Source refund failed");
    await saveSwap(e,{intent_id:id,source_status:"REFUNDED"});
  }else{
    const s=await dst(e).readContract({address:destAddress(e),abi:destinationAbi,functionName:"swaps",args:[id]});
    if(s[5]!==1 || BigInt(Math.floor(Date.now()/1000))<s[4]) return;
    const account=solver(e,s[0]);
    const wallet=createWalletClient({account,chain:portaldot,transport:http(e.PORTALDOT_EVM_RPC_URL)});
    const sim=await dst(e).simulateContract({account,address:destAddress(e),abi:destinationAbi,functionName:"refund",args:[id]});
    const tx=await wallet.writeContract(sim.request);
    const receipt=await dst(e).waitForTransactionReceipt({hash:tx,timeout:120000});
    if(receipt.status!=="success")throw Error("Destination refund failed");
    await saveSwap(e,{intent_id:id,destination_status:"REFUNDED"});
  }
}
async function expiryJobs(e:Env){
  const records=await db<SwapRow[]>(e,"swaps","?select=*&limit=100&order=created_at.asc");
  const now=Math.floor(Date.now()/1000);
  for(const s of records){
    if(s.source_status==="LOCKED" && s.source_deadline && s.source_deadline<=now)
      await e.HARBOR_JOBS.send({type:"refundSource",intentId:s.intent_id});
    if(s.destination_status==="LOCKED" && s.destination_deadline && s.destination_deadline<=now)
      await e.HARBOR_JOBS.send({type:"refundDestination",intentId:s.intent_id});
  }
}
async function job(e:Env,j:Job){
  if(j.type==="scan") return scan(e,j.chain);
  if(!isBytes32(j.intentId))throw Error("Invalid intent");
  if(j.type==="fund")return fund(e,j.intentId);
  if(j.type==="claimSource")return claimSource(e,j.intentId,j.secret as Hex);
  if(j.type==="refundSource")return refund(e,"source",j.intentId);
  if(j.type==="refundDestination")return refund(e,"destination",j.intentId);
}
export default {
  async fetch(req:Request,e:Env):Promise<Response>{
    const u=new URL(req.url);
    if(u.pathname==="/health")return json({service:"HARBOR",precisionVerified:e.PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED==="true"});
    if(u.pathname==="/v1/quotes"&&req.method==="POST"){
      try {return await createQuotes(e,await req.json());}
      catch(err){console.error("Quote failed",String(err));return json({error:"Quotes unavailable"},503);}
    }
    if(u.pathname.startsWith("/v1/swaps/")&&req.method==="GET"){
      const id=u.pathname.slice("/v1/swaps/".length);
      if(!isBytes32(id))return json({error:"Invalid swap id"},400);
      const [swaps,events]=await Promise.all([
        db<SwapRow[]>(e,"swaps","?intent_id=eq."+id+"&select=*"),
        db<unknown[]>(e,"observed_events","?intent_id=eq."+id+"&select=*&order=block_number.asc"),
      ]);
      return json({swap:swaps[0]||null,events});
    }
    if(u.pathname.startsWith("/v1/activity/")&&req.method==="GET"){
      const address=u.pathname.slice("/v1/activity/".length);
      if(!isAddress(address))return json({error:"Bad address"},400);
      const records=await db<SwapRow[]>(e,"swaps","?user_address=ilike."+encodeURIComponent(address)+"&select=*&order=created_at.desc&limit=100");
      return json({swaps:records});
    }
    if(u.pathname==="/v1/solvers"&&req.method==="GET")
      return json({solvers:identities(e).map(s=>({name:s.name,address:s.account.address,rateBps:s.rate.toString()}))});
    if(u.pathname==="/internal/scan"&&req.method==="POST"){
      if(!e.WORKER_ADMIN_TOKEN || req.headers.get("authorization")!=="Bearer "+e.WORKER_ADMIN_TOKEN)
        return json({error:"Unauthorized"},401);
      await e.HARBOR_JOBS.sendBatch([{body:{type:"scan",chain:"source"}},{body:{type:"scan",chain:"destination"}}]);
      return json({queued:true});
    }
    return json({error:"Not found"},404);
  },
  async scheduled(_event:ScheduledController,e:Env,ctx:ExecutionContext){
    ctx.waitUntil(Promise.all([
      e.HARBOR_JOBS.send({type:"scan",chain:"source"}),
      e.HARBOR_JOBS.send({type:"scan",chain:"destination"}),
      expiryJobs(e),
    ]));
  },
  async queue(batch:MessageBatch<unknown>,e:Env){
    for(const msg of batch.messages){
      try{await job(e,msg.body as Job);msg.ack();}
      catch(err){console.error("Queue retry",(msg.body as Job)?.type,String(err));msg.retry();}
    }
  },
} satisfies ExportedHandler<Env>;
