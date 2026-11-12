import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Check, WifiOff, Monitor, Smartphone, Plus } from "lucide-react";
import { SkeuoSurface } from "@tick/ui/skeuo";
import { MarketingSite } from "./site-navigation";
export default function Home() {
  return <MarketingSite>
    <main className="desk-landing">
      <section className="desk-hero" aria-labelledby="hero-heading">
        <div className="desk-intro">
          <span className="desk-label">A SMALL APP FOR THE EVERYDAY</span>
          <h1 id="hero-heading">A little less<br/>on your mind.</h1>
          <p>Things to do. Films to watch.<br/>One quiet place to put them.</p>
          <Link className="desk-launch" href="/app">Make a little room <ArrowUpRight size={18}/></Link>
          <span className="hero-footnote">Android · Linux · Web</span>
        </div>
        <div className="desk-object" aria-label="A preview of the Task-tick list widget">
          <div className="fold-stamp"><Image src="/hero-fold.png" alt="" width={1254} height={1254} preload sizes="160px"/></div>
          <SkeuoSurface className="landing-widget">
            <div className="preview-heading"><span>Today, gently.</span><Plus size={21}/></div>
            <div className="preview-row"><span className="preview-check"/>Send that email</div>
            <div className="preview-row"><span className="preview-check"/>A walk, without the phone</div>
            <div className="preview-row"><span className="preview-check"/>Pick a film for tonight</div>
            <div className="preview-row preview-done"><span className="preview-check"><Check size={12}/></span>Write it down</div>
            <span className="preview-caption">A widget away. Even offline.</span>
          </SkeuoSurface>
          <span className="object-note">Less opening apps.<br/>More getting on with it.</span>
        </div>
      </section>
      <section className="desk-details" aria-label="How it fits your day">
        <article><Smartphone size={22}/><h2>The widget is the point.</h2><p>Two compact lists. Add a thought, finish a task, pick your next film. Right from your home screen.</p></article>
        <article><WifiOff size={22}/><h2>No signal is normal.</h2><p>Changes save on your device first. Reconnect and your lists catch up across your signed-in devices.</p></article>
        <article><Monitor size={22}/><h2>A little room, everywhere.</h2><p>Android, a Linux desktop app and your browser. Your own account, your own space.</p></article>
      </section>
      <section className="desk-bottom"><div><span className="desk-label">SMALL ON PURPOSE</span><h2>One todo list.<br/>One watchlist. That’s plenty.</h2></div><div><p>Not everything needs a dashboard.<br/>Sometimes you just need to write it down.</p><Link className="desk-launch" href="/app">Open your space <ArrowUpRight size={18}/></Link></div></section>
    </main>
    <footer className="site-footer"><Link className="tick-brand" href="/">Task-tick</Link><span>A little less on your mind.</span><div><Link href="/docs">Docs</Link><Link href="/downloads">Downloads</Link><a href="https://github.com/wrestle-R/Task-tick">GitHub ↗</a></div></footer>
  </MarketingSite>;
}
