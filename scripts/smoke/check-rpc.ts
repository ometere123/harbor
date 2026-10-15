import { createPublicClient, http, parseUnits, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { portaldot } from "../../packages/protocol/src/index";

async function main(){
  const base=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_RPC_URL||"https://sepolia.base.org")});
  const dest=createPublicClient({chain:portaldot,transport:http(process.env.PORTALDOT_EVM_RPC_URL||"https://testnetv3-eth-rpc.feso-apps.xyz")});
  const [a,b]=await Promise.all([base.getChainId(),dest.getChainId()]);
  if(a!==84532||b!==420420777)throw Error("RPC network mismatch");
  console.log("Source chain",a,"block",(await base.getBlockNumber()).toString());
  console.log("Destination chain",b,"block",(await dest.getBlockNumber()).toString());
  const account=process.env.PORTALDOT_PROBE_ADDRESS;
  if(account && account.startsWith("0x")){
    const raw=await dest.getBalance({address:account as "0x"+string});
    const valueDecimals=Number(process.env.PORTALDOT_EVM_VALUE_DECIMALS || "18");
    console.log("Raw EVM balance",raw.toString());
    console.log("Display at configured EVM scale",formatUnits(raw,valueDecimals));
    console.log("IMPORTANT: Balance alone cannot establish the Substrate-to-EVM unit conversion.");
    console.log("Confirm with a known native-side transfer and exact payable escrow roundtrip.");
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
