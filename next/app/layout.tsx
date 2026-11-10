import type { Metadata } from "next";
import "@tick/ui/styles.css";
import "./site.css";
export const metadata: Metadata = {
  title: {
    default: "Tick and Done — A little less on your mind",
    template: "%s · Tick and Done",
  },
  description:
    "Todos, a watchlist, and widgets that keep your day within reach. Android, Linux, and web. Offline first.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
