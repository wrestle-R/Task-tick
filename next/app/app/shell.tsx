"use client";
import { useEffect } from "react";
export function OfflineShell() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
