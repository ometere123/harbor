import { createPublicClient, createWalletClient, http, isAddress, isHex, hashTypedData, verifyMessage } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  BASE_ID, PORTALDOT_ID, QUOTE_DURATION, FUNDING_WINDOW, DESTINATION_DURATION,
  quoteDomain, typedQuote, quoteToJson, quoteFromJson, quoteRequestMessage, destinationRawAmount,
  sourceAbi, destinationAbi, portaldot, secretHashOf, type Quote, type JsonQuote,
} from "@harbor/protocol";
import { db, rpc, upsert, iso, type Job } from "./store";
import { collectPages, expiredJobs, expiryQuery, hasSufficientFunding, requiredFunding, type ExpiryRow } from "./reliability";

type SavedQuote = { intent_id: string; solver: string; payload: JsonQuote; signature: Hex; created_at: string };
type SwapRow = {
  intent_id: string; user_address?: string; solver_address?: string;
  source_status?: string; destination_status?: string;
  source_deadline?: number | string; destination_deadline?: number | string;
  source_tx?: string; destination_tx?: string;
};
type QuoteRequest = {
  intentId: Hex; secretHash: Hex; user: Address; destinationUser: Address; sourceAmount: string;
  requestTime: number; requestSignature: Hex;
};
const isBytes32 = (x: unknown): x is Hex => typeof x === "string" && isHex(x) && /^0x[0-9a-fA-F]{64}$/.test(x) && x !== "0x" + "0".repeat(64);
const addr = (x: string): Address => { if (!isAddress(x)) throw Error("Invalid address config"); return x as Address; };
const sourceAddress = (e: Env) => addr(e.SOURCE_ESCROW_ADDRESS);
const destAddress = (e: Env) => addr(e.DESTINATION_ESCROW_ADDRESS);
const src = (e: Env) => createPublicClient({ chain: baseSepolia, transport: http(e.BASE_RPC_URL, { timeout: 12000 }) });
const dst = (e: Env) => createPublicClient({ chain: portaldot, transport: http(e.PORTALDOT_EVM_RPC_URL, { timeout: 12000 }) });
const json = (x: unknown, status = 200) => Response.json(x, { status, headers: { "Cache-Control": "no-store" } });
const logError = (event: string, details: Record<string, unknown>) =>
  console.error(JSON.stringify({ event, ...details }));
function isQuoteRequest(body: unknown): body is QuoteRequest {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return isBytes32(value.intentId)
    && isBytes32(value.secretHash)
    && typeof value.user === "string" && isAddress(value.user)
    && typeof value.destinationUser === "string" && isAddress(value.destinationUser)
    && typeof value.sourceAmount === "string"
    && /^\d{1,12}$/.test(value.sourceAmount)
    && BigInt(value.sourceAmount) >= 500_000n
    && BigInt(value.sourceAmount) <= 100_000_000n
    && typeof value.requestTime === "number"
    && Number.isSafeInteger(value.requestTime)
    && value.requestTime > 0
    && typeof value.requestSignature === "string"
    && /^0x[0-9a-fA-F]{130}$/.test(value.requestSignature);
}
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
  if (a!==BASE_ID || b!==PORTALDOT_ID || a!==Number(e.BASE_CHAIN_ID) || b!==Number(e.PORTALDOT_CHAIN_ID))
    throw Error("Chain identity mismatch");
}
async function saveSwap(e: Env, data: Partial<SwapRow> & {intent_id:string}) {
  // Source and destination events are observed by separate queue jobs.
  // A generic partial upsert can overwrite unrelated fields with defaults.
  // A database-side atomic merge preserves each chain's independent state.
  const args: Record<string, unknown> = { p_intent_id: data.intent_id };
  for (const [key, value] of Object.entries(data)) {
    if (key !== "intent_id" && value !== undefined && value !== null) {
      args["p_" + key] = value;
    }
  }
  await rpc(e, "record_swap_observation", args);
}
async function saveEvent(e:Env,chain:string,log:{transactionHash:Hex|null;logIndex:number;blockNumber:bigint|null},event:string,id:Hex) {
  if (!log.transactionHash || log.blockNumber===null) return;
  await upsert(e,"observed_events",[{chain,tx_hash:log.transactionHash,log_index:log.logIndex,
    block_number:log.blockNumber.toString(),event_name:event,intent_id:id,observed_at:iso()}],"chain,tx_hash,log_index");
}

