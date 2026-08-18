// Shared "past goal" definition — used by Home (to decide whether the history nav entry renders
// at all) and by the GoalHistory screen (to render the list itself). Kept in one place so the two
// can never silently disagree on what counts as history.
import type { Goal } from "../data/workouts";

export const TERMINAL_STATUSES = ["achieved", "abandoned", "revised"] as const;

export function pastGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => (TERMINAL_STATUSES as readonly string[]).includes(g.status));
}
