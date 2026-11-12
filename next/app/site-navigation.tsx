"use client";
import Link from "next/link";
import { Menu, Moon, Sun, X, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function MarketingSite({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [initialized, setInitialized] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const saved = localStorage.getItem("tick-theme");
    setTheme(saved === "light" ? "light" : "dark");
    setInitialized(true);
  }, []);
  useEffect(() => {
    if (!initialized) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tick-theme", theme);
  }, [theme, initialized]);
  useEffect(() => {
    if (!menuOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [menuOpen]);
  return (
    <div className="site marketing-site" data-theme={theme}>
      <header className="site-nav" ref={header}>
        <Link className="tick-brand" href="/" aria-label="Task-tick home">
          <svg className="fold-mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M2 12 12 19 30 3v14L12 32 2 24Z" fill="currentColor" />
            <path d="m2 12 10 7v13L2 24Z" fill="currentColor" opacity=".6" />
          </svg>
          Task-tick
        </Link>
        <div className="site-nav-actions">
          <button className="site-theme-toggle" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <span className="theme-track" aria-hidden="true">
              <span className={theme === "light" ? "theme-option active" : "theme-option"}><Sun size={17} /></span>
              <span className={theme === "dark" ? "theme-option active" : "theme-option"}><Moon size={16} /></span>
            </span>
          </button>
          <button ref={menuButton} className="site-menu-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        <nav id="site-menu" className="site-menu" aria-label="Main navigation" hidden={!menuOpen} onClick={() => setMenuOpen(false)}>
          <Link href="/docs">The details</Link>
          <Link href="/downloads">Downloads</Link>
          <Link href="/app" className="site-nav-cta">Open your space <ArrowUpRight size={16} /></Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
