"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Anchor } from "lucide-react";
import { WalletConnect } from "./WalletConnect";

const routes=[["/swap","Swap"],["/activity","Activity"],["/solvers","Solvers"],["/proof","Proof"],["/docs","Docs"]];
export function Navigation(){
  const pathname=usePathname();
  return <header className="border-b border-white/10 sticky top-0 z-40 bg-[#07131ce8] backdrop-blur-xl">
    <div className="shell py-4 flex items-center justify-between gap-4">
      <Link href="/" className="font-black tracking-[.12em] text-xl flex items-center gap-2"><Anchor className="text-aqua"/> HARBOR</Link>
      <nav className="hidden lg:flex gap-7 text-sm">
        {routes.map(([path,label])=><Link className={pathname.startsWith(path)?"text-aqua":"muted hover:text-white"} key={path} href={path}>{label}</Link>)}
      </nav>
      <WalletConnect/>
    </div>
    <nav className="lg:hidden shell pb-3 flex flex-wrap gap-4 text-sm">
      {routes.map(([path,label])=><Link key={path} href={path} className={pathname.startsWith(path)?"text-aqua":"muted"}>{label}</Link>)}
    </nav>
  </header>;
}
