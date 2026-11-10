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
#[tauri::command]
fn activate_account(account: Option<String>, store: State<Store>) -> Result<(), String> {
    *store.active.lock().map_err(|e| e.to_string())? = account;
    Ok(())
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
    let account = match store.active.lock().map_err(|e| e.to_string())?.clone() {
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
    let status = std::process::Command::new("notify-send")
        .args([
            "--app-name=Tick and Done",
            "--",
            &title,
            "Open Tick and Done to see your list.",
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        for (id, date, _) in due {
            db.execute("INSERT INTO notified(account,id,due_at) VALUES(?1,?2,?3) ON CONFLICT(account,id) DO UPDATE SET due_at=excluded.due_at",params![account,id,date]).map_err(|e|e.to_string())?;
        }
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
    let account = store
        .active
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Open Tick and Done and sign in first")?;
    let db = store.db.lock().map_err(|e| e.to_string())?;
    let mut state = load(&db, &account)?;
    let action = request["action"].as_str().unwrap_or("state");
    if action == "state" {
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
                println!("{{\"error\":\"Open Tick and Done first\"}}");
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
  app.manage(Store{db:Mutex::new(db),active:Mutex::new(None)});
  if std::env::args().any(|a|a=="--background"){if let Some(window)=app.get_webview_window("main"){window.hide().ok();}}
  let show=MenuItem::with_id(app,"show","Open Tick and Done",true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit","Quit",true,None::<&str>)?;let menu=Menu::with_items(app,&[&show,&quit])?;
  TrayIconBuilder::with_id("tick-and-done").icon(tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?).tooltip("Tick and Done").menu(&menu).on_menu_event(|app,event|{if event.id.as_ref()=="quit"{app.exit(0)}else if let Some(w)=app.get_webview_window("main"){w.show().ok();w.set_focus().ok();}}).build(app)?;
  let path=socket_path();if path.exists(){std::fs::remove_file(&path)?}let listener=UnixListener::bind(&path)?;std::fs::set_permissions(&path,std::fs::Permissions::from_mode(0o600))?;let handle=app.handle().clone();
  let reminders=app.handle().clone();std::thread::spawn(move||loop{std::thread::sleep(std::time::Duration::from_secs(30));let _=notify_due(&reminders.state::<Store>());});
  std::thread::spawn(move||{for stream in listener.incoming().flatten(){stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).ok();let mut reader=BufReader::new(stream);let mut line=String::new();use std::io::Read;let read=reader.by_ref().take(65536).read_line(&mut line);let response=if read.is_ok(){serde_json::from_str::<Value>(&line).map_err(|e|e.to_string()).and_then(|request|ipc(&handle.state::<Store>(),request))}else{Err("Invalid request".into())};let output=response.unwrap_or_else(|e|json!({"error":e}));writeln!(reader.get_mut(),"{}",output).ok();}});
  Ok(())
 }).on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();window.hide().ok();}})
 .run(tauri::generate_context!()).expect("Unable to start Tick and Done");
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE accounts(id TEXT PRIMARY KEY,value TEXT NOT NULL)")
            .unwrap();
        Store {
            db: Mutex::new(db),
            active: Mutex::new(Some("account-a".into())),
        }
    }
    #[test]
    fn sidebar_completion_queues_parent_and_children_atomically() {
        let store = store();
        let parent = ipc(
            &store,
            json!({"action":"add","kind":"todo","title":"Parent"}),
        )
        .unwrap();
        let id = parent["items"][0]["id"].clone();
        let mut state = parent.clone();
        let mut child = state["items"][0].clone();
        child["id"] = json!(uuid::Uuid::new_v4().to_string());
        child["parentId"] = id.clone();
        state["items"].as_array_mut().unwrap().push(child);
        save(&store.db.lock().unwrap(), "account-a", &state).unwrap();
        let result = ipc(&store, json!({"action":"toggle","kind":"todo","id":id})).unwrap();
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
            json!({"action":"add","kind":"todo","title":"Private"}),
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
}
