import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { MarketingSite } from "./site-navigation";
export default function Home() {
  return (
    <MarketingSite>
      <main>
        <section className="site-hero" aria-labelledby="hero-heading">
          <div className="hero-art" aria-hidden="true">
            <Image src="/hero-fold.png" alt="" width={1254} height={1254} preload sizes="(max-width: 760px) 100vw, 62vw" />
          </div>
          <div className="hero-copy">
            <h1 id="hero-heading">A little less<br />on your mind.</h1>
            <p>Things to do. Films to watch.</p>
            <Link className="hero-cta" href="/app">Make a little room <ArrowUpRight size={21} /></Link>
            <span className="hero-footnote">Android · Linux · Web</span>
          </div>
        </section>
        <section className="site-strip">
          <span>Less opening apps.</span>
          <span>More actually doing things.</span>
          <span>A widget away.</span>
        </section>
        <section className="site-story">
          <span className="section-kicker">SMALL ON PURPOSE</span>
          <div>
            <h2>
              Not another place
              <br />
              to manage your life.
              <br />
              <em>A little less to manage.</em>
            </h2>
            <div className="story-copy">
              <p>
                One todo list. One watchlist. Two widgets that put the important
                bits right on your home screen.
              </p>
              <p>
                Check something off. Add a thought before it disappears. Pick a
                film for tonight. Without turning any of it into a project.
              </p>
              <Link href="/docs">
                See how it works <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
        <section className="site-features">
          <article>
            <span>01 / WITHIN REACH</span>
            <h3>
              The widget is
              <br />
              the whole point.
            </h3>
            <p>
              Add, finish, and undo right from your home screen. Your lists,
              without the detour.
            </p>
          </article>
          <article>
            <span>02 / NO SIGNAL? NO PROBLEM.</span>
            <h3>
              Offline is
              <br />a normal day.
            </h3>
            <p>
              Your changes save on your device first. We catch everything up
              when you’re connected.
            </p>
          </article>
          <article>
            <span>03 / YOUR OWN LITTLE SPACE</span>
            <h3>
              One list.
              <br />
              All your devices.
            </h3>
            <p>
              Phone, Linux desktop, and browser. Private to your account. Ready
              when you are.
            </p>
          </article>
        </section>
        <section className="site-outro">
          <span className="section-kicker">ONE LESS THING TO THINK ABOUT</span>
          <h2>
            Write it down.
            <br />
            <em>Get on with your day.</em>
          </h2>
          <Link href="/app" className="hero-cta">
            Your space is waiting <ArrowUpRight size={19} />
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <Link className="tick-brand" href="/">
          Task-tick
        </Link>
        <span>A little less on your mind.</span>
        <div>
          <Link href="/docs">Docs</Link>
          <Link href="/downloads">Downloads</Link>
          <a href="https://github.com/wrestle-R/Task-tick">GitHub ↗</a>
        </div>
      </footer>
    </MarketingSite>
  );
}
