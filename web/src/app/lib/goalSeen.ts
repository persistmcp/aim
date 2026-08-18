// Tracks which achieved goals the user has already been shown the one-time celebration for —
// same idiom (and reasoning) as prSeen.ts: goals are only ever closed out via the coach's MCP
// tool calls in a separate chat client, so an achievement can only be *discovered* on the next
// app open, never at the literal moment it happens. Keyed by goal id: a superseding goal gets
// its own id, so each milestone celebrates at most once, ever.
const GOAL_SEEN_STORAGE_KEY = "ws_goal_achieved_seen";

function read(): Record<string, true> {
  try {
    const raw = localStorage.getItem(GOAL_SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, true>) : {};
  } catch {
    return {};
  }
}

export function hasCelebratedGoal(goalId: string): boolean {
  return read()[goalId] === true;
}

export function markGoalCelebrated(goalId: string): void {
  const seen = read();
  seen[goalId] = true;
  localStorage.setItem(GOAL_SEEN_STORAGE_KEY, JSON.stringify(seen));
}
