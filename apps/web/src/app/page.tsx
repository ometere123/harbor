import Link from "next/link";
import { ArrowUpRight, ArrowLeftRight, Lock, Radio, ScrollText, Shield, Waves } from "lucide-react";
const features=[
  {title:"Competing solver quotes",copy:"Two independent signer identities offer transparent testnet exchange quotes.",Icon:ArrowLeftRight},
  {title:"Funds stay in escrow",copy:"Hashlocked contracts hold both sides and release only to the designated recipients.",Icon:Lock},
  {title:"Verifiable settlement",copy:"Source and destination contract states are checked independently, with receipts for each leg.",Icon:ScrollText},
];
export default function Home(){
  return <div>
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute -z-10 rounded-full bg-aqua/10 blur-[110px] w-80 h-80 right-5 top-10"/>
      <span className="eyebrow">PORTALDOT V3 · BASE SEPOLIA</span>
      <h1 className="mt-5 max-w-4xl text-5xl md:text-7xl leading-[1.08] font-semibold tracking-tight">Move value, <span className="text-aqua">not trust.</span></h1>
      <p className="mt-7 max-w-2xl text-lg md:text-xl muted leading-relaxed">An intent-driven settlement marketplace where solvers compete to deliver native tPOTv3, and hashlocked escrows keep both sides accountable.</p>
      <div className="flex flex-wrap gap-3 mt-9">
        <Link href="/swap" className="btn btn-primary">Start a swap <ArrowUpRight size={18}/></Link>
        <Link href="/docs" className="btn btn-outline">How it works</Link>
      </div>
      <p className="mt-6 text-xs muted flex gap-2 items-center"><Radio size={13}/> Two testnets · Real contract receipts · No bridge custody</p>
    </section>
    <section className="grid md:grid-cols-3 gap-4 pb-16">
      {features.map(({title,copy,Icon})=><article className="panel p-6" key={title}>
        <Icon size={27} className="text-aqua mb-7"/><h2 className="text-lg font-semibold">{title}</h2><p className="muted mt-3 leading-relaxed text-sm">{copy}</p>
      </article>)}
    </section>
    <section className="panel p-8 md:p-12 mb-12 grid md:grid-cols-2 gap-10 items-center">
      <div><span className="eyebrow">One clear direction</span>
        <h2 className="text-3xl font-semibold mt-4 mb-4">Base Sepolia to Portaldot V3.</h2>
        <p className="muted leading-relaxed">Lock demo hUSD on Base Sepolia. A solver locks native tPOTv3 on Portaldot. Reveal a secret to receive your tPOTv3 and enable the solver to claim hUSD.</p>
        <p className="mt-5 text-sm text-aqua">No wrapped asset, no bridge operator, no hidden settlement administrator.</p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="stat flex gap-4 items-center"><Waves className="text-aqua"/><div><b>Base Sepolia</b><p className="muted text-sm">Source · hUSD 6 decimals</p></div></div>
        <div className="flex justify-center"><ArrowLeftRight className="text-aqua rotate-90"/></div>
        <div className="stat flex gap-4 items-center"><Shield className="text-aqua"/><div><b>Portaldot V3</b><p className="muted text-sm">Destination · native tPOTv3</p></div></div>
      </div>
    </section>
  </div>;
}
