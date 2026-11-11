"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import {
  Check,
  Plus,
  Clapperboard,
  ListTodo,
  Sun,
  Moon,
  Search,
  ArrowUpRight,
  Trash2,
  RotateCcw,
  ChevronRight,
  LogOut,
  Settings,
  Cloud,
  CloudOff,
  History,
  GripVertical,
  X,
  Download,
} from "lucide-react";
import {
  apply,
  complete,
  createMutation,
  defaults,
  duplicate,
  emptyState,
  newId,
  reconcile,
  visible,
  type State,
  type Item,
  type Kind,
  type Fields,
  type Mutation,
} from "@tick/core";
import { browserStorage, type Storage } from "./storage";
type Config = { url: string; key: string; api: string };
type Props = {
  storage?: Storage;
  initialConfig?: Config;
  desktop?: boolean;
  nativeReminderSettings?: {
    get(): Promise<boolean>;
    set(enabled: boolean): Promise<void>;
  };
};
type Tmdb = {
  id: number;
  title?: string;
  name?: string;
  media_type: "movie" | "tv";
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
};
export function Workspace({
  storage = browserStorage,
  initialConfig,
  desktop = false,
  nativeReminderSettings,
}: Props) {
  const [config, setConfig] = useState<Config | null>(initialConfig ?? null),
    [client, setClient] = useState<SupabaseClient | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false);
  const [state, setState] = useState<State>(emptyState),
    [ready, setReady] = useState(false),
    [kind, setKind] = useState<Kind>("todo"),
    [view, setView] = useState<"active" | "done" | "trash" | "history">(
      "active",
    );
  const [query, setQuery] = useState(""),
    [title, setTitle] = useState(""),
    [selected, setSelected] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [syncing, setSyncing] = useState(false),
    [online, setOnline] = useState(true),
    [dark, setDark] = useState(false),
    [authMode, setAuthMode] = useState<"login" | "signup" | "reset" | "update">(
      "login",
    );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [authBusy, setAuthBusy] = useState(false),
    [undo, setUndo] = useState<{ items: Item[]; until: number } | null>(null),
    [tmdb, setTmdb] = useState<Tmdb[]>([]),
    [finding, setFinding] = useState(false),
    [settings, setSettings] = useState(false),
    [reminders, setReminders] = useState(false);
  const stateRef = useRef(state),
    accountRef = useRef(""),
    queue = useRef(Promise.resolve()),
    syncLock = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    setDark(
      localStorage.getItem("tick-theme") === "dark" ||
        (!localStorage.getItem("tick-theme") &&
          matchMedia("(prefers-color-scheme: dark)").matches),
    );
    setReminders(localStorage.getItem("tick-reminders") === "yes");
    if (!initialConfig) {
      const api = desktop ? "https://task-tick-beige.vercel.app" : "";
      let cached: Config | null = null;
      try {
        cached = JSON.parse(
          localStorage.getItem(`tick-config:${api}`) ?? "null",
        );
        if (cached?.url && cached?.key) setConfig(cached);
      } catch {}
      fetch(`${api}/api/config`)
        .then((r) => r.json())
        .then((c) => {
          if (!c.url || !c.key)
            throw new Error("Account service is not configured yet.");
          const next = { ...c, api };
          localStorage.setItem(`tick-config:${api}`, JSON.stringify(next));
          if (!cached || cached.url !== next.url || cached.key !== next.key)
            setConfig(next);
        })
        .catch((e) => {
          if (!cached) setError(e.message);
          setAuthReady(true);
        });
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [initialConfig, desktop]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("tick-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!config) return;
    const c = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    setClient(c);
    c.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = c.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setAuthMode("update");
    });
    return () => data.subscription.unsubscribe();
  }, [config]);
  useEffect(() => {
    let live = true;
    setReady(false);
    const account = session?.user.id ?? "";
    accountRef.current = account;
    stateRef.current = emptyState();
    setState(emptyState());
    setSelected(null);
    void storage.activate?.(account || null);
    if (account)
      storage
        .load(account)
        .then((s) => {
          if (live) {
            stateRef.current = s;
            setState(s);
            setReady(true);
          }
        })
        .catch((e) => setError(`Local storage: ${e.message}`));
    return () => {
      live = false;
    };
  }, [session?.user.id, storage]);
  const change = useCallback(
    (fn: (s: State) => State) => {
      const account = accountRef.current;
      if (!account) return Promise.resolve();
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          const work = async () => {
            if (account !== accountRef.current) return;
            for (let attempt = 0; attempt < 4; attempt++) {
              const latest = await storage.load(account);
              const next = fn(latest);
              try {
                await storage.save(account, next);
                if (account === accountRef.current) {
                  stateRef.current = next;
                  setState(next);
                }
                return;
              } catch (e) {
                if (!String(e).includes("Concurrent update") || attempt === 3)
                  throw e;
              }
            }
          };
          if (navigator.locks)
            await navigator.locks.request(`tick:${account}`, work);
          else await work();
        })
        .catch((e) => setError(`Could not save: ${e.message}`));
      return queue.current;
    },
    [storage],
  );
  const sync = useCallback(async () => {
    if (!session || !config || !ready || !navigator.onLine || syncLock.current)
      return;
    syncLock.current = true;
    setSyncing(true);
    const account = session.user.id;
    try {
      await queue.current;
      const fresh = await storage.load(account);
      if (account !== accountRef.current) return;
      stateRef.current = fresh;
      setState(fresh);
      const pending = fresh.outbox.slice(0, 100);
      const { data: auth } = await client!.auth.getSession();
      if (account !== accountRef.current) return;
      if (auth.session && auth.session.user.id !== account) return;
      if (!auth.session)
        throw new Error("Sign in again to sync. Your edits are saved here.");
      const response = await fetch(`${config.api}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.session.access_token}`,
        },
        body: JSON.stringify({
          mutations: pending,
          cursor: stateRef.current.cursor,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sync unavailable");
      if (account !== accountRef.current) return;
      await change((s) =>
        reconcile(
          { ...s, history: result.history ?? s.history },
          result.items,
          result.accepted,
          result.cursor,
        ),
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sync failed; your edits remain on this device.",
      );
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [session, config, ready, client, change]);
  useEffect(() => {
    if (!ready) return;
    void sync();
    const timer = setInterval(() => void sync(), 15000);
    const onFocus = () => void sync();
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, sync]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    if (session && nativeReminderSettings)
      nativeReminderSettings
        .get()
        .then(setReminders)
        .catch((e) => setError(String(e)));
  }, [session?.user.id, nativeReminderSettings]);
  useEffect(() => {
    if (desktop || !reminders || !ready) return;
    const notify = () => {
      if (!("Notification" in window) || Notification.permission !== "granted")
        return;
      const now = Date.now();
      const due = stateRef.current.items.filter(
        (i) => !i.done && !i.deletedAt && i.dueAt && Date.parse(i.dueAt) <= now,
      );
      const fresh = due.filter(
        (i) =>
          localStorage.getItem(`tick-reminded:${session?.user.id}:${i.id}`) !==
          i.dueAt,
      );
      if (fresh.length) {
        new Notification(
          fresh.length === 1 ? fresh[0].title : `${fresh.length} tasks are due`,
          {
            body: "Open Tick and Done to see your unfinished tasks.",
            tag: "tick-overdue",
          },
        );
        fresh.forEach((i) =>
          localStorage.setItem(
            `tick-reminded:${session?.user.id}:${i.id}`,
            i.dueAt!,
          ),
        );
      }
    };
    notify();
    const t = setInterval(notify, 30000);
    return () => clearInterval(t);
  }, [desktop, reminders, ready, session?.user.id]);
  async function auth(e: React.FormEvent) {
    e.preventDefault();
    if (!client) {
      setError("Set up the account service first.");
      return;
    }
    setAuthBusy(true);
    setError("");
    setMessage("");
    try {
      const redirect =
        desktop
          ? `${config?.api ?? "https://task-tick-beige.vercel.app"}/app`
          : typeof window === "undefined" ? "" : `${window.location.origin}/app`;
      const result =
        authMode === "signup"
          ? await client.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: redirect },
            })
          : authMode === "reset"
            ? await client.auth.resetPasswordForEmail(email, {
                redirectTo: redirect,
              })
            : authMode === "update"
              ? await client.auth.updateUser({ password })
              : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (authMode === "signup")
        setMessage("Check your email to verify your account.");
      if (authMode === "reset")
        setMessage("Check your email for a password reset link.");
      if (authMode === "update") {
        setAuthMode("login");
        setMessage("Password updated.");
      }
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }
  async function signout() {
    if (
      stateRef.current.outbox.length &&
      !window.confirm(
        `${stateRef.current.outbox.length} changes have not synced. Keep them on this device for your next sign-in and sign out?`,
      )
    )
      return;
    await queue.current;
    await client?.auth.signOut({ scope: "local" });
    setState(emptyState());
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const t = title.trim();
    if (
      kind === "movie" &&
      state.items.some(
        (i) =>
          i.kind === "movie" &&
          !i.deletedAt &&
          i.title.toLocaleLowerCase() === t.toLocaleLowerCase(),
      ) &&
      !confirm("A similar title is already here. Add a separate entry?")
    )
      return;
    await change((s) => apply(s, createMutation(kind, { title: t })));
    setTitle("");
    void sync();
  }
  async function toggle(item: Item) {
    let previous: Item[] = [];
    await change((s) => {
      const result = complete(s, item, !item.done);
      previous = result.previous;
      return result.state;
    });
    setUndo({ items: previous, until: Date.now() + 10000 });
    void sync();
  }
  async function undoLatest() {
    if (!undo) return;
    const old = undo;
    setUndo(null);
    await change((s) =>
      old.items.reduce(
        (acc, i) => apply(acc, createMutation(i.kind, { done: i.done }, i.id)),
        s,
      ),
    );
    void sync();
  }
  async function patch(item: Item, p: Partial<Fields>) {
    await change((s) => apply(s, createMutation(item.kind, p, item.id)));
    setSelected((s) => (s?.id === item.id ? { ...s, ...p } : s));
    void sync();
  }
  async function remove(item: Item, restore = false) {
    await change((s) =>
      apply(
        s,
        createMutation(item.kind, {}, item.id, restore ? "restore" : "delete"),
      ),
    );
    setSelected(null);
    void sync();
  }
  async function findMovies() {
    if (!query.trim() || !session || !config) return;
    setFinding(true);
    try {
      const r = await fetch(
        `${config.api}/api/movies?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTmdb(d.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFinding(false);
    }
  }
  async function addMovie(movie: Tmdb) {
    const existing = duplicate(state.items, movie.media_type, movie.id);
    if (existing) {
      setSelected(existing);
      return;
    }
    await change((s) =>
      apply(
        s,
        createMutation("movie", {
          title: movie.title ?? movie.name ?? "Untitled",
          mediaType: movie.media_type,
          tmdbId: movie.id,
          poster: movie.poster_path,
        }),
      ),
    );
    setTmdb([]);
    setQuery("");
    void sync();
  }
  const items =
    view === "history"
      ? []
      : visible(state, kind, view).filter((i) =>
          i.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        );
  const active = visible(state, kind).filter((i) => !i.parentId),
    done = visible(state, kind, "done");
  return (
    <div className="tick-shell">
      <aside className="tick-sidebar">
        <a className="tick-brand" href={desktop ? "#" : "/"}>
          <span className="tick-mark">
            <Check size={22} />
          </span>
          tick & done<span className="tick-brand-dot">®</span>
        </a>
        <span className="tick-eyebrow">A LITTLE LESS ON YOUR MIND</span>
        <nav aria-label="Lists">
          {(["todo", "movie"] as Kind[]).map((k) => (
            <button
              className={kind === k ? "nav-active" : ""}
              key={k}
              onClick={() => {
                setKind(k);
                setView("active");
                setSelected(null);
                setQuery("");
                setTmdb([]);
              }}
            >
              {k === "todo" ? (
                <ListTodo size={19} />
              ) : (
                <Clapperboard size={19} />
              )}
              <span>{k === "todo" ? "My todos" : "Watchlist"}</span>
              <small>
                {visible(state, k).filter((i) => !i.parentId).length}
              </small>
            </button>
          ))}
          <div className="nav-divider" />
          <button
            className={view === "done" ? "nav-active" : ""}
            onClick={() => setView("done")}
          >
            <Check size={18} />
            Completed
          </button>
          <button
            className={view === "trash" ? "nav-active" : ""}
            onClick={() => setView("trash")}
          >
            <Trash2 size={18} />
            Trash <small>7d</small>
          </button>
          <button
            className={view === "history" ? "nav-active" : ""}
            onClick={() => setView("history")}
          >
            <History size={18} />
            Recovery <small>7d</small>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" />A little space to get things done.
            <p>Your lists stay with you. Even offline.</p>
          </div>
          <button onClick={() => setSettings(true)}>
            <Settings size={17} /> Settings
          </button>
          <button onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          {session && (
            <button onClick={signout}>
              <LogOut size={17} /> Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="tick-main">
        <header className="workspace-header">
          <span>{desktop ? "YOUR DESKTOP" : "YOUR EVERYDAY SPACE"}</span>
          <div className="sync-indicator">
            {online ? <Cloud size={15} /> : <CloudOff size={15} />}
            <button onClick={() => void sync()} disabled={syncing}>
              {!online
                ? "Offline · saved here"
                : syncing
                  ? "Syncing…"
                  : state.outbox.length
                    ? `${state.outbox.length} pending`
                    : "Up to date"}
            </button>
            <button
              className="icon-button mobile-theme"
              aria-label="Toggle theme"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        {!session || authMode === "update" ? (
          <section className="auth-layout">
            <div>
              <span className="section-kicker">MAKE ROOM FOR WHAT MATTERS</span>
              <h1>
                A clearer head.
                <br />
                <em>A shorter list.</em>
              </h1>
              <p>
                One place for the things you need to do.
                <br />
                And the things you’ve been meaning to watch.
              </p>
              <div className="auth-detail">
                <Check size={16} /> Yours across phone, desktop & web.
              </div>
            </div>
            <form className="auth-form" onSubmit={auth}>
              <span className="section-kicker">TICK AND DONE</span>
              <h2>
                {authMode === "signup"
                  ? "Make yourself at home."
                  : authMode === "reset"
                    ? "Let’s get you back in."
                    : authMode === "update"
                      ? "A fresh password."
                      : "Good to have you here."}
              </h2>
              {authMode !== "update" && (
                <label>
                  Email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {authMode !== "reset" && (
                <label>
                  Password
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              <button
                className="primary-button"
                disabled={authBusy || !authReady}
              >
                {authBusy
                  ? "One moment…"
                  : authMode === "signup"
                    ? "Create account"
                    : authMode === "reset"
                      ? "Send reset link"
                      : authMode === "update"
                        ? "Update password"
                        : "Sign in"}
                <ArrowUpRight size={17} />
              </button>
              {message && <p role="status">{message}</p>}
              <div className="auth-links">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "signup" ? "login" : "signup");
                    setMessage("");
                  }}
                >
                  {authMode === "signup"
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"}
                </button>
                <button type="button" onClick={() => setAuthMode("reset")}>
                  Forgot password?
                </button>
              </div>
            </form>
          </section>
        ) : (
          <>
            <section className="list-heading">
              <div>
                <span className="section-kicker">
                  {view === "trash"
                    ? "ROOM FOR SECOND THOUGHTS"
                    : view === "history"
                      ? "NOTHING LOST IN THE SHUFFLE"
                      : kind === "todo"
                        ? "ONE THING AT A TIME"
                        : "FOR YOUR NEXT NIGHT IN"}
                </span>
                <h1>
                  {view === "done"
                    ? kind === "todo"
                      ? "Done & dusted."
                      : "That’s a wrap."
                    : view === "trash"
                      ? "The recycling pile."
                      : view === "history"
                        ? "A little rewind."
                        : kind === "todo"
                          ? "Less thinking."
                          : "Worth watching."}
                  <span className="heading-dot">●</span>
                </h1>
                <p>
                  {view === "active"
                    ? kind === "todo"
                      ? `${active.length} things to do. You’ve got this.`
                      : `${active.length} stories waiting for you.`
                    : view === "done"
                      ? `${done.length} ${kind === "todo" ? "things taken care of" : "titles watched"}.`
                      : view === "trash"
                        ? "Deleted items stay here for seven days."
                        : "Recover a previous version from the last seven days."}
                </p>
              </div>
              <div className="heading-art" aria-hidden="true">
                {kind === "todo" ? <Check /> : <Clapperboard />}
              </div>
            </section>
            <div className="list-toolbar">
              <div className="view-tabs">
                <button
                  className={view === "active" ? "selected" : ""}
                  onClick={() => setView("active")}
                >
                  {kind === "todo" ? "To do" : "To watch"}{" "}
                  <span>{active.length}</span>
                </button>
                <button
                  className={view === "done" ? "selected" : ""}
                  onClick={() => setView("done")}
                >
                  {kind === "todo" ? "Completed" : "Watched"}{" "}
                  <span>{done.length}</span>
                </button>
              </div>
              <div className="search-input">
                <Search size={16} />
                <input
                  aria-label="Search your list"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    kind === "movie" ? "Find a title…" : "Find something…"
                  }
                />
                {kind === "movie" && view === "active" && (
                  <button onClick={findMovies} disabled={finding || !online}>
                    {finding ? "Searching…" : "Search TMDB"}
                  </button>
                )}
              </div>
            </div>
            {view === "active" && (
              <form className="capture" onSubmit={add}>
                <Plus size={20} />
                <input
                  aria-label={
                    kind === "todo" ? "New task" : "New movie or TV title"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    kind === "todo"
                      ? "What’s on your mind?"
                      : "Add a movie or TV show…"
                  }
                />
                <kbd>↵</kbd>
                <button
                  type="submit"
                  aria-label="Add item"
                  disabled={!title.trim() || !ready}
                >
                  Add
                </button>
              </form>
            )}
            {tmdb.length > 0 && (
              <section className="tmdb-results" aria-label="TMDB results">
                <div className="results-title">
                  From TMDB{" "}
                  <button
                    onClick={() => setTmdb([])}
                    aria-label="Close results"
                  >
                    <X size={16} />
                  </button>
                </div>
                {tmdb
                  .filter(
                    (m) => m.media_type === "movie" || m.media_type === "tv",
                  )
                  .map((m) => (
                    <button
                      key={`${m.media_type}:${m.id}`}
                      onClick={() => void addMovie(m)}
                    >
                      <span>
                        {m.title ?? m.name}
                        <small>
                          {m.media_type === "tv" ? "TV series" : "Film"} ·{" "}
                          {(m.release_date ?? m.first_air_date ?? "").slice(
                            0,
                            4,
                          )}
                        </small>
                      </span>
                      <Plus size={18} />
                    </button>
                  ))}
              </section>
            )}
            <section className="task-list" aria-label="Items">
              {!ready ? (
                <p className="empty-state">Opening your list…</p>
              ) : view === "history" ? (
                state.history
                  .filter(
                    (h) =>
                      h.item.kind === kind &&
                      Date.parse(h.at) > Date.now() - 7 * 86400000,
                  )
                  .slice()
                  .reverse()
                  .map((h) => (
                    <div className="task-row" key={h.id}>
                      <History size={18} />
                      <span>
                        {h.item.title}
                        <small>{new Date(h.at).toLocaleString()}</small>
                      </span>
                      <button
                        onClick={() =>
                          void change((s) =>
                            apply(
                              s,
                              createMutation(
                                h.item.kind,
                                {
                                  title: h.item.title,
                                  notes: h.item.notes,
                                  done: h.item.done,
                                  dueAt: h.item.dueAt,
                                  priority: h.item.priority,
                                  rating: h.item.rating,
                                },
                                h.item.id,
                                "restore",
                              ),
                            ),
                          )
                        }
                      >
                        Recover
                      </button>
                    </div>
                  ))
              ) : (
                items.map((item) => (
                  <div
                    className={`task-row ${item.done ? "is-done" : ""} ${item.parentId ? "is-child" : ""}`}
                    key={item.id}
                    draggable={view === "active"}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", item.id)
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const moved = state.items.find(
                        (i) => i.id === e.dataTransfer.getData("text/plain"),
                      );
                      if (moved && moved.id !== item.id) {
                        const before =
                          items[items.findIndex((i) => i.id === item.id) - 1];
                        void patch(moved, {
                          position: before
                            ? (before.position + item.position) / 2
                            : item.position - 1,
                        });
                      }
                    }}
                  >
                    {view === "trash" ? (
                      <Trash2 size={18} />
                    ) : (
                      <button
                        className="checkbox"
                        aria-label={
                          item.done ? "Mark unfinished" : "Complete item"
                        }
                        onClick={() => void toggle(item)}
                      >
                        {item.done && <Check size={15} />}
                      </button>
                    )}
                    <button
                      className="task-title"
                      onClick={() => setSelected(item)}
                    >
                      {item.title}
                      <small>
                        {item.dueAt && (
                          <span
                            className={
                              Date.parse(item.dueAt) < Date.now()
                                ? "overdue"
                                : ""
                            }
                          >
                            {new Date(item.dueAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}{" "}
                            ·{" "}
                            {new Date(item.dueAt).toLocaleTimeString(
                              undefined,
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                        )}
                        {item.notes && <span>{item.notes.slice(0, 70)}</span>}
                        {item.mediaType && (
                          <span>
                            {item.mediaType === "tv" ? "TV SERIES" : "FILM"}
                          </span>
                        )}
                      </small>
                    </button>
                    {item.rating && (
                      <span className="rating">★ {item.rating}</span>
                    )}
                    {item.priority > 0 && (
                      <span className={`priority priority-${item.priority}`}>
                        {["", "Low", "Medium", "High"][item.priority]}
                      </span>
                    )}
                    {view === "trash" ? (
                      <button
                        aria-label="Restore item"
                        onClick={() => void remove(item, true)}
                      >
                        <RotateCcw size={17} />
                      </button>
                    ) : (
                      <>
                        <button
                          className="row-delete"
                          aria-label="Move to trash"
                          onClick={() => void remove(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                        <GripVertical className="drag-handle" size={15} />
                      </>
                    )}
                  </div>
                ))
              )}
              {ready && view !== "history" && items.length === 0 && (
                <div className="empty-state">
                  <span>{kind === "todo" ? "✓" : "✶"}</span>
                  <h3>
                    {query
                      ? "Nothing with that name."
                      : view === "active"
                        ? "A little breathing room."
                        : view === "trash"
                          ? "Nothing in the bin."
                          : "The good kind of empty."}
                  </h3>
                  <p>
                    {view === "active"
                      ? "Add something above. We’ll keep it safe, even offline."
                      : "Your items will appear here."}
                  </p>
                </div>
              )}
            </section>
            <footer className="list-footer">
              <span>
                <span className="status-dot" />
                Saved on this device
              </span>
              <span>Small steps. More space.</span>
            </footer>
          </>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss message" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      {undo && (
        <div className="undo-toast" role="status">
          <Check size={17} /> Taken care of.
          <button onClick={() => void undoLatest()}>Undo</button>
        </div>
      )}
      {selected && (
        <div className="sheet-scrim" onClick={() => setSelected(null)}>
          <aside
            className="detail-sheet"
            aria-label="Item details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="sheet-close"
              aria-label="Close details"
              onClick={() => setSelected(null)}
            >
              <X size={22} />
            </button>
            <span className="section-kicker">
              {selected.kind === "todo"
                ? "A LITTLE DETAIL"
                : "ON YOUR WATCHLIST"}
            </span>
            <h2>{selected.title}</h2>
            <label>
              Title
              <input
                value={selected.title}
                onChange={(e) =>
                  setSelected({ ...selected, title: e.target.value })
                }
                onBlur={() =>
                  selected.title.trim() &&
                  void patch(selected, { title: selected.title.trim() })
                }
              />
            </label>
            <button
              className="secondary-button"
              onClick={() => void toggle(selected)}
            >
              {selected.done ? "Mark unfinished" : "Mark as done"}
            </button>
            {selected.kind === "todo" ? (
              <>
                <label>
                  Notes
                  <textarea
                    value={selected.notes}
                    onChange={(e) =>
                      setSelected({ ...selected, notes: e.target.value })
                    }
                    onBlur={() =>
                      void patch(selected, { notes: selected.notes })
                    }
                  />
                </label>
                <label>
                  Due date & reminder
                  <input
                    type="datetime-local"
                    value={
                      selected.dueAt
                        ? new Date(
                            Date.parse(selected.dueAt) -
                              new Date(selected.dueAt).getTimezoneOffset() *
                                60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      void patch(selected, {
                        dueAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                  />
                </label>
                <label>
                  Priority
                  <select
                    value={selected.priority}
                    onChange={(e) =>
                      void patch(selected, { priority: Number(e.target.value) })
                    }
                  >
                    <option value={0}>None</option>
                    <option value={1}>Low</option>
                    <option value={2}>Medium</option>
                    <option value={3}>High</option>
                  </select>
                </label>
                {!selected.parentId && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const input = form.elements.namedItem(
                        "subtask",
                      ) as HTMLInputElement;
                      if (input.value.trim())
                        void change((s) =>
                          apply(
                            s,
                            createMutation("todo", {
                              title: input.value.trim(),
                              parentId: selected.id,
                            }),
                          ),
                        ).then(() => form.reset());
                    }}
                  >
                    <label>
                      Add a subtask
                      <input
                        name="subtask"
                        placeholder="One smaller step…"
                        required
                      />
                    </label>
                    <button className="secondary-button">
                      Add subtask <Plus size={16} />
                    </button>
                  </form>
                )}
              </>
            ) : (
              <label>
                Your rating
                <select
                  value={selected.rating ?? ""}
                  onChange={(e) =>
                    void patch(selected, {
                      rating: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Not rated</option>
                  {Array.from({ length: 9 }, (_, i) => 1 + i * 0.5).map((n) => (
                    <option key={n} value={n}>
                      {n} / 5 stars
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="danger-button"
              onClick={() => void remove(selected)}
            >
              <Trash2 size={16} /> Move to trash
            </button>
          </aside>
        </div>
      )}
      {settings && (
        <div className="sheet-scrim" onClick={() => setSettings(false)}>
          <aside className="detail-sheet" onClick={(e) => e.stopPropagation()}>
            <button
              className="sheet-close"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X />
            </button>
            <span className="section-kicker">MAKE IT YOURS</span>
            <h2>Your little space.</h2>
            <label>
              <span>Reminders on this {desktop ? "desktop" : "browser"}</span>
              <input
                type="checkbox"
                checked={reminders}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  if (nativeReminderSettings) {
                    try {
                      await nativeReminderSettings.set(enabled);
                      setReminders(enabled);
                    } catch (e) {
                      setError(String(e));
                    }
                    return;
                  }
                  if (enabled) {
                    if (!("Notification" in window)) {
                      setError("Notifications are not supported here.");
                      return;
                    }
                    const p = await Notification.requestPermission();
                    if (p !== "granted") {
                      setError(
                        "Allow notifications in system/browser settings. Due tasks still appear in your list.",
                      );
                      return;
                    }
                  }
                  setReminders(enabled);
                  localStorage.setItem(
                    "tick-reminders",
                    enabled ? "yes" : "no",
                  );
                }}
              />
            </label>
            <p className="muted">
              {desktop
                ? "Keep the app running in the tray for reminders."
                : "Browser reminders work while this website is open. Your phone handles background reminders."}
            </p>
            <p className="muted">
              Edit history and trash are kept for seven days. Pending offline
              changes stay on this device until synced.
            </p>
            <a
              href="https://github.com/wrestle-R/Task-tick/releases"
              target="_blank"
              rel="noreferrer"
            >
              Downloads & releases <Download size={16} />
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}
