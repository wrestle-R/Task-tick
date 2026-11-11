import type { Metadata } from "next";
import "@tick/ui/styles.css";
import "./site.css";
export const metadata: Metadata = {
  title: {
    default: "Task-tick — A little less on your mind",
    template: "%s · Task-tick",
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
