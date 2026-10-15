import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

function acceptable(parts:string[],method:string){
  const slug=parts.join("/");
  if(method==="GET") return slug==="health"||slug==="v1/solvers"||
    /^v1\/swaps\/0x[a-fA-F0-9]{64}$/.test(slug)||
    /^v1\/activity\/0x[a-fA-F0-9]{40}$/.test(slug);
  return method==="POST"&&slug==="v1/quotes";
}
async function proxy(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const parts=(await params).path;
  if(!acceptable(parts,request.method))return NextResponse.json({error:"Unsupported endpoint"},{status:404});
  const target=process.env.WORKER_API_URL;
  if(!target)return NextResponse.json({error:"Worker endpoint not configured"},{status:503});
  try{
    const res=await fetch(target.replace(/\/$/,"")+"/"+parts.join("/"),{
      method:request.method,
      headers:{"Content-Type":"application/json"},
      body:request.method==="POST"?await request.text():undefined,
      cache:"no-store",
      signal:AbortSignal.timeout(20000),
    });
    return new NextResponse(await res.text(),{status:res.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({error:"Worker temporarily unavailable"},{status:503});
  }
}
export const GET=proxy;
export const POST=proxy;
