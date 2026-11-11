#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    os::unix::{
        fs::PermissionsExt,
        net::{UnixListener, UnixStream},
    },
    path::PathBuf,
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};
struct Store {
    db: Mutex<Connection>,
    active: Mutex<Option<String>>,
    notification: Mutex<Option<u32>>,
}
fn empty() -> Value {
    json!({"items":[],"outbox":[],"history":[],"cursor":0})
}
fn load(db: &Connection, account: &str) -> Result<Value, String> {
    let result = db.query_row("SELECT value FROM accounts WHERE id=?1", [account], |r| {
        r.get::<_, String>(0)
    });
    match result {
        Ok(v) => serde_json::from_str(&v).map_err(|e| e.to_string()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(empty()),
        Err(e) => Err(e.to_string()),
    }
}
fn save(db: &Connection, account: &str, value: &Value) -> Result<(), String> {
    let current = load(db, account)?;
    let mut updated = value.clone();
    updated["_version"] = json!(current["_version"].as_u64().unwrap_or(0) + 1);
    db.execute("INSERT INTO accounts(id,value) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET value=excluded.value",params![account,updated.to_string()]).map(|_|()).map_err(|e|e.to_string())
}
#[tauri::command]
fn get_state(account: String, store: State<Store>) -> Result<Value, String> {
    let db = store.db.lock().map_err(|e| e.to_string())?;
    load(&db, &account)
}
#[tauri::command]
fn save_state(account: String, value: Value, store: State<Store>) -> Result<(), String> {
    if value.get("items").and_then(Value::as_array).is_none()
        || value.get("outbox").and_then(Value::as_array).is_none()
    {
        return Err("Invalid local state".into());
    }
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let current = load(&db, &account)?;
    if current["_version"].as_u64().unwrap_or(0) != value["_version"].as_u64().unwrap_or(0) {
        return Err("Concurrent update; retry".into());
    }
    save(&db, &account, &value)
}
trait Notifications {
    fn show(&self, previous: u32, title: &str) -> Result<u32, String>;
    fn close(&self, id: u32) -> Result<(), String>;
}
struct DbusNotifications;
impl Notifications for DbusNotifications {
    fn show(&self, previous: u32, title: &str) -> Result<u32, String> {
        let connection = dbus::blocking::Connection::new_session().map_err(|e| e.to_string())?;
        let proxy = connection.with_proxy(
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            std::time::Duration::from_secs(3),
        );
        let hints = std::collections::HashMap::<&str, dbus::arg::Variant<&str>>::new();
        let (id,): (u32,) = proxy
            .method_call(
                "org.freedesktop.Notifications",
                "Notify",
                (
                    "Task-tick",
                    previous,
                    "",
                    title,
                    "Open Task-tick to see your list.",
                    Vec::<&str>::new(),
                    hints,
                    -1i32,
                ),
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    }
    fn close(&self, id: u32) -> Result<(), String> {
        let connection = dbus::blocking::Connection::new_session().map_err(|e| e.to_string())?;
        let proxy = connection.with_proxy(
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            std::time::Duration::from_secs(3),
        );
        proxy
            .method_call("org.freedesktop.Notifications", "CloseNotification", (id,))
            .map_err(|e| e.to_string())
    }
}
fn change_account(
    store: &Store,
    account: Option<String>,
    notifications: &impl Notifications,
) -> Result<(), String> {
    let mut active = store.active.lock().map_err(|e| e.to_string())?;
    *active = None;
    let mut current = store.notification.lock().map_err(|e| e.to_string())?;
    if let Some(id) = *current {
        notifications.close(id)?;
    }
    *current = None;
    *active = account;
    Ok(())
}
#[tauri::command]
fn activate_account(account: Option<String>, store: State<Store>) -> Result<(), String> {
    change_account(&store, account, &DbusNotifications)
}
#[tauri::command]
fn get_reminders(store: State<Store>) -> Result<bool, String> {
    let account = store
        .active
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Sign in first")?;
    let db = store.db.lock().map_err(|e| e.to_string())?;
    Ok(db
        .query_row(
            "SELECT enabled FROM reminders WHERE account=?1",
            [account],
            |r| r.get(0),
        )
        .unwrap_or(false))
}
#[tauri::command]
fn set_reminders(enabled: bool, store: State<Store>) -> Result<(), String> {
    let account = store
        .active
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Sign in first")?;
    let db = store.db.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT INTO reminders(account,enabled) VALUES(?1,?2) ON CONFLICT(account) DO UPDATE SET enabled=excluded.enabled",params![account,enabled]).map_err(|e|e.to_string())?;
    Ok(())
}
fn notify_due(store: &Store) -> Result<(), String> {
    notify_due_with(store, &DbusNotifications)
}
fn notify_due_with(store: &Store, notifications: &impl Notifications) -> Result<(), String> {
    let active = store.active.lock().map_err(|e| e.to_string())?;
    let account = match active.clone() {
        Some(a) => a,
        None => return Ok(()),
    };
    let db = store.db.lock().map_err(|e| e.to_string())?;
    if !db
        .query_row(
            "SELECT enabled FROM reminders WHERE account=?1",
            [&account],
            |r| r.get::<_, bool>(0),
        )
        .unwrap_or(false)
    {
        return Ok(());
    }
    let state = load(&db, &account)?;
    let now = Utc::now();
    let mut due = Vec::new();
    if let Some(items) = state["items"].as_array() {
        for item in items {
            if item["done"] == true || !item["deletedAt"].is_null() {
                continue;
            }
            let Some(date) = item["dueAt"].as_str() else {
                continue;
            };
            let Ok(time) = chrono::DateTime::parse_from_rfc3339(date) else {
                continue;
            };
            if time > now {
                continue;
            }
            let id = item["id"].as_str().unwrap_or("");
            let notified = db
                .query_row(
                    "SELECT due_at FROM notified WHERE account=?1 AND id=?2",
                    params![account, id],
                    |r| r.get::<_, String>(0),
                )
                .unwrap_or_default();
            if notified != date {
                due.push((
                    id.to_string(),
                    date.to_string(),
                    item["title"]
                        .as_str()
                        .unwrap_or("A task is due")
                        .to_string(),
                ));
            }
        }
    }
    if due.is_empty() {
        return Ok(());
    }
    let title = if due.len() == 1 {
        due[0].2.clone()
    } else {
        format!("{} unfinished tasks are due", due.len())
    };
    let mut current = store.notification.lock().map_err(|e| e.to_string())?;
    let id = notifications.show(current.unwrap_or(0), &title)?;
    *current = Some(id);
    for (id, date, _) in due {
        db.execute("INSERT INTO notified(account,id,due_at) VALUES(?1,?2,?3) ON CONFLICT(account,id) DO UPDATE SET due_at=excluded.due_at",params![account,id,date]).map_err(|e|e.to_string())?;
    }
    Ok(())
}
fn socket_path() -> PathBuf {
    PathBuf::from(
        std::env::var("XDG_RUNTIME_DIR")
            .unwrap_or_else(|_| format!("/run/user/{}", std::env::var("UID").unwrap_or_default())),
    )
    .join("tick-and-done.sock")
}
fn ipc(store: &Store, request: Value) -> Result<Value, String> {
    // Keep the account boundary locked through this operation. A command from an
    // old sidebar view must never become an add/edit in a newly active account.
    let active = store.active.lock().map_err(|e| e.to_string())?;
    let account = active
        .clone()
        .ok_or("Open Task-tick and sign in first")?;
    let action = request["action"].as_str().unwrap_or("state");
    if action != "state" && request["expectedAccount"].as_str() != Some(account.as_str()) {
        return Err("Account changed. Refresh the sidebar and try again.".into());
    }
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut state = load(&db, &account)?;
    if action == "state" {
        state["_account"] = json!(account);
        return Ok(state);
    }
    let kind = request["kind"]
        .as_str()
        .filter(|k| *k == "todo" || *k == "movie")
        .ok_or("Invalid list")?;
    let now = Utc::now().to_rfc3339();
    let id = request["id"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let patch;
    if action == "add" {
        let title = request["title"].as_str().unwrap_or("").trim();
        if title.is_empty() || title.chars().count() > 500 {
            return Err("Enter a title".into());
        }
        patch = json!({"title":title});
    } else if action == "toggle" {
        let item = state["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"] == id && i["kind"] == kind && i["deletedAt"].is_null())
            .ok_or("Item not found")?;
        patch = json!({"done":!item["done"].as_bool().unwrap_or(false)});
    } else {
        return Err("Unsupported action".into());
    }
    let mutation = json!({"id":uuid::Uuid::new_v4().to_string(),"itemId":id,"kind":kind,"action":"patch","patch":patch});
    let items = state["items"].as_array_mut().ok_or("Invalid items")?;
    if let Some(item) = items.iter_mut().find(|i| i["id"] == id) {
        for (k, v) in patch.as_object().unwrap() {
            item[k] = v.clone()
        }
        item["updatedAt"] = json!(now);
    } else {
        let mut item = json!({"id":id,"kind":kind,"title":"","done":false,"notes":"","priority":0,"dueAt":null,"parentId":null,"position":Utc::now().timestamp_millis(),"rating":null,"mediaType":null,"tmdbId":null,"poster":null,"deletedAt":null,"updatedAt":now});
        for (k, v) in patch.as_object().unwrap() {
            item[k] = v.clone()
        }
        items.push(item);
    }
    let mut extra = vec![];
    if patch["done"] == true {
        for child in items
            .iter_mut()
            .filter(|i| i["parentId"] == id && i["done"] == false && i["deletedAt"].is_null())
        {
            child["done"] = json!(true);
            extra.push(json!({"id":uuid::Uuid::new_v4().to_string(),"itemId":child["id"],"kind":"todo","action":"patch","patch":{"done":true}}));
        }
    }
    state["outbox"]
        .as_array_mut()
        .ok_or("Invalid queue")?
        .push(mutation);
    state["outbox"].as_array_mut().unwrap().extend(extra);
    save(&db, &account, &state)?;
    state["_account"] = json!(account);
    Ok(state)
}
fn main() {
    if std::env::args().nth(1).as_deref() == Some("--ipc") {
        let raw = std::env::args()
            .nth(2)
            .unwrap_or_else(|| "{\"action\":\"state\"}".into());
        match UnixStream::connect(socket_path()) {
            Ok(mut stream) => {
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                    .ok();
                writeln!(stream, "{}", raw).ok();
                let mut output = String::new();
                BufReader::new(stream).read_line(&mut output).ok();
                print!("{}", output);
            }
            Err(_) => {
                println!("{{\"error\":\"Open Task-tick first\"}}");
                std::process::exit(1)
            }
        }
        return;
    }
    tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app,_,_|{if let Some(w)=app.get_webview_window("main"){w.show().ok();w.set_focus().ok();}}))
 .invoke_handler(tauri::generate_handler![get_state,save_state,activate_account,get_reminders,set_reminders])
 .setup(|app|{
  let dir=app.path().app_data_dir()?;std::fs::create_dir_all(&dir)?;std::fs::set_permissions(&dir,std::fs::Permissions::from_mode(0o700))?;
  let db=Connection::open(dir.join("tick.sqlite3"))?;db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reminders(account TEXT PRIMARY KEY,enabled INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS notified(account TEXT NOT NULL,id TEXT NOT NULL,due_at TEXT NOT NULL,PRIMARY KEY(account,id));")?;
  app.manage(Store{db:Mutex::new(db),active:Mutex::new(None),notification:Mutex::new(None)});
  if std::env::args().any(|a|a=="--background"){if let Some(window)=app.get_webview_window("main"){window.hide().ok();}}
  let show=MenuItem::with_id(app,"show","Open Task-tick",true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit","Quit",true,None::<&str>)?;let menu=Menu::with_items(app,&[&show,&quit])?;
  TrayIconBuilder::with_id("tick-and-done").icon(tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?).tooltip("Task-tick").menu(&menu).on_menu_event(|app,event|{if event.id.as_ref()=="quit"{app.exit(0)}else if let Some(w)=app.get_webview_window("main"){w.show().ok();w.set_focus().ok();}}).build(app)?;
  let path=socket_path();if path.exists(){std::fs::remove_file(&path)?}let listener=UnixListener::bind(&path)?;std::fs::set_permissions(&path,std::fs::Permissions::from_mode(0o600))?;let handle=app.handle().clone();
  let reminders=app.handle().clone();std::thread::spawn(move||loop{std::thread::sleep(std::time::Duration::from_secs(30));let _=notify_due(&reminders.state::<Store>());});
  std::thread::spawn(move||{for stream in listener.incoming().flatten(){stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).ok();let mut reader=BufReader::new(stream);let mut line=String::new();use std::io::Read;let read=reader.by_ref().take(65536).read_line(&mut line);let response=if read.is_ok(){serde_json::from_str::<Value>(&line).map_err(|e|e.to_string()).and_then(|request|ipc(&handle.state::<Store>(),request))}else{Err("Invalid request".into())};let output=response.unwrap_or_else(|e|json!({"error":e}));writeln!(reader.get_mut(),"{}",output).ok();}});
  Ok(())
 }).on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();window.hide().ok();}})
 .run(tauri::generate_context!()).expect("Unable to start Task-tick");
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE accounts(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE reminders(account TEXT PRIMARY KEY,enabled INTEGER NOT NULL); CREATE TABLE notified(account TEXT,id TEXT,due_at TEXT,PRIMARY KEY(account,id));")
            .unwrap();
        Store {
            db: Mutex::new(db),
            active: Mutex::new(Some("account-a".into())),
            notification: Mutex::new(None),
        }
    }
    #[test]
    fn sidebar_completion_queues_parent_and_children_atomically() {
        let store = store();
        let parent = ipc(
            &store,
            json!({"action":"add","expectedAccount":"account-a","kind":"todo","title":"Parent"}),
        )
        .unwrap();
        let id = parent["items"][0]["id"].clone();
        let mut state = parent.clone();
        let mut child = state["items"][0].clone();
        child["id"] = json!(uuid::Uuid::new_v4().to_string());
        child["parentId"] = id.clone();
        state["items"].as_array_mut().unwrap().push(child);
        save(&store.db.lock().unwrap(), "account-a", &state).unwrap();
        let result = ipc(
            &store,
            json!({"action":"toggle","expectedAccount":"account-a","kind":"todo","id":id}),
        )
        .unwrap();
        assert!(result["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|i| i["done"] == true));
        assert_eq!(result["outbox"].as_array().unwrap().len(), 3);
        assert_eq!(
            load(&store.db.lock().unwrap(), "account-a").unwrap()["items"],
            result["items"]
        );
    }
    #[test]
    fn signed_out_and_other_accounts_cannot_read_retained_sidebar_data() {
        let store = store();
        ipc(
            &store,
            json!({"action":"add","expectedAccount":"account-a","kind":"todo","title":"Private"}),
        )
        .unwrap();
        *store.active.lock().unwrap() = None;
        assert!(ipc(&store, json!({"action":"state"})).is_err());
        *store.active.lock().unwrap() = Some("account-b".into());
        assert_eq!(
            ipc(&store, json!({"action":"state"})).unwrap()["items"],
            json!([])
        );
    }
    #[test]
    fn stale_sidebar_commands_cannot_cross_accounts() {
        let store = store();
        let old = ipc(&store, json!({"action":"state"})).unwrap();
        assert_eq!(old["_account"], "account-a");
        *store.active.lock().unwrap() = Some("account-b".into());
        assert!(ipc(&store, json!({"action":"add","expectedAccount":old["_account"],"kind":"todo","title":"Private A title"})).is_err());
        assert!(ipc(
            &store,
            json!({"action":"add","kind":"todo","title":"Unbound command"})
        )
        .is_err());
        assert_eq!(
            load(&store.db.lock().unwrap(), "account-b").unwrap()["items"],
            json!([])
        );
        let new = ipc(&store, json!({"action":"state"})).unwrap();
        let saved = ipc(&store, json!({"action":"add","expectedAccount":new["_account"],"kind":"todo","title":"B task"})).unwrap();
        assert_eq!(saved["items"][0]["title"], "B task");
        assert_eq!(saved["_account"], "account-b");
    }

    #[derive(Default)]
    struct RecordedNotifications {
        shown: Mutex<Vec<String>>,
        closed: Mutex<Vec<u32>>,
        fail: Mutex<bool>,
    }
    impl Notifications for RecordedNotifications {
        fn show(&self, _: u32, title: &str) -> Result<u32, String> {
            if *self.fail.lock().unwrap() {
                return Err("Delivery unavailable".into());
            }
            self.shown.lock().unwrap().push(title.into());
            Ok(42)
        }
        fn close(&self, id: u32) -> Result<(), String> {
            self.closed.lock().unwrap().push(id);
            Ok(())
        }
    }
    #[test]
    fn reminders_retry_failures_summarize_once_and_clear_on_account_change() {
        let store = store();
        let notifications = RecordedNotifications::default();
        let due = Utc::now() - chrono::Duration::minutes(1);
        let state = json!({"items":[{"id":"one","title":"First","done":false,"deletedAt":null,"dueAt":due.to_rfc3339()},{"id":"two","title":"Second","done":false,"deletedAt":null,"dueAt":due.to_rfc3339()},{"id":"done","title":"Already done","done":true,"deletedAt":null,"dueAt":due.to_rfc3339()}],"outbox":[],"history":[],"cursor":0});
        save(&store.db.lock().unwrap(), "account-a", &state).unwrap();
        notify_due_with(&store, &notifications).unwrap();
        assert!(
            notifications.shown.lock().unwrap().is_empty(),
            "Disabled desktop must stay quiet"
        );
        store
            .db
            .lock()
            .unwrap()
            .execute("INSERT INTO reminders VALUES('account-a',1)", [])
            .unwrap();
        *notifications.fail.lock().unwrap() = true;
        assert!(notify_due_with(&store, &notifications).is_err());
        assert_eq!(
            store
                .db
                .lock()
                .unwrap()
                .query_row("SELECT count(*) FROM notified", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        *notifications.fail.lock().unwrap() = false;
        notify_due_with(&store, &notifications).unwrap();
        notify_due_with(&store, &notifications).unwrap();
        assert_eq!(
            *notifications.shown.lock().unwrap(),
            vec!["2 unfinished tasks are due"]
        );
        change_account(&store, Some("account-b".into()), &notifications).unwrap();
        assert_eq!(*notifications.closed.lock().unwrap(), vec![42]);
        notify_due_with(&store, &notifications).unwrap();
        assert_eq!(notifications.shown.lock().unwrap().len(), 1);
    }
    #[test]
    #[ignore = "requires an authorized live desktop notification service"]
    fn desktop_notification_service_roundtrip() {
        let notifications = DbusNotifications;
        let id = notifications
            .show(0, "Task-tick reminder check")
            .unwrap();
        assert!(id > 0);
        notifications.close(id).unwrap();
    }
}
