// Tracks which personal records the user has already been shown a celebration for — sessions are
// only ever logged via the coach's MCP tool calls in a separate chat client (this app has no
// session-logging path of its own), so a PR can only ever be *discovered* on the next time this
// app is opened, never celebrated at the literal moment it happens. One flat localStorage key,
// same idiom as i18n/index.ts's LANGUAGE_STORAGE_KEY — a map of exerciseId -> the PR date last
// shown, since each exercise's record updates independently (not one global timestamp).
import type { PersonalRecord } from "../data/workouts";

const PR_SEEN_STORAGE_KEY = "ws_pr_seen";

export function getSeenPRDates(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PR_SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function hasSeenAnyPRs(): boolean {
  return localStorage.getItem(PR_SEEN_STORAGE_KEY) != null;
}

export function markPRsSeen(prs: PersonalRecord[]): void {
  const seen = getSeenPRDates();
  for (const pr of prs) seen[pr.exerciseId] = pr.date;
  localStorage.setItem(PR_SEEN_STORAGE_KEY, JSON.stringify(seen));
}

export function findNewPRs(prs: PersonalRecord[], seen: Record<string, string>): PersonalRecord[] {
  return prs.filter((pr) => {
    const lastSeen = seen[pr.exerciseId];
    return !lastSeen || new Date(pr.date) > new Date(lastSeen);
  });
}
