import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  SectionList,
  Image,
  Linking,
  Modal,
  NativeModules,
  PanResponder,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Item, Kind, State, Fields } from '../packages/core/src/index';
import { compareItems, planMove, syncStatus } from '../packages/core/src/index';
import { themes, themeGeometry } from '../packages/core/src/theme';
const TextTone = createContext<string>(themes.light.ink);
const Text = (props: React.ComponentProps<typeof NativeText>) => {
  const color = useContext(TextTone);
  return (
    <NativeText
      {...props}
      style={[{ fontFamily: 'DMSans', color }, props.style]}
    />
  );
};
const TextInput = (props: React.ComponentProps<typeof NativeTextInput>) => {
  const color = useContext(TextTone);
  return (
    <NativeTextInput
      {...props}
      style={[{ fontFamily: 'DMSans', color }, props.style]}
    />
  );
};
type Snapshot = {
  state: State;
  account: string | null;
  email: string | null;
  backend: string;
  preciseAlarms: boolean;
  online: boolean;
  lastSyncAt: number;
  syncError: string;
  appearance: 'system' | 'light' | 'dark';
};
const native = NativeModules.TickStore;
const blank: Snapshot = {
  state: { items: [], outbox: [], history: [], cursor: 0 },
  account: null,
  email: null,
  backend: '',
  preciseAlarms: false,
  online: false,
  lastSyncAt: 0,
  syncError: '',
  appearance: native?.appearance ?? 'system',
};
export default function App() {
  return (
    <SafeAreaProvider>
      <TickApp />
    </SafeAreaProvider>
  );
}
function TickApp() {
  const systemDark = useColorScheme() === 'dark';
  const [snap, setSnap] = useState(blank);
  const [loaded, setLoaded] = useState(false);
  const dark =
    snap.appearance === 'dark' || (snap.appearance === 'system' && systemDark);
  const palette = themes[dark ? 'dark' : 'light'];
  const c = { ...palette, bg: palette.paper };
  const s = makeStyles(palette);
  const [kind, setKind] = useState<Kind>('todo'),
    [view, setView] = useState<'active' | 'done' | 'trash' | 'history'>(
      'active',
    ),
    [title, setTitle] = useState(''),
    [selected, setSelected] = useState<Item | null>(null),
    [settings, setSettings] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [authMode, setAuthMode] = useState('login'),
    [busy, setBusy] = useState(false),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState(''),
    [results, setResults] = useState<any[]>([]),
    [undo, setUndo] = useState<any>(null),
    [subtask, setSubtask] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState<string | null>(null);
  const [editorNotes, setEditorNotes] = useState<string | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const addingSubtask = useRef(false);
  const [availableUpdate, setAvailableUpdate] = useState<any>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const value = await native.checkUpdate();
        if (live) setAvailableUpdate(value ? JSON.parse(value) : null);
      } catch {}
    };
    if (!loaded) return;
    void check();
    const timer = setInterval(() => void check(), 30 * 60 * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [loaded]);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [composing, setComposing] = useState(false);
  const searchGeneration = useRef(0);
  useEffect(() => {
    const generation = ++searchGeneration.current;
    setResults([]);
    setSearchError('');
    if (
      kind !== 'movie' ||
      !composing ||
      title.trim().length < 2 ||
      !snap.account
    )
      return;
    const account = snap.account;
    const timer = setTimeout(async () => {
      try {
        const value = JSON.parse(await native.search(title.trim(), account));
        if (searchGeneration.current === generation && account === snap.account)
          setResults(value.results);
      } catch (e) {
        if (searchGeneration.current === generation)
          setSearchError((e as Error).message || 'Movie search unavailable.');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      searchGeneration.current++;
    };
  }, [title, kind, composing, snap.account, searchAttempt]);
  const pendingLink = useRef<string | null>(null);
  async function refresh(lifecycle = false) {
    try {
      const value = JSON.parse(
        await (lifecycle ? native.resume() : native.snapshot()),
      );
      setSnap(value);
      setLoaded(true);
      const u = value.state.undo;
      setUndo(u && u.until > Date.now() ? u : null);
      if (pendingLink.current) {
        const link = pendingLink.current;
        setKind(link.includes('/movie') ? 'movie' : 'todo');
        setView('active');
        setSettings(false);
        const id = link.match(/[?&]item=([^&]+)/)?.[1];
        const item = id
          ? value.state.items.find((i: Item) => i.id === id)
          : null;
        resetEditor();
        setSelected(item ?? null);
        pendingLink.current = null;
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sync() {
    setSyncing(true);
    try {
      setSnap(JSON.parse(await native.sync()));
    } catch {
      setSnap(JSON.parse(await native.snapshot()));
    } finally {
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!native) {
      setError('Native storage module unavailable. Rebuild the Android app.');
      return;
    }
    void refresh(true);
    Linking.getInitialURL().then(url => {
      if (url) {
        pendingLink.current = url;
        void refresh();
      }
    });
    const link = Linking.addEventListener('url', e => {
      pendingLink.current = e.url;
      void refresh();
    });
    const active = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refresh(true);
        void sync();
      }
    });
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      clearInterval(timer);
      link.remove();
      active.remove();
    };
  }, []);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.until - Date.now()),
    );
    return () => clearTimeout(t);
  }, [undo]);
  async function mutate(
    k: Kind,
    patch: Partial<Fields>,
    id?: string,
    action = 'patch',
  ) {
    try {
      const value = JSON.parse(
        await native.mutate(
          JSON.stringify({
            kind: k,
            id,
            action,
            patch,
            expectedAccount: snap.account,
          }),
        ),
      );
      setSnap(value);
      setUndo(value.state.undo ?? null);
      setError('');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  async function add() {
    if (!title.trim()) return;
    const name = title.trim();
    const exists =
      kind === 'movie' &&
      snap.state.items.some(
        i =>
          i.kind === 'movie' &&
          !i.deletedAt &&
          i.title.toLowerCase() === name.toLowerCase(),
      );
    const save = async () => {
      if (await mutate(kind, { title: name })) {
        setTitle(current => (current.trim() === name ? '' : current));
        setComposing(false);
      }
    };
    if (exists)
      Alert.alert(
        'Already on your list?',
        'A similar title exists. Add a separate entry?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: () => void save() },
        ],
      );
    else await save();
  }
  async function auth() {
    setBusy(true);
    try {
      const result = await native.authenticate(
        authMode,
        email.trim(),
        password,
        'https://task-tick-beige.vercel.app',
      );
      setPassword('');
      await refresh();
      if (result !== 'Signed in') Alert.alert('Check your email', result);
      else {
        if (Number(Platform.Version) >= 33)
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
        void sync();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    const finish = async () => {
      await native.logout();
      setSnap({ ...blank, appearance: snap.appearance });
      setSettings(false);
      setSelected(null);
      setUndo(null);
    };
    if (snap.state.outbox.length)
      Alert.alert(
        'Some edits haven’t synced',
        `Keep ${snap.state.outbox.length} pending changes for your next sign-in? Other accounts won’t see them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Keep edits & sign out', onPress: () => void finish() },
        ],
      );
    else await finish();
  }
  async function patch(p: Partial<Fields>) {
    if (selected) {
      const saved = await mutate(selected.kind, p, selected.id);
      setEditorError(saved ? '' : 'Could not update this item. Try again.');
    }
  }
  function resetEditor() {
    setNotesOpen(false);
    setEditorTitle(null);
    setEditorNotes(null);
    setSubtask('');
    setEditorError('');
  }
  function openEditor(item: Item) {
    resetEditor();
    setSelected(item);
  }
  const currentItem = selected
    ? snap.state.items.find(item => item.id === selected.id && !item.deletedAt)
    : undefined;
  const children = selected
    ? snap.state.items
        .filter(item => item.parentId === selected.id && !item.deletedAt)
        .sort(compareItems)
    : [];
  async function closeEditor() {
    if (!selected || savingEditor || addingSubtask.current) return;
    const changes: Partial<Fields> = {};
    if (editorTitle !== null && editorTitle.trim() !== currentItem?.title)
      changes.title = editorTitle.trim();
    if (editorNotes !== null && editorNotes !== currentItem?.notes)
      changes.notes = editorNotes;
    if (changes.title === '') {
      setEditorError('Enter a title.');
      return;
    }
    setSavingEditor(true);
    try {
      if (
        Object.keys(changes).length &&
        !(await mutate(selected.kind, changes, selected.id))
      ) {
        setEditorError('Could not save. Your edits are still here.');
        return;
      }
      if (subtask.trim() && !selected.parentId && !(await addSubtask())) return;
      setSelected(null);
      resetEditor();
    } finally {
      setSavingEditor(false);
    }
  }
  async function addSubtask() {
    const name = subtask.trim();
    if (!selected || !name || addingSubtask.current) return false;
    addingSubtask.current = true;
    try {
      const saved = await mutate('todo', {
        title: name,
        parentId: selected.id,
      });
      if (saved) setSubtask(value => (value.trim() === name ? '' : value));
      setEditorError(saved ? '' : 'Could not add the subtask. Try again.');
      return saved;
    } finally {
      addingSubtask.current = false;
    }
  }
  async function addResult(movie: any) {
    const existing = snap.state.items.find(
      i =>
        i.kind === 'movie' &&
        !i.deletedAt &&
        i.tmdbId === movie.id &&
        i.mediaType === movie.media_type,
    );
    if (existing) {
      openEditor(existing);
      setResults([]);
      return;
    }
    if (
      !(await mutate('movie', {
        title: movie.title ?? movie.name,
        tmdbId: movie.id,
        mediaType: movie.media_type,
        poster: movie.poster_path,
      }))
    )
      return;
    setResults([]);
    setTitle('');
    setComposing(false);
  }
  const childCounts = new Map<string, number>();
  for (const item of snap.state.items) {
    if (item.parentId && !item.deletedAt)
      childCounts.set(item.parentId, (childCounts.get(item.parentId) ?? 0) + 1);
  }
  const all = snap.state.items.filter(i => i.kind === kind && !i.parentId);
  const activeItems = all
    .filter(i => !i.deletedAt && !i.done)
    .sort(compareItems);
  const completedItems = all
    .filter(i => !i.deletedAt && i.done)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const items =
    view === 'trash'
      ? snap.state.items
          .filter(
            i =>
              i.deletedAt &&
              Date.parse(i.deletedAt) > Date.now() - 7 * 86400000,
          )
          .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!))
      : activeItems;
  const sections =
    view === 'trash'
      ? [{ title: 'Deleted recently', data: items }]
      : [
          { title: '', data: activeItems },
          ...(completedItems.length
            ? [
                {
                  title: kind === 'todo' ? 'Completed' : 'Watched',
                  data: completedOpen ? completedItems : [],
                },
              ]
            : []),
        ];
  function reorder(index: number, delta: number) {
    if (view !== 'active') return;
    const target = Math.max(0, Math.min(items.length - 1, index + delta));
    if (index === target) return;
    const reordered = items.filter((_, i) => i !== index);
    reordered.splice(target, 0, items[index]);
    const moves = planMove(
      items,
      items[index].id,
      reordered[target + 1]?.id ?? null,
    );
    void (async () => {
      try {
        const value = JSON.parse(
          await native.reorder(
            JSON.stringify({ kind, moves, expectedAccount: snap.account }),
          ),
        );
        setSnap(value);
        setError('');
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }
  const label = (text: string) => (
    <Text style={[s.label, { color: c.muted }]}>{text}</Text>
  );
  const inputStyle = [s.input, { borderColor: c.line, color: c.ink }];
  return (
    <TextTone.Provider value={c.ink}>
      <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
        <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
        <View style={s.header}>
          <Text style={[s.brand, { color: c.ink }]}>
            <Text style={s.logo}>✓</Text> Task-tick
          </Text>
          {availableUpdate && (
            <Pressable
              disabled={installingUpdate}
              accessibilityRole="button"
              accessibilityLabel="Install update"
              onPress={async () => {
                setInstallingUpdate(true);
                try {
                  Alert.alert('Task-tick update', await native.installUpdate());
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setInstallingUpdate(false);
                }
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: c.accentInk,
                  backgroundColor: c.accent,
                  padding: 9,
                  borderRadius: 8,
                }}
              >
                {installingUpdate
                  ? 'Downloading…'
                  : `Update ${availableUpdate.version}`}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="Settings"
            onPress={() => setSettings(true)}
          >
            <Text style={{ fontSize: 28, color: c.muted }}>☷</Text>
          </Pressable>
        </View>
        {!loaded ? (
          <View style={s.empty}>
            {error ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void refresh(true)}
              >
                <Text style={{ color: c.muted }}>Try again</Text>
              </Pressable>
            ) : (
              <ActivityIndicator
                accessibilityLabel="Opening Task-tick"
                color={c.accent}
              />
            )}
          </View>
        ) : !snap.account ? (
          <ScrollView contentContainerStyle={s.auth}>
            <Text style={[s.eyebrow, { color: c.muted }]}>
              A LITTLE LESS ON YOUR MIND
            </Text>
            <Text style={[s.authTitle, { color: c.ink }]}>
              A clearer head.{'\n'}
              <Text style={{ color: '#8D9F67' }}>A shorter list.</Text>
            </Text>
            <Text style={[s.description, { color: c.muted }]}>
              Your todos. Your watchlist. A little space for both.
            </Text>
            {label('EMAIL')}
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={c.muted}
            />
            {authMode !== 'reset' && (
              <>
                {label('PASSWORD')}
                <TextInput
                  style={inputStyle}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  placeholder={
                    authMode === 'login'
                      ? 'Your password'
                      : 'At least 8 characters'
                  }
                  placeholderTextColor={c.muted}
                />
              </>
            )}
            <Pressable
              disabled={
                busy ||
                !email ||
                (authMode === 'login'
                  ? password.length === 0
                  : authMode !== 'reset' && password.length < 8)
              }
              style={s.primary}
              onPress={() => void auth()}
            >
              <Text style={s.primaryText}>
                {busy
                  ? 'One moment…'
                  : authMode === 'signup'
                    ? 'Create account'
                    : authMode === 'reset'
                      ? 'Send reset link'
                      : 'Sign in'}{' '}
                ↗
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setAuthMode(authMode === 'signup' ? 'login' : 'signup')
              }
            >
              <Text style={[s.link, { color: c.muted }]}>
                {authMode === 'signup'
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setAuthMode('reset')}>
              <Text style={[s.link, { color: c.muted }]}>Forgot password?</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <>
            <View style={s.listHeading}>
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={s.listTitle}>
                  {view === 'trash'
                    ? 'Trash'
                    : kind === 'todo'
                      ? 'Todos'
                      : 'Watchlist'}
                </Text>
                {view !== 'trash' && (
                  <Text style={{ color: c.muted }}>
                    {activeItems.length} left
                  </Text>
                )}
              </View>
              {view === 'active' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    composing ? 'Close quick add' : 'Add item'
                  }
                  onPress={() => setComposing(!composing)}
                  style={s.addAction}
                >
                  <Text style={{ fontSize: 23, color: c.accentInk }}>
                    {composing ? '×' : '+'}
                  </Text>
                </Pressable>
              )}
            </View>
            {view === 'trash' && (
              <Text
                style={[
                  s.description,
                  { paddingHorizontal: 22, marginBottom: 14 },
                ]}
              >
                Todos and titles stay here for seven days.
              </Text>
            )}
            {view === 'active' && composing && (
              <View
                style={[
                  s.capture,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
              >
                <Text style={{ color: c.muted, fontSize: 25 }}>＋</Text>
                <TextInput
                  style={[s.captureInput, { color: c.ink }]}
                  placeholder={
                    kind === 'todo'
                      ? 'What’s on your mind?'
                      : 'Add a movie or TV title…'
                  }
                  placeholderTextColor={c.muted}
                  autoFocus
                  value={title}
                  onChangeText={setTitle}
                  onSubmitEditing={() => void add()}
                />
                <Pressable
                  accessibilityLabel="Add item"
                  onPress={() => void add()}
                >
                  <Text style={s.addButton}>Add</Text>
                </Pressable>
              </View>
            )}
            {composing && searchError !== '' && (
              <Pressable
                accessibilityRole="button"
                style={s.error}
                onPress={() => setSearchAttempt(n => n + 1)}
              >
                <Text style={{ color: c.error }}>
                  {searchError} Tap to retry, or add the title manually.
                </Text>
              </Pressable>
            )}
            {results.length > 0 ? (
              <FlatList
                data={results.filter(
                  r => r.media_type === 'movie' || r.media_type === 'tv',
                )}
                keyExtractor={i => `${i.media_type}:${i.id}`}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => void addResult(item)}
                    style={[s.result, { borderColor: c.line }]}
                  >
                    {item.poster_path && (
                      <Image
                        source={{
                          uri: `https://image.tmdb.org/t/p/w92${item.poster_path}`,
                        }}
                        style={s.poster}
                      />
                    )}
                    <Text style={[s.itemTitle, { color: c.ink }]}>
                      {item.title ?? item.name}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 12 }}>
                      {item.media_type === 'tv' ? 'TV series' : 'Film'} · Add ＋
                    </Text>
                  </Pressable>
                )}
              />
            ) : view === 'history' ? (
              <FlatList
                data={snap.state.history
                  .filter(
                    h =>
                      h.item.kind === kind &&
                      Date.parse(h.at) > Date.now() - 7 * 86400000,
                  )
                  .slice()
                  .reverse()}
                keyExtractor={i => i.id}
                renderItem={({ item: h }) => (
                  <View style={[s.result, { borderColor: c.line }]}>
                    <Text style={[s.itemTitle, { color: c.ink }]}>
                      {h.item.title}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 11 }}>
                      {new Date(h.at).toLocaleString()}
                    </Text>
                    <Pressable
                      onPress={() =>
                        void mutate(
                          h.item.kind,
                          {
                            title: h.item.title,
                            notes: h.item.notes,
                            done: h.item.done,
                            priority: h.item.priority,
                            dueAt: h.item.dueAt,
                            rating: h.item.rating,
                          },
                          h.item.id,
                          'restore',
                        )
                      }
                    >
                      <Text style={s.link}>Recover ↗</Text>
                    </Pressable>
                  </View>
                )}
              />
            ) : (
              <SectionList
                sections={sections}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) =>
                  section.title ? (
                    <Pressable
                      style={s.completedHeader}
                      onPress={() => setCompletedOpen(!completedOpen)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: completedOpen }}
                    >
                      <Text style={{ color: c.muted, fontWeight: '600' }}>
                        {section.title}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: 12 }}>
                        {view === 'trash'
                          ? items.length
                          : completedItems.length}{' '}
                        {completedOpen ? '⌄' : '›'}
                      </Text>
                    </Pressable>
                  ) : null
                }
                style={s.root}
                contentContainerStyle={{
                  paddingHorizontal: 22,
                  paddingTop: 12,
                  paddingBottom: 18,
                  flexGrow: 1,
                }}
                keyExtractor={i => i.id}
                ListHeaderComponent={
                  items.length === 0 &&
                  (view === 'trash' || completedItems.length === 0) ? (
                    <View style={s.empty}>
                      <Text style={{ fontSize: 38, color: '#8D9F67' }}>✓</Text>
                      <Text style={[s.emptyTitle, { color: c.ink }]}>
                        A little breathing room.
                      </Text>
                      <Text style={[s.description, { color: c.muted }]}>
                        Your list is ready when you are.
                      </Text>
                    </View>
                  ) : undefined
                }
                renderItem={({ item, index }) => (
                  <TaskRow
                    colors={c}
                    item={item}
                    trash={view === 'trash'}
                    onToggle={() => {
                      if (view === 'trash')
                        void mutate(item.kind, {}, item.id, 'restore');
                      else
                        void mutate(item.kind, { done: !item.done }, item.id);
                    }}
                    onOpen={() => openEditor(item)}
                    childCount={childCounts.get(item.id) ?? 0}
                    onMove={delta => reorder(index, delta)}
                    draggable={view === 'active' && !item.done}
                  />
                )}
              />
            )}
            <View style={[s.footer, { borderColor: c.line }]}>
              <Text style={{ color: c.muted, fontSize: 10 }}>
                ● Saved on this device
              </Text>
              <Pressable onPress={() => void sync()}>
                <Text style={{ color: c.muted, fontSize: 10 }}>
                  {syncStatus({
                    online: snap.online,
                    pending: snap.state.outbox.length,
                    syncing,
                    lastSyncAt: snap.lastSyncAt,
                    error: snap.syncError,
                  })}{' '}
                  ↗
                </Text>
              </Pressable>
            </View>
            <View style={s.navigation} accessibilityRole="tablist">
              {(['todo', 'movie', 'trash'] as const).map(tab => {
                const chosen =
                  tab === 'trash'
                    ? view === 'trash'
                    : kind === tab && view !== 'trash';
                return (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: chosen }}
                    style={s.destination}
                    onPress={() => {
                      if (tab !== 'trash') setKind(tab);
                      setView(tab === 'trash' ? 'trash' : 'active');
                      setResults([]);
                      setComposing(false);
                      setTitle('');
                    }}
                  >
                    <Text
                      style={[
                        s.destinationIcon,
                        chosen && s.destinationSelected,
                      ]}
                    >
                      {tab === 'todo' ? '☑' : tab === 'movie' ? '▷' : '⌫'}
                    </Text>
                    <Text
                      style={{
                        color: chosen ? c.ink : c.muted,
                        fontSize: 11,
                        fontWeight: chosen ? '700' : '500',
                      }}
                    >
                      {tab === 'todo'
                        ? 'Todos'
                        : tab === 'movie'
                          ? 'Watchlist'
                          : 'Trash'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        {(error || snap.syncError) !== '' && (
          <Pressable style={s.error} onPress={() => setError('')}>
            <Text style={{ color: c.error, fontSize: 12, lineHeight: 18 }}>
              {error || snap.syncError} ×
            </Text>
          </Pressable>
        )}
        {undo && (
          <View style={s.undo}>
            <Text style={{ color: '#F4F7EB' }}>Taken care of.</Text>
            <Pressable onPress={() => void mutate(kind, {}, undefined, 'undo')}>
              <Text style={{ color: '#D8ED96', fontWeight: '600' }}>Undo</Text>
            </Pressable>
          </View>
        )}
        <Modal
          visible={selected !== null}
          animationType="slide"
          onRequestClose={() => void closeEditor()}
        >
          <SafeAreaProvider>
            <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
              <View style={s.sheetHeader}>
                <Text style={[s.eyebrow, { color: c.muted }]}>
                  {selected?.kind === 'movie'
                    ? 'Watchlist item'
                    : 'Task details'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Done editing"
                  hitSlop={12}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={savingEditor}
                  onPress={() => void closeEditor()}
                >
                  <Text style={s.addButton}>Done</Text>
                </Pressable>
              </View>
              {selected && (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.sheet}
                >
                  <TextInput
                    accessibilityLabel="Title"
                    style={[...inputStyle, s.editorTitle]}
                    value={editorTitle ?? currentItem?.title ?? selected.title}
                    onChangeText={setEditorTitle}
                    maxLength={500}
                    multiline
                  />
                  {editorError !== '' && (
                    <Text style={{ color: c.error }}>{editorError}</Text>
                  )}
                  <Pressable
                    style={s.editorAction}
                    onPress={() =>
                      void patch({ done: !(currentItem ?? selected).done })
                    }
                  >
                    <Text style={{ color: c.ink }}>
                      {(currentItem ?? selected).done
                        ? '✓  Mark unfinished'
                        : '○  Mark complete'}
                    </Text>
                  </Pressable>
                  {selected.kind === 'todo' ? (
                    <>
                      {!selected.parentId && (
                        <>
                          {label(
                            children.length
                              ? `Subtasks · ${children.filter(i => i.done).length}/${children.length}`
                              : 'Subtasks',
                          )}
                          {children.map(item => (
                            <View key={item.id} style={s.subtaskRow}>
                              <Pressable
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: item.done }}
                                onPress={() =>
                                  void mutate(
                                    'todo',
                                    { done: !item.done },
                                    item.id,
                                  )
                                }
                                style={s.subtaskToggle}
                              >
                                <Text style={{ color: c.muted }}>
                                  {item.done ? '✓' : '○'}
                                </Text>
                                <Text
                                  style={{
                                    flex: 1,
                                    textDecorationLine: item.done
                                      ? 'line-through'
                                      : 'none',
                                  }}
                                >
                                  {item.title}
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Move ${item.title} to trash`}
                                onPress={() =>
                                  void mutate('todo', {}, item.id, 'delete')
                                }
                                hitSlop={8}
                              >
                                <Text style={{ color: c.muted }}>×</Text>
                              </Pressable>
                            </View>
                          ))}
                          <View style={s.subtaskRow}>
                            <TextInput
                              accessibilityLabel="New subtask"
                              style={[...inputStyle, { flex: 1 }]}
                              placeholder="Add a subtask"
                              placeholderTextColor={c.muted}
                              value={subtask}
                              maxLength={500}
                              onChangeText={setSubtask}
                              onSubmitEditing={() => void addSubtask()}
                            />
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Add subtask"
                              disabled={!subtask.trim()}
                              onPress={() => void addSubtask()}
                              style={{ opacity: subtask.trim() ? 1 : 0.5 }}
                            >
                              <Text style={s.addButton}>Add</Text>
                            </Pressable>
                          </View>
                        </>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: notesOpen }}
                        onPress={() => setNotesOpen(!notesOpen)}
                        style={s.notesToggle}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600' }}>Notes</Text>
                          {!notesOpen && (
                            <Text numberOfLines={1} style={{ color: c.muted }}>
                              {(
                                editorNotes ??
                                currentItem?.notes ??
                                selected.notes
                              ).trim() || 'Add a note'}
                            </Text>
                          )}
                        </View>
                        <Text style={{ color: c.muted }}>
                          {notesOpen ? '⌃' : '⌄'}
                        </Text>
                      </Pressable>
                      {notesOpen && (
                        <TextInput
                          accessibilityLabel="Task notes"
                          multiline
                          scrollEnabled
                          maxLength={20000}
                          style={[
                            ...inputStyle,
                            { height: 180, textAlignVertical: 'top' },
                          ]}
                          value={
                            editorNotes ?? currentItem?.notes ?? selected.notes
                          }
                          onChangeText={setEditorNotes}
                        />
                      )}
                      {label('Due date and reminder')}
                      <Pressable
                        style={[s.input, { borderColor: c.line }]}
                        onPress={async () => {
                          try {
                            const due = await native.pickDueDate();
                            if (due) void patch({ dueAt: due });
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        <Text style={{ color: c.ink }}>
                          {(currentItem ?? selected).dueAt
                            ? new Date(
                                (currentItem ?? selected).dueAt!,
                              ).toLocaleString()
                            : 'Choose a date & time ↗'}
                        </Text>
                      </Pressable>
                      {(currentItem ?? selected).dueAt && (
                        <Pressable onPress={() => void patch({ dueAt: null })}>
                          <Text style={s.link}>Remove reminder</Text>
                        </Pressable>
                      )}
                      {label('Priority')}
                      <View style={s.modes}>
                        {['None', 'Low', 'Medium', 'High'].map((v, n) => (
                          <Pressable
                            key={v}
                            style={[
                              s.mode,
                              (currentItem ?? selected).priority === n &&
                                s.modeActive,
                            ]}
                            onPress={() => void patch({ priority: n })}
                          >
                            <Text
                              style={{
                                color:
                                  (currentItem ?? selected).priority === n
                                    ? c.accentInk
                                    : c.muted,
                                fontSize: 12,
                              }}
                            >
                              {v}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : (
                    <>
                      {label('Your rating')}
                      <View style={s.ratingOptions}>
                        {[null, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => (
                          <Pressable
                            key={String(n)}
                            style={[
                              s.mode,
                              (currentItem ?? selected).rating === n &&
                                s.modeActive,
                            ]}
                            onPress={() => void patch({ rating: n })}
                          >
                            <Text style={{ color: c.ink }}>
                              {n ?? 'Unrated'}
                              {n ? ' ★' : ''}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                  <Pressable
                    onPress={async () => {
                      await mutate(selected.kind, {}, selected.id, 'delete');
                      setSelected(null);
                    }}
                  >
                    <Text
                      style={{ color: '#A7675B', marginTop: 36, fontSize: 13 }}
                    >
                      Move to trash
                    </Text>
                  </Pressable>
                </ScrollView>
              )}
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
        <Modal
          visible={settings}
          animationType="slide"
          onRequestClose={() => setSettings(false)}
        >
          <SafeAreaProvider>
            <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
              <View style={s.sheetHeader}>
                <Text style={[s.eyebrow, { color: c.muted }]}>
                  MAKE IT YOURS
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close settings"
                  hitSlop={12}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onPress={() => setSettings(false)}
                >
                  <Text style={{ fontSize: 24, color: c.ink }}>×</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={s.sheet}>
                <Text style={[s.title, { color: c.ink }]}>
                  Your little space.
                </Text>
                <Text style={[s.description, { color: c.muted }]}>
                  {snap.email ?? 'Sign in to keep everything together.'}
                </Text>
                {label('APPEARANCE')}
                <View
                  accessibilityRole="radiogroup"
                  style={{ flexDirection: 'row', gap: 10, marginBottom: 26 }}
                >
                  {(['system', 'light', 'dark'] as const).map(mode => (
                    <Pressable
                      key={mode}
                      accessibilityRole="radio"
                      accessibilityLabel={`${mode[0].toUpperCase() + mode.slice(1)} appearance`}
                      accessibilityState={{ checked: snap.appearance === mode }}
                      style={{
                        paddingVertical: 13,
                        paddingHorizontal: 18,
                        borderRadius: themeGeometry.controlRadius,
                        backgroundColor:
                          snap.appearance === mode ? c.accent : c.surface,
                        borderWidth: 1,
                        borderColor: c.line,
                      }}
                      onPress={async () => {
                        try {
                          setSnap(JSON.parse(await native.setAppearance(mode)));
                          setError('');
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Text
                        style={{
                          color: snap.appearance === mode ? c.accentInk : c.ink,
                        }}
                      >
                        {mode[0].toUpperCase() + mode.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {snap.account && (
                  <Pressable
                    onPress={() => {
                      setView('history');
                      setSettings(false);
                    }}
                  >
                    <Text style={[s.link, { color: c.ink, marginBottom: 20 }]}>
                      Edit history · last 7 days ↗
                    </Text>
                  </Pressable>
                )}
                {label('REMINDER HEALTH')}
                <Text style={[s.description, { color: c.muted }]}>
                  {snap.preciseAlarms
                    ? 'Precise alarm access is available.'
                    : 'Reminders can be delayed without precise alarm access. Due tasks remain in your list.'}
                </Text>
                <Pressable
                  style={s.primary}
                  onPress={() => native.requestExactAlarms()}
                >
                  <Text style={s.primaryText}>
                    Alarm permission settings ↗
                  </Text>
                </Pressable>
                <Text
                  style={[s.description, { color: c.muted, marginTop: 22 }]}
                >
                  Edit history and trash last seven days. Offline changes stay
                  until synced. Force-stopping the app can pause widgets and
                  reminders until you open it again.
                </Text>
                <Pressable
                  onPress={() =>
                    Linking.openURL(
                      'https://github.com/wrestle-R/Task-tick/releases',
                    )
                  }
                >
                  <Text style={[s.link, { color: c.ink, marginTop: 32 }]}>
                    Downloads & releases ↗
                  </Text>
                </Pressable>
                {snap.account && (
                  <Pressable onPress={() => void logout()}>
                    <Text style={[s.link, { color: c.error, marginTop: 35 }]}>
                      Sign out
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      </SafeAreaView>
    </TextTone.Provider>
  );
}
function TaskRow({
  colors,
  item,
  onToggle,
  onOpen,
  onMove,
  draggable,
  trash,
  childCount,
}: {
  colors: any;
  item: Item;
  onToggle: () => void;
  onOpen: () => void;
  onMove: (dy: number) => void;
  draggable: boolean;
  trash: boolean;
  childCount: number;
}) {
  const dy = useRef(new Animated.Value(0)).current;
  const s = makeStyles(colors);
  const palette = colors;
  const rowHeight = useRef(58);
  const move = useRef(onMove);
  move.current = onMove;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => dy.setValue(g.dy),
      onPanResponderRelease: (_, g) => {
        move.current(Math.round(g.dy / rowHeight.current));
        dy.setValue(0);
      },
      onPanResponderTerminate: () => dy.setValue(0),
    }),
  ).current;
  return (
    <Animated.View
      onLayout={event => {
        rowHeight.current = event.nativeEvent.layout.height;
      }}
      style={[
        s.row,
        {
          borderBottomColor: colors.line,
          transform: [{ translateY: dy }],
          marginLeft: item.parentId ? 24 : 0,
        },
      ]}
    >
      <Pressable
        accessibilityLabel={
          trash
            ? 'Restore item'
            : item.done
              ? 'Mark unfinished'
              : 'Complete item'
        }
        onPress={onToggle}
        hitSlop={10}
        accessibilityRole={trash ? 'button' : 'checkbox'}
        accessibilityState={trash ? undefined : { checked: item.done }}
        style={[
          s.check,
          { borderColor: colors.muted },
          item.done && {
            backgroundColor: palette.accent,
            borderColor: palette.accent,
          },
        ]}
      >
        <Text style={{ color: palette.accentInk }}>
          {trash ? '↶' : item.done ? '✓' : ''}
        </Text>
      </Pressable>
      {item.kind === 'movie' && item.poster && (
        <Image
          source={{ uri: `https://image.tmdb.org/t/p/w92${item.poster}` }}
          style={s.poster}
        />
      )}
      <Pressable onPress={onOpen} style={{ flex: 1 }}>
        <Text
          numberOfLines={2}
          style={[
            s.itemTitle,
            { color: colors.ink },
            item.done && {
              textDecorationLine: 'line-through',
              color: colors.muted,
            },
          ]}
        >
          {item.title}
        </Text>
        {(childCount > 0 || Boolean(item.notes.trim())) && (
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, marginTop: 3, color: colors.muted }}
          >
            {[
              childCount
                ? `${childCount} ${childCount === 1 ? 'subtask' : 'subtasks'}`
                : '',
              item.notes.trim() ? 'Notes' : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
        {item.dueAt && (
          <Text
            style={{
              color:
                Date.parse(item.dueAt) < Date.now() ? '#A7675B' : colors.muted,
              fontSize: 10,
              marginTop: 6,
            }}
          >
            {new Date(item.dueAt).toLocaleString()}
          </Text>
        )}
        {item.mediaType && (
          <Text style={{ fontSize: 9, color: colors.muted, marginTop: 5 }}>
            {item.mediaType === 'tv' ? 'TV SERIES' : 'FILM'}
          </Text>
        )}
      </Pressable>
      {item.rating && (
        <Text style={{ fontSize: 11, color: '#A68E54' }}>★ {item.rating}</Text>
      )}
      {item.priority > 0 && (
        <Text style={{ fontSize: 9, color: '#A0864D' }}>
          {['', 'Low', 'Medium', 'High'][item.priority]}
        </Text>
      )}
      {draggable && (
        <View
          {...pan.panHandlers}
          style={{ padding: 14 }}
          accessibilityLabel="Drag to reorder"
        >
          <Text style={{ fontSize: 18, color: colors.muted }}>⠿</Text>
        </View>
      )}
    </Animated.View>
  );
}
const makeStyles = (palette: typeof themes.light | typeof themes.dark) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      paddingHorizontal: 25,
      paddingTop: 12,
      paddingBottom: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brand: {
      fontFamily: 'Manrope',
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -1,
    },
    logo: { color: '#8D9F67', fontSize: 27 },
    auth: { padding: 28, paddingTop: 40, paddingBottom: 80 },
    eyebrow: { fontSize: 9, letterSpacing: 2, fontWeight: '600' },
    authTitle: {
      fontFamily: 'Manrope',
      fontSize: 46,
      fontWeight: '600',
      letterSpacing: -2.5,
      lineHeight: 53,
      marginTop: 20,
    },
    description: { fontSize: 12, lineHeight: 21, marginTop: 12 },
    label: { fontSize: 13, fontWeight: '600', marginTop: 22, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderRadius: themeGeometry.controlRadius,
      padding: 15,
      fontSize: 14,
    },
    primary: {
      backgroundColor: palette.accent,
      padding: 17,
      borderRadius: themeGeometry.controlRadius,
      marginTop: 23,
    },
    primaryText: { color: palette.accentInk, fontWeight: '600', fontSize: 14 },
    link: { fontSize: 12, marginTop: 19 },
    modes: {
      flexDirection: 'row',
      gap: 4,
      marginHorizontal: 16,
      backgroundColor: palette.sidebar,
      padding: 4,
      borderRadius: 12,
    },
    mode: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 9,
    },
    modeActive: {
      backgroundColor: palette.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    heading: { paddingHorizontal: 26, paddingTop: 33, paddingBottom: 26 },
    title: {
      fontFamily: 'Manrope',
      fontSize: 34,
      letterSpacing: -1.8,
      fontWeight: '500',
      marginTop: 14,
    },
    tabs: {
      flexDirection: 'row',
      gap: 24,
      marginHorizontal: 26,
      borderBottomWidth: 1,
    },
    tab: {
      fontSize: 12,
      paddingVertical: 15,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    capture: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      borderWidth: 1,
      borderRadius: 11,
      margin: 24,
      marginBottom: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    captureInput: { flex: 1, fontSize: 13, paddingVertical: 10 },
    addButton: {
      fontSize: 11,
      fontWeight: '600',
      backgroundColor: palette.accent,
      color: palette.accentInk,
      padding: 9,
      borderRadius: 6,
    },
    poster: { width: 28, height: 42, borderRadius: 4, marginRight: 4 },
    completedHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: palette.surface,
      padding: 16,
      marginTop: 12,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
    },
    navigation: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderColor: palette.line,
      backgroundColor: palette.surface,
      paddingTop: 4,
      paddingBottom: 5,
    },
    destination: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    destinationIcon: {
      width: 54,
      height: 27,
      textAlign: 'center',
      textAlignVertical: 'center',
      fontSize: 18,
      color: palette.muted,
      borderRadius: 14,
      overflow: 'hidden',
    },
    destinationSelected: {
      backgroundColor: palette.accent,
      color: palette.accentInk,
    },
    listHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 23,
      paddingTop: 9,
      paddingBottom: 12,
    },
    listTitle: {
      fontFamily: 'Manrope',
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -1.2,
    },
    addAction: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accent,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      minHeight: 56,
      paddingVertical: 8,
    },
    check: {
      width: 21,
      height: 21,
      borderRadius: 6,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemTitle: { fontSize: 15, lineHeight: 22 },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 14,
      borderTopWidth: 0,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 35,
    },
    emptyTitle: { fontSize: 19, marginTop: 15 },
    error: {
      backgroundColor: '#B97F6A15',
      padding: 16,
      marginHorizontal: 20,
      marginBottom: 12,
      borderRadius: 8,
    },
    undo: {
      position: 'absolute',
      bottom: 83,
      left: 24,
      right: 24,
      backgroundColor: '#2C3427',
      padding: 20,
      borderRadius: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sheetHeader: {
      padding: 25,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sheet: { padding: 27, paddingTop: 5, paddingBottom: 70 },
    ratingOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    editorTitle: {
      fontSize: 24,
      fontWeight: '600',
      paddingHorizontal: 12,
      maxHeight: 112,
    },
    editorAction: {
      paddingVertical: 15,
      marginTop: 4,
      borderBottomWidth: 1,
      borderColor: palette.line,
    },
    subtaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 44,
      marginBottom: 4,
    },
    subtaskToggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },
    notesToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 18,
      marginBottom: 6,
      backgroundColor: palette.surface,
      borderRadius: 10,
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    movieSearch: {
      paddingHorizontal: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 10,
    },
    movieInput: {
      flex: 1,
      borderBottomWidth: 1,
      paddingVertical: 10,
      fontSize: 12,
    },
    result: { padding: 23, borderBottomWidth: 1 },
  });
