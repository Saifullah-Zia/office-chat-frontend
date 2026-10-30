/** "last seen today at 5:47 PM" / "yesterday at …" / "Oct 27 at …" */
export function formatLastSeen(iso?: string | null): string {
  if (!iso) return "Offline";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "Offline";

  const now = new Date();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "last seen just now";
  if (diffMin < 60) return `last seen ${diffMin} min ago`;

  if (date.toDateString() === now.toDateString()) return `last seen today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${time}`;

  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  return `last seen ${day} at ${time}`;
}
