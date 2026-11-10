import Link from "next/link";
import {
  Check,
  ArrowUpRight,
  Plus,
  MoreVertical,
  ChevronDown,
  ArrowRight,
  WifiOff,
} from "lucide-react";
export default function Home() {
  return (
    <div className="site">
      <nav className="site-nav">
        <Link className="tick-brand" href="/">
          <span className="tick-mark">
            <Check size={22} />
          </span>
          tick & done<sup>®</sup>
        </Link>
        <div>
          <Link href="/docs">The details</Link>
          <Link href="/downloads">Downloads</Link>
          <Link href="/app" className="site-nav-cta">
            Open your space <ArrowUpRight size={14} />
          </Link>
        </div>
      </nav>
      <main>
        <section className="site-hero">
          <div className="hero-copy">
            <span className="section-kicker">
              <span className="status-dot" /> A LITTLE LESS ON YOUR MIND
            </span>
            <h1>
              Life’s a lot.
              <br />
              Your list
              <br />
              <em>shouldn’t be.</em>
            </h1>
            <p>
              Things to do. Films to watch. A little space
              <br className="desktop-break" /> for all the things you’re keeping
              in your head.
            </p>
            <Link className="hero-cta" href="/app">
              Make a little room <ArrowUpRight size={19} />
            </Link>
            <span className="hero-footnote">
              Android · Linux · Web. And wherever your day goes.
            </span>
          </div>
          <div className="hero-composition">
            <div className="composition-caption">
              YOUR DAY, WITH A LITTLE MORE SPACE.
            </div>
            <div className="widget-demo todo-demo">
              <header>
                <span>
                  Today <ChevronDown size={15} />
                </span>
                <div>
                  <Plus />
                  <MoreVertical />
                </div>
              </header>
              <ul>
                <li>
                  <span className="demo-check checked">
                    <Check size={11} />
                  </span>
                  <s>Make something I actually want to use</s>
                </li>
                <li>
                  <span className="demo-check" />
                  Get out for a little walk
                </li>
                <li>
                  <span className="demo-check" />
                  Call home
                </li>
                <li>
                  <span className="demo-check" />
                  Do the thing I’ve been putting off
                </li>
              </ul>
              <footer>
                ONE THING AT A TIME <span>03 LEFT</span>
              </footer>
            </div>
            <div className="little-label">
              <span>✓</span> Made for the home screen.
            </div>
            <div className="widget-demo movie-demo">
              <header>
                <span>
                  For later <ChevronDown size={15} />
                </span>
                <Plus />
              </header>
              <div className="movie-demo-row">
                <span className="film-block">
                  AFTER
                  <br />
                  SUN<span>2022 · FILM</span>
                </span>
                <div>
                  <h3>Aftersun</h3>
                  <p>
                    A quiet night in.
                    <br />
                    Something worth watching.
                  </p>
                  <span className="demo-watch">ON THE WATCHLIST</span>
                </div>
              </div>
            </div>
            <div className="offline-label">
              <WifiOff size={14} /> Still here when Wi-Fi isn’t.
            </div>
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
          tick & done.
        </Link>
        <span>A little less on your mind.</span>
        <div>
          <Link href="/docs">Docs</Link>
          <Link href="/downloads">Downloads</Link>
          <a href="https://github.com/wrestle-R/Task-tick">GitHub ↗</a>
        </div>
      </footer>
    </div>
  );
}
