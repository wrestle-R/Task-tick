import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Linking,
  Modal,
  NativeModules,
  PanResponder,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import type { Item, Kind, State, Fields } from '../packages/core/src/index';
type Snapshot = {
  state: State;
  account: string | null;
  email: string | null;
  backend: string;
  preciseAlarms: boolean;
};
const native = NativeModules.TickStore;
const blank: Snapshot = {
  state: { items: [], outbox: [], history: [], cursor: 0 },
  account: null,
  email: null,
  backend: '',
  preciseAlarms: false,
};
export default function App() {
  const dark = useColorScheme() === 'dark';
  const c = dark
    ? {
        bg: '#171B17',
        surface: '#22281F',
        ink: '#F0F1E7',
        muted: '#9AA58F',
        line: '#343F2E',
      }
    : {
        bg: '#FAF9F4',
        surface: '#F0F0E7',
        ink: '#2B3027',
        muted: '#858C79',
        line: '#E3E5D9',
      };
  const [snap, setSnap] = useState(blank),
    [kind, setKind] = useState<Kind>('todo'),
    [view, setView] = useState<'active' | 'done' | 'trash' | 'history'>(
      'active',
    ),
    [title, setTitle] = useState(''),
    [selected, setSelected] = useState<Item | null>(null),
    [settings, setSettings] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [backend, setBackend] = useState('https://task-tick-beige.vercel.app'),
    [authMode, setAuthMode] = useState('login'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<any[]>([]),
    [undo, setUndo] = useState<any>(null),
    [subtask, setSubtask] = useState('');
  const pendingLink = useRef<string | null>(null);
  async function refresh() {
    try {
      const value = JSON.parse(await native.snapshot());
      setSnap(value);
      if (value.backend) setBackend(value.backend);
      const u = value.state.undo;
      setUndo(u && u.until > Date.now() ? u : null);
      if (pendingLink.current) {
        const link = pendingLink.current;
        setKind(link.includes('/movie') ? 'movie' : 'todo');
        const id = link.match(/[?&]item=([^&]+)/)?.[1];
        if (id)
          setSelected(value.state.items.find((i: Item) => i.id === id) ?? null);
        pendingLink.current = null;
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sync() {
    try {
      setBusy(true);
      setSnap(JSON.parse(await native.sync()));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!native) {
      setError('Native storage module unavailable. Rebuild the Android app.');
      return;
    }
    void refresh();
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
        void refresh();
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
        await native.mutate(JSON.stringify({ kind: k, id, action, patch })),
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
      if (await mutate(kind, { title: name })) setTitle('');
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
        backend,
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
      setSnap(blank);
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
    if (selected && (await mutate(selected.kind, p, selected.id)))
      setSelected({ ...selected, ...p });
  }
  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(JSON.parse(await native.search(query.trim())).results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
      setSelected(existing);
      setResults([]);
      return;
    }
    await mutate('movie', {
      title: movie.title ?? movie.name,
      tmdbId: movie.id,
      mediaType: movie.media_type,
      poster: movie.poster_path,
    });
    setResults([]);
    setQuery('');
  }
  const all = snap.state.items.filter(i => i.kind === kind),
    items = all
      .filter(i =>
        view === 'trash'
          ? !!i.deletedAt && Date.parse(i.deletedAt) > Date.now() - 7 * 86400000
          : !i.deletedAt && i.done === (view === 'done'),
      )
      .sort((a, b) => a.position - b.position);
  function reorder(index: number, delta: number) {
    const target = Math.max(
      0,
      Math.min(items.length - 1, index + Math.round(delta / 80)),
    );
    if (index === target) return;
    const reordered = items.filter((_, i) => i !== index);
    reordered.splice(target, 0, items[index]);
    const before = reordered[target - 1],
      after = reordered[target + 1];
    void mutate(
      kind,
      {
        position:
          before && after
            ? (before.position + after.position) / 2
            : before
              ? before.position + 1000
              : after
                ? after.position - 1000
                : Date.now(),
      },
      items[index].id,
    );
  }
  const label = (text: string) => (
    <Text style={[s.label, { color: c.muted }]}>{text}</Text>
  );
  const inputStyle = [s.input, { borderColor: c.line, color: c.ink }];
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <View style={s.header}>
        <Text style={[s.brand, { color: c.ink }]}>
          <Text style={s.logo}>✓</Text> tick & done.
        </Text>
        <Pressable
          accessibilityLabel="Settings"
          onPress={() => setSettings(true)}
        >
          <Text style={{ fontSize: 28, color: c.muted }}>☷</Text>
        </Pressable>
      </View>
      {!snap.account ? (
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
          {label('WEBSITE / BACKEND URL')}
          <TextInput
            style={inputStyle}
            value={backend}
            onChangeText={setBackend}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://your-tick-website.example"
            placeholderTextColor={c.muted}
          />
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
                placeholder="At least 8 characters"
                placeholderTextColor={c.muted}
              />
            </>
          )}
          <Pressable
            disabled={
              busy ||
              !email ||
              !backend ||
              (authMode !== 'reset' && password.length < 8)
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
          <View style={s.modes}>
            {(['todo', 'movie'] as Kind[]).map(k => (
              <Pressable
                style={[s.mode, kind === k && s.modeActive]}
                key={k}
                onPress={() => {
                  setKind(k);
                  setView('active');
                  setResults([]);
                }}
              >
                <Text
                  style={{
                    color: kind === k ? '#354422' : c.muted,
                    fontSize: 12,
                  }}
                >
                  {k === 'todo' ? '✓  My todos' : '▤  Watchlist'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={s.heading}>
            <Text style={[s.eyebrow, { color: c.muted }]}>
              {kind === 'todo'
                ? 'ONE THING AT A TIME'
                : 'FOR YOUR NEXT NIGHT IN'}
            </Text>
            <Text style={[s.title, { color: c.ink }]}>
              {view === 'trash'
                ? 'A second thought.'
                : view === 'history'
                  ? 'A little rewind.'
                  : view === 'done'
                    ? 'Done & dusted.'
                    : kind === 'todo'
                      ? 'Less thinking.'
                      : 'Worth watching.'}
            </Text>
            <Text style={[s.description, { color: c.muted }]}>
              {all.filter(i => !i.deletedAt && !i.done && !i.parentId).length}{' '}
              {kind === 'todo'
                ? 'things to do. You’ve got this.'
                : 'stories waiting for you.'}
            </Text>
          </View>
          <View style={[s.tabs, { borderColor: c.line }]}>
            {(['active', 'done', 'trash', 'history'] as const).map(v => (
              <Pressable key={v} onPress={() => setView(v)}>
                <Text
                  style={[
                    s.tab,
                    { color: c.muted },
                    view === v && { color: c.ink, borderBottomColor: c.ink },
                  ]}
                >
                  {v === 'active'
                    ? kind === 'todo'
                      ? 'To do'
                      : 'To watch'
                    : v === 'done'
                      ? kind === 'todo'
                        ? 'Done'
                        : 'Watched'
                      : v === 'trash'
                        ? 'Trash'
                        : 'History'}
                </Text>
              </Pressable>
            ))}
          </View>
          {view === 'active' && (
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
          {kind === 'movie' && view === 'active' && (
            <View style={s.movieSearch}>
              <TextInput
                style={[s.movieInput, { color: c.ink, borderColor: c.line }]}
                placeholder="Find a title on TMDB…"
                placeholderTextColor={c.muted}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => void search()}
              />
              <Pressable onPress={() => void search()}>
                <Text style={[s.link, { color: c.muted }]}>Search ↗</Text>
              </Pressable>
            </View>
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
            <FlatList
              data={items}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingBottom: 90,
                flexGrow: 1,
              }}
              keyExtractor={i => i.id}
              ListEmptyComponent={
                <View style={s.empty}>
                  <Text style={{ fontSize: 38, color: '#8D9F67' }}>✓</Text>
                  <Text style={[s.emptyTitle, { color: c.ink }]}>
                    A little breathing room.
                  </Text>
                  <Text style={[s.description, { color: c.muted }]}>
                    Your list is ready when you are.
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <TaskRow
                  colors={c}
                  item={item}
                  trash={view === 'trash'}
                  onToggle={() => {
                    if (view === 'trash')
                      void mutate(item.kind, {}, item.id, 'restore');
                    else void mutate(item.kind, { done: !item.done }, item.id);
                  }}
                  onOpen={() => setSelected(item)}
                  onMove={delta => reorder(index, delta)}
                  draggable={view === 'active'}
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
                {busy
                  ? 'Syncing…'
                  : snap.state.outbox.length
                    ? `${snap.state.outbox.length} pending ↗`
                    : 'Up to date ↗'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
      {error !== '' && (
        <Pressable style={s.error} onPress={() => setError('')}>
          <Text style={{ color: '#9F5047', fontSize: 12, lineHeight: 18 }}>
            {error} ×
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
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.eyebrow, { color: c.muted }]}>A LITTLE DETAIL</Text>
            <Pressable onPress={() => setSelected(null)}>
              <Text style={{ fontSize: 24, color: c.ink }}>×</Text>
            </Pressable>
          </View>
          {selected && (
            <ScrollView contentContainerStyle={s.sheet}>
              {label('TITLE')}
              <TextInput
                style={[...inputStyle, { fontSize: 22 }]}
                value={selected.title}
                onChangeText={t => setSelected({ ...selected, title: t })}
                onEndEditing={() =>
                  selected.title.trim() &&
                  void patch({ title: selected.title.trim() })
                }
              />
              <Pressable
                style={s.primary}
                onPress={() => void patch({ done: !selected.done })}
              >
                <Text style={s.primaryText}>
                  {selected.done ? 'Mark unfinished' : 'Mark as done'} ✓
                </Text>
              </Pressable>
              {selected.kind === 'todo' ? (
                <>
                  {label('NOTES')}
                  <TextInput
                    multiline
                    style={[
                      ...inputStyle,
                      { minHeight: 130, textAlignVertical: 'top' },
                    ]}
                    value={selected.notes}
                    onChangeText={t => setSelected({ ...selected, notes: t })}
                    onEndEditing={() => void patch({ notes: selected.notes })}
                  />
                  {label('DUE DATE & REMINDER')}
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
                      {selected.dueAt
                        ? new Date(selected.dueAt).toLocaleString()
                        : 'Choose a date & time ↗'}
                    </Text>
                  </Pressable>
                  {selected.dueAt && (
                    <Pressable onPress={() => void patch({ dueAt: null })}>
                      <Text style={s.link}>Remove reminder</Text>
                    </Pressable>
                  )}
                  {label('PRIORITY')}
                  <View style={s.modes}>
                    {['None', 'Low', 'Medium', 'High'].map((v, n) => (
                      <Pressable
                        key={v}
                        style={[
                          s.mode,
                          selected.priority === n && s.modeActive,
                        ]}
                        onPress={() => void patch({ priority: n })}
                      >
                        <Text
                          style={{
                            color:
                              selected.priority === n ? '#354422' : c.muted,
                            fontSize: 12,
                          }}
                        >
                          {v}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {!selected.parentId && (
                    <>
                      {label('SUBTASKS')}
                      {snap.state.items
                        .filter(i => i.parentId === selected.id && !i.deletedAt)
                        .map(i => (
                          <Pressable
                            key={i.id}
                            style={s.subtask}
                            onPress={() =>
                              void mutate('todo', { done: !i.done }, i.id)
                            }
                          >
                            <Text style={{ color: c.ink }}>
                              {i.done ? '✓' : '○'} {i.title}
                            </Text>
                          </Pressable>
                        ))}
                      <TextInput
                        style={inputStyle}
                        placeholder="One smaller step…"
                        placeholderTextColor={c.muted}
                        value={subtask}
                        onChangeText={setSubtask}
                        onSubmitEditing={async () => {
                          if (
                            subtask.trim() &&
                            (await mutate('todo', {
                              title: subtask.trim(),
                              parentId: selected.id,
                            }))
                          )
                            setSubtask('');
                        }}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  {label('YOUR RATING')}
                  <View style={s.ratingOptions}>
                    {[null, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => (
                      <Pressable
                        key={String(n)}
                        style={[s.mode, selected.rating === n && s.modeActive]}
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
                <Text style={{ color: '#A7675B', marginTop: 36, fontSize: 13 }}>
                  Move to trash
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={settings}
        animationType="slide"
        onRequestClose={() => setSettings(false)}
      >
        <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
          <View style={s.sheetHeader}>
            <Text style={[s.eyebrow, { color: c.muted }]}>MAKE IT YOURS</Text>
            <Pressable onPress={() => setSettings(false)}>
              <Text style={{ fontSize: 24, color: c.ink }}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.sheet}>
            <Text style={[s.title, { color: c.ink }]}>Your little space.</Text>
            <Text style={[s.description, { color: c.muted }]}>
              {snap.email ?? 'Sign in to keep everything together.'}
            </Text>
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
              <Text style={s.primaryText}>Alarm permission settings ↗</Text>
            </Pressable>
            <Text style={[s.description, { color: c.muted, marginTop: 22 }]}>
              Edit history and trash last seven days. Offline changes stay until
              synced. Force-stopping the app can pause widgets and reminders
              until you open it again.
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
                <Text style={[s.link, { color: '#A7675B', marginTop: 35 }]}>
                  Sign out
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
}: {
  colors: any;
  item: Item;
  onToggle: () => void;
  onOpen: () => void;
  onMove: (dy: number) => void;
  draggable: boolean;
  trash: boolean;
}) {
  const dy = useRef(new Animated.Value(0)).current;
  const move = useRef(onMove);
  move.current = onMove;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => dy.setValue(g.dy),
      onPanResponderRelease: (_, g) => {
        move.current(g.dy);
        dy.setValue(0);
      },
      onPanResponderTerminate: () => dy.setValue(0),
    }),
  ).current;
  return (
    <Animated.View
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
        style={[
          s.check,
          { borderColor: colors.muted },
          item.done && { backgroundColor: '#D8ED96', borderColor: '#D8ED96' },
        ]}
      >
        <Text style={{ color: '#354422' }}>
          {trash ? '↶' : item.done ? '✓' : ''}
        </Text>
      </Pressable>
      <Pressable onPress={onOpen} style={{ flex: 1 }}>
        <Text
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
const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 25,
    paddingTop: 22,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontSize: 23, fontWeight: '700', letterSpacing: -1 },
  logo: { color: '#8D9F67', fontSize: 27 },
  auth: { padding: 28, paddingTop: 40, paddingBottom: 80 },
  eyebrow: { fontSize: 9, letterSpacing: 2, fontWeight: '600' },
  authTitle: {
    fontSize: 46,
    fontWeight: '600',
    letterSpacing: -2.5,
    lineHeight: 53,
    marginTop: 20,
  },
  description: { fontSize: 12, lineHeight: 21, marginTop: 12 },
  label: { fontSize: 9, letterSpacing: 1.3, marginTop: 25, marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 9, padding: 15, fontSize: 14 },
  primary: {
    backgroundColor: '#D8ED96',
    padding: 17,
    borderRadius: 9,
    marginTop: 23,
  },
  primaryText: { color: '#354422', fontWeight: '600', fontSize: 14 },
  link: { fontSize: 12, marginTop: 19 },
  modes: { flexDirection: 'row', gap: 7, paddingHorizontal: 24 },
  mode: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 8 },
  modeActive: { backgroundColor: '#D8ED96' },
  heading: { paddingHorizontal: 26, paddingTop: 33, paddingBottom: 26 },
  title: {
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
    backgroundColor: '#D8ED96',
    color: '#354422',
    padding: 9,
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: 1,
    minHeight: 80,
    paddingVertical: 15,
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
    padding: 20,
    borderTopWidth: 1,
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
    bottom: 35,
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
  subtask: { paddingVertical: 12 },
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