async function createQuotes(e: Env, body: unknown): Promise<Response> {
  if (!isQuoteRequest(body))
    return json({error:"Enter 0.5–100 hUSD and valid intent addresses"},400);
  // Require proof of control of the requesting source account before
  // spending RPC resources or reserving any solver's quote liquidity.
  const requestNow=Math.floor(Date.now()/1000);
  if(Math.abs(requestNow-body.requestTime)>300)
    return json({error:"Quote request signature expired; retry"},401);
  const authorised=await verifyMessage({
    address:body.user,
    message:quoteRequestMessage(body,sourceAddress(e)),
    signature:body.requestSignature,
  });
  if(!authorised) return json({error:"Quote request wallet signature invalid"},401);
  if(e.PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED!=="true")
    return json({error:"Portaldot EVM value-unit verification pending"},503);
  await chains(e);
  const decimals=Number(e.DEST_EVM_VALUE_DECIMALS);
  if(!Number.isInteger(decimals)||decimals<0||decimals>30) throw Error("Invalid EVM value scale");
  const now=BigInt(Math.floor(Date.now()/1000));
  const destinationPreviewDeadline=(await dst(e).getBlock()).timestamp+DESTINATION_DURATION;
  const destinationClient=dst(e);
  const gasPrice=await destinationClient.getGasPrice();
  const sourceAmount=BigInt(body.sourceAmount);
  const entropy=new Uint8Array(8);crypto.getRandomValues(entropy);
  const nonce=BigInt("0x"+Array.from(entropy).map(x=>x.toString(16).padStart(2,"0")).join(""));
  const entries:SavedQuote[]=[];
  let reserved = false;
  try {
  for(const [i,s] of identities(e).entries()){
    const q: Quote={
      intentId:body.intentId,secretHash:body.secretHash,user:body.user,
      solver:s.account.address,destinationUser:body.destinationUser,destinationSolver:s.account.address,
      sourceEscrow:sourceAddress(e),sourceToken:addr(e.SOURCE_TOKEN_ADDRESS),destinationEscrow:destAddress(e),
      sourceAmount,
      destinationAmount:destinationRawAmount(sourceAmount,s.rate,decimals),
      sourceChainId:BigInt(BASE_ID),destinationChainId:BigInt(PORTALDOT_ID),
      expiresAt:now+QUOTE_DURATION,nonce:nonce+BigInt(i),
    };
    const gasEstimate=await destinationClient.estimateContractGas({account:s.account,address:destAddress(e),abi:destinationAbi,
      functionName:"fundSwap",args:[q.intentId,q.secretHash,q.destinationUser,destinationPreviewDeadline],value:q.destinationAmount});
    const balance=await destinationClient.getBalance({address:s.account.address});
    if(!hasSufficientFunding(balance,q.destinationAmount,gasEstimate,gasPrice))
      throw Error(`${s.name} solver liquidity unavailable`);
    // Atomic Postgres reservation closes the race between multiple quote
    // requests independently seeing the same wallet balance. Reservations
    // stay live beyond the quote lifetime through its source funding window.
    const admitted=await rpc<boolean>(e,"reserve_solver_quote",{
      p_solver:s.account.address.toLowerCase(),p_intent_id:q.intentId,
      p_required_value:requiredFunding(q.destinationAmount,gasEstimate,gasPrice).toString(),
      p_wallet_balance:balance.toString(),
    });
    if(!admitted) throw Error(`${s.name} liquidity already committed to other quotes`);
    reserved = true;
    const signature=await s.account.signTypedData({
      domain:quoteDomain(sourceAddress(e)),types:typedQuote,primaryType:"Quote",message:q,
    });
    entries.push({intent_id:q.intentId,solver:q.solver,payload:quoteToJson(q),signature,created_at:iso()});
  }
  await upsert(e,"quotes",entries,"intent_id,solver");
  return json({quotes:entries.map((q,i)=>({solverName:identities(e)[i].name,quote:q.payload,signature:q.signature}))});
  } catch (error) {
    // The response was never published. Release admission so a failed RPC,
    // storage write or second-solver check cannot strand users for 26 min.
    if(reserved) {
      try {
        await rpc(e,"release_unpublished_quote_reservations",{p_intent_id:body.intentId});
      } catch(cleanupError) {
        logError("quote_reservation_cleanup_failed",{
          intentId:body.intentId,error:cleanupError instanceof Error?cleanupError.message:String(cleanupError)
        });
      }
    }
    throw error;
  }
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
  const latest=await pc.getBlockNumber();
  const confirmations=BigInt(Number(chain==="source"?e.SOURCE_CONFIRMATIONS:e.DEST_CONFIRMATIONS));
  const safe=latest>confirmations?latest-confirmations:0n;
  const start=BigInt(chain==="source"?(e.SOURCE_START_BLOCK||"0"):(e.DEST_START_BLOCK||"0"));
  const checkpointBlock=await checkpoint(e,chain);
  const from=checkpointBlock>start?checkpointBlock:start;
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
  // The SQL function advances monotonically, so overlapping Cron/manual scans
  // cannot move a checkpoint backwards and force an unbounded rescan.
  await rpc(e,"advance_worker_checkpoint",{p_chain:chain,p_last_block:to.toString(),p_checked_at:iso()});
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
  if(digest.toLowerCase()!==onChain.toLowerCase() || q.secretHash.toLowerCase()!==hash.toLowerCase() || q.user.toLowerCase()!==user.toLowerCase()
    || q.sourceAmount!==amount || q.destinationEscrow.toLowerCase()!==destAddress(e).toLowerCase()) throw Error("Quote does not match locked source");
  const account=solver(e,sol);
  if(q.destinationSolver.toLowerCase()!==account.address.toLowerCase()) throw Error("Wrong destination solver");
  const pc=dst(e);
  const destinationDeadline=now+DESTINATION_DURATION;
  const fundingArgs=[id,hash,q.destinationUser,destinationDeadline] as const;
  const gasEstimate=await pc.estimateContractGas({account,address:destAddress(e),abi:destinationAbi,
    functionName:"fundSwap",args:fundingArgs,value:q.destinationAmount});
  const gasPrice=await pc.getGasPrice();
  const gasReserve=gasEstimate*gasPrice*2n;
  if((await pc.getBalance({address:account.address})) < q.destinationAmount+gasReserve)
    throw Error("Insufficient destination gas/liquidity");
  const wallet=createWalletClient({account,chain:portaldot,transport:http(e.PORTALDOT_EVM_RPC_URL)});
  const sim=await pc.simulateContract({account,address:destAddress(e),abi:destinationAbi,
    functionName:"fundSwap",args:fundingArgs,value:q.destinationAmount});
  const tx=await wallet.writeContract(sim.request);
  const receipt=await pc.waitForTransactionReceipt({hash:tx,confirmations:Number(e.DEST_CONFIRMATIONS),timeout:120000});
  if(receipt.status!=="success") throw Error("Destination funding reverted");
  await saveSwap(e,{intent_id:id,destination_status:"LOCKED",destination_deadline:Number(destinationDeadline),destination_tx:tx});
}
async function claimSource(e:Env,id:Hex,secret:Hex){
  if(!isBytes32(secret)) throw Error("Invalid secret");
  await chains(e);
  const source=await src(e).readContract({address:sourceAddress(e),abi:sourceAbi,functionName:"swaps",args:[id]});
  if(source[6]!==1) return;
  const destination=await dst(e).readContract({address:destAddress(e),abi:destinationAbi,functionName:"swaps",args:[id]});
  if(destination[5]!==2 || source[2].toLowerCase()!==secretHashOf(secret).toLowerCase()) throw Error("Unproven destination claim");
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
    const receipt=await src(e).waitForTransactionReceipt({hash:tx,confirmations:Number(e.SOURCE_CONFIRMATIONS),timeout:120000});
    if(receipt.status!=="success")throw Error("Source refund failed");
    await saveSwap(e,{intent_id:id,source_status:"REFUNDED"});
  }else{
    const s=await dst(e).readContract({address:destAddress(e),abi:destinationAbi,functionName:"swaps",args:[id]});
    if(s[5]!==1 || BigInt(Math.floor(Date.now()/1000))<s[4]) return;
    const account=solver(e,s[0]);
    const wallet=createWalletClient({account,chain:portaldot,transport:http(e.PORTALDOT_EVM_RPC_URL)});
    const sim=await dst(e).simulateContract({account,address:destAddress(e),abi:destinationAbi,functionName:"refund",args:[id]});
    const tx=await wallet.writeContract(sim.request);
    const receipt=await dst(e).waitForTransactionReceipt({hash:tx,confirmations:Number(e.DEST_CONFIRMATIONS),timeout:120000});
    if(receipt.status!=="success")throw Error("Destination refund failed");
    await saveSwap(e,{intent_id:id,destination_status:"REFUNDED"});
  }
}
async function expiryJobs(e:Env){
  const now=Math.floor(Date.now()/1000);
  const records=await collectPages<ExpiryRow>(
    (offset,limit)=>db<ExpiryRow[]>(e,"swaps",expiryQuery(now,offset,limit)),100,
  );
  for(const refundJob of expiredJobs(records,now)) await e.HARBOR_JOBS.send(refundJob);
}
async function job(e:Env,j:Job){
  if(j.type==="scan") return scan(e,j.chain);
  if(!isBytes32(j.intentId))throw Error("Invalid intent");
  if(j.type==="fund")return fund(e,j.intentId);
  if(j.type==="claimSource")return claimSource(e,j.intentId,j.secret as Hex);
  if(j.type==="refundSource")return refund(e,"source",j.intentId);
  if(j.type==="refundDestination")return refund(e,"destination",j.intentId);
}
function isJob(value:unknown):value is Job{
  if(!value || typeof value!=="object") return false;
  const type=(value as {type?:unknown}).type;
  if(type==="scan") return (value as {chain?:unknown}).chain==="source" || (value as {chain?:unknown}).chain==="destination";
  if(type==="fund" || type==="refundSource" || type==="refundDestination")
    return typeof (value as {intentId?:unknown}).intentId === "string";
  return type==="claimSource"
    && typeof (value as {intentId?:unknown}).intentId === "string"
    && typeof (value as {secret?:unknown}).secret === "string";
}

