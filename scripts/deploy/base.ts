import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
async function main(){
  if(network.name!=="baseSepolia")throw Error("Use --network baseSepolia, never mainnet");
  const n=await ethers.provider.getNetwork();
  if(n.chainId!==84532n)throw Error("Incorrect Base Sepolia chain ID");
  const target=process.env.DESTINATION_ESCROW_ADDRESS;
  const treasury=process.env.TREASURY_ADDRESS;
  if(!target||!ethers.isAddress(target)||!treasury||!ethers.isAddress(treasury))
    throw Error("Set DESTINATION_ESCROW_ADDRESS and TREASURY_ADDRESS");
  const destinationCode=await ethers.provider.getCode(target);
  if(destinationCode==="0x")throw Error("Destination escrow has no deployed code on Portaldot");
  const hUSD=await ethers.deployContract("HarborTestUSD");
  await hUSD.waitForDeployment();
  const source=await ethers.deployContract("HarborSourceEscrow",[await hUSD.getAddress(),target,treasury,420420777n]);
  await source.waitForDeployment();
  const deployed=[];
  for(const [name,instance] of [["HarborTestUSD",hUSD],["HarborSourceEscrow",source]] as const){
    const tx=instance.deploymentTransaction();
    if(!tx)throw Error("Missing deployment transaction");
    const receipt=await tx.wait(2);
    if(!receipt||receipt.status!==1)throw Error("Deployment not confirmed");
    deployed.push({name,address:await instance.getAddress(),deploymentTx:tx.hash,blockNumber:receipt.blockNumber});
  }
  const sourceCode=await ethers.provider.getCode(await source.getAddress());
  const tokenCode=await ethers.provider.getCode(await hUSD.getAddress());
  if(sourceCode==="0x"||tokenCode==="0x")throw Error("Base deployment has missing contract code");
  if((await source.destinationEscrow()).toLowerCase()!==target.toLowerCase()
    ||(await source.sourceToken()).toLowerCase()!==(await hUSD.getAddress()).toLowerCase()
    ||(await source.treasury()).toLowerCase()!==treasury.toLowerCase())
    throw Error("Base constructor bindings do not match configuration");
  const manifest={network:"baseSepolia",chainId:Number(n.chainId),treasury,destinationEscrow:target,deployed};
  mkdirSync("deployments",{recursive:true});
  writeFileSync("deployments/base-sepolia.json",JSON.stringify(manifest,null,2)+"\n");
  console.log(JSON.stringify(manifest,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
