import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
async function main(){
  if(network.name!=="portaldotV3")throw Error("Use --network portaldotV3, never mainnet");
  const n=await ethers.provider.getNetwork();
  if(n.chainId!==420420777n)throw Error("Incorrect Portaldot testnet chain ID");
  const [deployer]=await ethers.getSigners();
  console.log("Portaldot deployer",deployer.address,"balance",String(await ethers.provider.getBalance(deployer.address)));
  const alpha=process.env.SOLVER_ALPHA_ADDRESS;
  const bravo=process.env.SOLVER_BRAVO_ADDRESS;
  if(!alpha||!bravo||!ethers.isAddress(alpha)||!ethers.isAddress(bravo)||alpha.toLowerCase()===bravo.toLowerCase())throw Error("Set distinct SOLVER_ALPHA_ADDRESS and SOLVER_BRAVO_ADDRESS");
  const escrow=await ethers.deployContract("HarborDestinationEscrow",[alpha,bravo]);
  await escrow.waitForDeployment();
  const tx=escrow.deploymentTransaction();
  if(!tx)throw Error("Missing deployment transaction");
  const receipt=await tx.wait(2);
  if(!receipt||receipt.status!==1)throw Error("Deployment not confirmed");
  const code=await ethers.provider.getCode(await escrow.getAddress());
  if(code==="0x")throw Error("Destination deployment has no contract code");
  const storedAlpha=await escrow.solverAlpha();
  const storedBravo=await escrow.solverBravo();
  if(storedAlpha.toLowerCase()!==alpha.toLowerCase()||storedBravo.toLowerCase()!==bravo.toLowerCase())
    throw Error("Destination constructor solver identities do not match configuration");
  const manifest={
    contract:"HarborDestinationEscrow",network:"portaldotV3",
    chainId:Number(n.chainId),address:await escrow.getAddress(),
    deploymentTx:tx.hash,blockNumber:receipt.blockNumber,solverAlpha:alpha,solverBravo:bravo,
  };
  mkdirSync("deployments",{recursive:true});
  writeFileSync("deployments/portaldot-v3.json",JSON.stringify(manifest,null,2)+"\n");
  console.log(JSON.stringify(manifest,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
