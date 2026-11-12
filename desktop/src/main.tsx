import { listen } from "@tauri-apps/api/event";
import React from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { Workspace } from "@tick/ui";
import type { Storage } from "@tick/ui/storage";
import "@tick/ui/styles.css";
const storage: Storage = {
  load: (account) => invoke("get_state", { account }),
  save: (account, value) => invoke("save_state", { account, value }),
  activate: (account) => invoke("activate_account", { account }),
};
const nativeReminderSettings = {
  get: () => invoke<boolean>("get_reminders"),
  set: (enabled: boolean) => invoke<void>("set_reminders", { enabled }),
};
const nativeUpdates = {
  check: () => invoke<string | null>("check_update"),
  install: () => invoke<void>("install_update"),
};
const shareSession = (
  session: import("@supabase/supabase-js").Session | null,
) =>
  invoke<void>("set_search_session", {
    account: session?.user.id ?? null,
    token: session?.access_token ?? null,
  });
void listen("tick-store-changed", () => window.dispatchEvent(new Event("tick-native-change")));
createRoot(document.getElementById("root")!).render(
  <Workspace
    storage={storage}
    desktop
    nativeReminderSettings={nativeReminderSettings}
    onSession={shareSession}
    nativeUpdates={nativeUpdates}
  />,
);
