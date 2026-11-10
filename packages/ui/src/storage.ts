import { openDB } from "idb";
import { emptyState, type State } from "@tick/core";
export interface Storage {
  load(account: string): Promise<State>;
  save(account: string, state: State): Promise<void>;
  activate?(account: string | null): Promise<void>;
}
const db = () =>
  openDB("tick-and-done", 1, {
    upgrade(db) {
      db.createObjectStore("accounts");
    },
  });
export const browserStorage: Storage = {
  async load(account) {
    return (await (await db()).get("accounts", account)) ?? emptyState();
  },
  async save(account, state) {
    await (await db()).put("accounts", state, account);
  },
};
