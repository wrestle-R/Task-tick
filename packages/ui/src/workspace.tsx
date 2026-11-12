"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { collectSyncPages } from "@tick/core";
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
  planMove,
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
import { SkeuoButton, SkeuoThemeButton, SkeuoSwitch } from "./skeuo";
import { browserStorage, type Storage } from "./storage";
type Config = { url: string; key: string; api: string };
type Props = {
  storage?: Storage;
  initialConfig?: Config;
  desktop?: boolean;
  onSession?: (session: Session | null) => Promise<void>;
  nativeUpdates?: { check(): Promise<string | null>; install(): Promise<void> };
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
  onSession,
  nativeUpdates,
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
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    if (!nativeUpdates) return;
    let live = true;
    const check = () => {
      void nativeUpdates
        .check()
        .then((v) => {
          if (live) setUpdateVersion(v);
        })
        .catch(() => {});
    };
    check();
    const timer = setInterval(check, 30 * 60 * 1000);
    window.addEventListener("focus", check);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [nativeUpdates]);
  async function installUpdate() {
    if (!nativeUpdates || updating) return;
    setUpdating(true);
    try {
      await queue.current;
      await nativeUpdates.install();
    } catch (e) {
      setError(String(e));
      setUpdating(false);
    }
  }
  const stateRef = useRef(state),
    accountRef = useRef(""),
    queue = useRef(Promise.resolve()),
    syncLock = useRef(false);
  const syncRequested = useRef(false);
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
    void Promise.resolve(storage.activate?.(account || null))
      .then(() => (account && live ? storage.load(account) : null))
      .then((s) => {
        if (live && s) {
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
  useEffect(() => {
    if (!onSession || !authReady || (session && !ready)) return;
    void onSession(session).catch((e) => setError(String(e)));
  }, [onSession, session, authReady, ready]);
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
    if (!session || !config || !ready || !navigator.onLine) return;
    if (syncLock.current) { syncRequested.current = true; return; }
    syncLock.current = true;
    setSyncing(true);
    const account = session.user.id;
    try {
      await queue.current;
      const fresh = await storage.load(account);
      if (account !== accountRef.current) return;
      stateRef.current = fresh;
      setState(fresh);
      const pending = fresh.outbox;
      const { data: auth } = await client!.auth.getSession();
      if (account !== accountRef.current) return;
      if (auth.session && auth.session.user.id !== account) return;
      if (!auth.session)
        throw new Error("Sign in again to sync. Your edits are saved here.");
      const result = await collectSyncPages(
        async (page) => {
          if (account !== accountRef.current)
            throw new Error("Account changed during sync.");
          const response = await fetch(`${config.api}/api/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auth.session!.access_token}`,
            },
            body: JSON.stringify(page),
          });
          const value = await response.json();
          if (!response.ok) throw new Error(value.error ?? "Sync unavailable");
          return value;
        },
        pending,
        fresh.confirmedItems ? fresh.cursor : 0,
        async (page) => {
          if (account !== accountRef.current)
            throw new Error("Account changed during sync.");
          await change((s) =>
            reconcile(
              { ...s, history: page.history },
              page.items,
              page.accepted,
              page.cursor,
            ),
          );
        },
      );
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
      if (syncRequested.current) { syncRequested.current = false; setTimeout(() => void sync(), 0); }
    }
  }, [session, config, ready, client, change]);
  useEffect(() => {
    if (!ready) return;
    void sync();
    // RLS filters account-owned rows. Events only trigger authoritative cursor sync.
    const channel = client && session ? client.channel(`tick-${session.user.id}`)
      .on('postgres_changes', {event:'*',schema:'public',table:'code-todo',filter:`user_id=eq.${session.user.id}`}, () => void sync())
      .on('postgres_changes', {event:'*',schema:'public',table:'movies-todo',filter:`user_id=eq.${session.user.id}`}, () => void sync())
      .subscribe(status => { if(status === 'SUBSCRIBED') void sync(); }) : null;
    const onFocus = () => void sync();
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      if(channel) void client!.removeChannel(channel);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, sync, client, session]);
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
            body: "Open Task-tick to see your unfinished tasks.",
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
      const redirect = desktop
        ? `${config?.api ?? "https://task-tick-beige.vercel.app"}/app`
        : typeof window === "undefined"
          ? ""
          : `${window.location.origin}/app`;
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
    setTitle((current) => (current.trim() === t ? "" : current));
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
  useEffect(() => {
    setTmdb([]);
    if (
      kind !== "movie" ||
      view !== "active" ||
      title.trim().length < 2 ||
      !session ||
      !config ||
      !online
    )
      return;
    const controller = new AbortController();
    const account = session.user.id;
    const timer = setTimeout(async () => {
      setFinding(true);
      try {
        const r = await fetch(
          `${config.api}/api/movies?q=${encodeURIComponent(title.trim())}`,
          {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!controller.signal.aborted && accountRef.current === account)
          setTmdb(d.results);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setFinding(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title, kind, view, session, config, online]);
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
    setTitle("");
    void sync();
  }
  const items = (
    view === "history"
      ? []
      : view === "trash"
        ? [
            ...visible(state, "todo", "trash"),
            ...visible(state, "movie", "trash"),
          ]
        : [...visible(state, kind), ...visible(state, kind, "done")]
  ).filter((i) =>
    i.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const [completedOpen, setCompletedOpen] = useState(true);
  const shownItems = items.filter(
    (i) => view === "trash" || !i.done || completedOpen,
  );
  const active = visible(state, kind).filter((i) => !i.parentId),
    done = visible(state, kind, "done");
  return (
    <div className="tick-shell">
      <header className="tick-topbar">
        <a className="tick-brand" href={desktop ? "#" : "/"}>
          <span className="tick-mark">
            <Check size={20} />
          </span>
          Task-tick
        </a>
        {session && (
          <nav className="top-navigation" aria-label="Lists">
            {(["todo", "movie", "trash"] as const).map((tab) => (
              <button
                key={tab}
                aria-current={
                  (
                    tab === "trash"
                      ? view === "trash"
                      : kind === tab && view !== "trash"
                  )
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  if (tab !== "trash") setKind(tab);
                  setView(tab === "trash" ? "trash" : "active");
                  setSelected(null);
                  setQuery("");
                  setTitle("");
                  setTmdb([]);
                }}
              >
                {tab === "todo" ? (
                  <ListTodo size={17} />
                ) : tab === "movie" ? (
                  <Clapperboard size={17} />
                ) : (
                  <Trash2 size={17} />
                )}
                {tab === "todo"
                  ? "Todos"
                  : tab === "movie"
                    ? "Watchlist"
                    : "Trash"}
              </button>
            ))}
          </nav>
        )}
        <div className="top-actions">
          {updateVersion && (
            <SkeuoButton
              size="sm"
              loading={updating}
              onClick={() => void installUpdate()}
            >
              <Download size={15} /> Update {updateVersion}
            </SkeuoButton>
          )}
          <SkeuoThemeButton
            theme={dark ? "dark" : "light"}
            onThemeChange={(t) => setDark(t === "dark")}
            aria-label="Toggle theme"
          />
          <SkeuoButton
            square
            size="sm"
            aria-label="Settings"
            onClick={() => setSettings(true)}
          >
            <Settings size={18} />
          </SkeuoButton>
        </div>
      </header>
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
              <span className="section-kicker">TASK-TICK</span>
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
                    minLength={authMode === "login" ? 1 : 8}
                    type="password"
                    autoComplete={
                      authMode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              <SkeuoButton
                variant="primary"
                type="submit"
                loading={authBusy}
                disabled={!authReady}
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
              </SkeuoButton>
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
                      ? "Trash"
                      : view === "history"
                        ? "A little rewind."
                        : kind === "todo"
                          ? "Todos"
                          : "Watchlist"}
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
              <div className="search-input">
                <Search size={16} />
                <input
                  aria-label="Search your list"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your list…"
                />
              </div>
              <button
                className="quiet-action"
                onClick={() =>
                  setView(view === "history" ? "active" : "history")
                }
              >
                <History size={15} />{" "}
                {view === "history" ? "Back to list" : "Edit history"}
              </button>
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
                {finding && <small role="status">Finding titles…</small>}
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
                      {m.poster_path && (
                        <img
                          className="movie-poster"
                          src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                          alt=""
                          loading="lazy"
                        />
                      )}
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
                shownItems.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {view !== "trash" &&
                      item.done &&
                      (index === 0 || !shownItems[index - 1].done) && (
                        <button
                          className="completed-heading"
                          aria-expanded={completedOpen}
                          onClick={() => setCompletedOpen(!completedOpen)}
                        >
                          Completed <span>{done.length} ⌄</span>
                        </button>
                      )}
                    <div
                      className={`task-row ${item.done ? "is-done" : ""} ${item.parentId ? "is-child" : ""}`}
                      key={item.id}
                      draggable={view === "active" && !item.done}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", item.id)
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const movedId = e.dataTransfer.getData("text/plain");
                        void change((current) =>
                          planMove(
                            visible(current, kind, "active"),
                            movedId,
                            item.id,
                          ).reduce(
                            (next, move) =>
                              apply(
                                next,
                                createMutation(
                                  kind,
                                  { position: move.position },
                                  move.itemId,
                                ),
                              ),
                            current,
                          ),
                        ).then(() => sync());
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
                      {item.kind === "movie" && item.poster && (
                        <img
                          className="movie-poster"
                          src={`https://image.tmdb.org/t/p/w92${item.poster}`}
                          alt=""
                          loading="lazy"
                        />
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
                  </React.Fragment>
                ))
              )}
              {view === "active" && !completedOpen && done.length > 0 && (
                <button
                  className="completed-heading"
                  aria-expanded={false}
                  onClick={() => setCompletedOpen(true)}
                >
                  Completed <span>{done.length} ›</span>
                </button>
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
            <h2>Settings</h2>
            {session && <p className="muted">{session.user.email}</p>}
            <SkeuoThemeButton
              theme={dark ? "dark" : "light"}
              onThemeChange={(t) => setDark(t === "dark")}
            />
            {session && (
              <SkeuoButton onClick={() => void signout()}>
                <LogOut size={16} /> Sign out
              </SkeuoButton>
            )}
            <label>
              <span>Reminders on this {desktop ? "desktop" : "browser"}</span>
              <SkeuoSwitch
                aria-label="Reminders"
                checked={reminders}
                onCheckedChange={async (enabled) => {
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
