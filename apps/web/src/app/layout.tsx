import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { Navigation } from "@/components/Navigation";
export const metadata:Metadata={
  title:"HARBOR | Non-custodial cross-chain settlement",
  description:"Intent-based testnet swaps between Base Sepolia and Portaldot V3.",
};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>
    <WalletProvider><Navigation/><main className="shell min-h-[78vh] pb-20">{children}</main></WalletProvider>
    <footer className="border-t border-white/10"><div className="shell py-7 flex flex-col md:flex-row justify-between gap-3 muted text-xs">
      <span>HARBOR · Portaldot Hacker House 2026</span>
      <span>Testnet tokens only. Not audited. No real funds.</span>
    </div></footer>
  </body></html>;
}