async function tokenMatches(provided:string, expected:string):Promise<boolean>{
  if(!provided || !expected) return false;
  const encoder=new TextEncoder();
  const [left,right]=await Promise.all([
    crypto.subtle.digest("SHA-256",encoder.encode(provided)),
    crypto.subtle.digest("SHA-256",encoder.encode(expected)),
  ]);
  const a=new Uint8Array(left),b=new Uint8Array(right);
  let difference=0;
  for(let i=0;i<a.length;i++) difference|=a[i]^b[i];
  return difference===0;
}
export default {
  async fetch(req:Request,e:Env):Promise<Response>{
    const u=new URL(req.url);
    try {
      if(u.pathname==="/health"){
        await chains(e);
        return json({service:"HARBOR",precisionVerified:e.PORTALDOT_EVM_VALUE_DECIMALS_VERIFIED==="true",chainIds:{source:BASE_ID,destination:PORTALDOT_ID}});
      }
      if(u.pathname==="/v1/quotes"&&req.method==="POST") return createQuotes(e,await req.json());
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
        const supplied=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
        if(!await tokenMatches(supplied,e.WORKER_ADMIN_TOKEN)) return json({error:"Unauthorized"},401);
        await e.HARBOR_JOBS.sendBatch([{body:{type:"scan",chain:"source"}},{body:{type:"scan",chain:"destination"}}]);
        return json({queued:true});
      }
      return json({error:"Not found"},404);
    } catch(err){
      logError("request_failed",{path:u.pathname,method:req.method,error:err instanceof Error?err.message:String(err)});
      return json({error:"Service temporarily unavailable"},503);
    }
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
      try{
        if(!isJob(msg.body)) throw Error("Invalid queue message");
        await job(e,msg.body);
        msg.ack();
      }catch(err){
        const type=msg.body&&typeof msg.body==="object"?(msg.body as {type?:unknown}).type:undefined;
        logError("queue_retry",{type,error:err instanceof Error?err.message:String(err)});
        msg.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
