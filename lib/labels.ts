/** Chat labels & status: a chat used as a mini ticket (billing workflow). */

export type TicketStatus = "OPEN" | "DONE";

/** Suggested labels; people can also type their own. */
export const PRESET_LABELS = [
  "Urgent", "Denial", "Pending payer", "Appeal", "Eligibility", "Prior auth", "Coding", "Payment posting",
];

const COLORS: Record<string, string> = {
  urgent: "#dc2626",
  denial: "#ea580c",
  "pending payer": "#ca8a04",
  appeal: "#7c3aed",
  eligibility: "#0891b2",
  "prior auth": "#2563eb",
  coding: "#db2777",
  "payment posting": "#16a34a",
};
const FALLBACK = ["#0d9488", "#4f46e5", "#9333ea", "#c2410c", "#0369a1", "#be123c", "#4d7c0f"];

/** Stable colour per label (custom labels get one from their name). */
export function labelColor(label: string): string {
  const key = label.toLowerCase();
  if (COLORS[key]) return COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
}

export const STATUS_LABEL: Record<TicketStatus, string> = { OPEN: "Open", DONE: "Done" };
