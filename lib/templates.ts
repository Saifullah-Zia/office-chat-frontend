import { apiGet } from "@/lib/api";

export interface QuickReply {
  id: number;
  shortcut: string;
  title: string;
  content: string;
  shared: boolean;
  editable: boolean;
}

/** Loaded once per page and shared by every chat; call invalidateQuickReplies() after edits. */
let cache: Promise<QuickReply[]> | null = null;

export function loadQuickReplies(): Promise<QuickReply[]> {
  cache ??= apiGet<QuickReply[]>("/api/templates").catch(() => {
    cache = null;
    return [];
  });
  return cache;
}

export function invalidateQuickReplies() {
  cache = null;
}
