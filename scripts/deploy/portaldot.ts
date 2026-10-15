import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
async function main(){
  if(network.name!=="portaldotV3")throw Error("Use --network portaldotV3, never mainnet");
  const n=await ethers.provider.getNetwork();
  if(n.chainId!==420420777n)throw Error("Incorrect Portaldot testnet chain ID");
  const [deployer]=await ethers.getSigners();
  console.log("Portaldot deployer",deployer.address,"balance",String(await ethers.provider.getBalance(deployer.address)));
  const escrow=await ethers.deployContract("HarborDestinationEscrow");
  await escrow.waitForDeployment();
  const tx=escrow.deploymentTransaction();
  if(!tx)throw Error("Missing deployment transaction");
  const receipt=await tx.wait(2);
  if(!receipt||receipt.status!==1)throw Error("Deployment not confirmed");
  const manifest={
    contract:"HarborDestinationEscrow",network:"portaldotV3",
    chainId:Number(n.chainId),address:await escrow.getAddress(),
    deploymentTx:tx.hash,blockNumber:receipt.blockNumber,
  };
  mkdirSync("deployments",{recursive:true});
  writeFileSync("deployments/portaldot-v3.json",JSON.stringify(manifest,null,2)+"\n");
  console.log(JSON.stringify(manifest,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
