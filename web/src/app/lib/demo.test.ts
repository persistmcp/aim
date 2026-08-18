import { describe, expect, it } from "vitest";
import { demoGet } from "./demo";

// Regression: profile/adherence/connection were added to the real API but never wired into the
// demo dataset, so they fell through to `data = null` — most concretely, useConnection's
// refetchInterval (`data?.connected ? false : 5000`) never saw `connected: true` and polled a
// /demo visitor forever instead of ever stopping.
describe("demoGet — new endpoints", () => {
  it("connection: reports connected so useConnection's poll-until-connected stops", async () => {
    const data = await demoGet<{ connected: boolean; last_tool: string | null }>("/connection");
    expect(data.connected).toBe(true);
    expect(data.last_tool).not.toBeNull();
  });

  it("adherence: returns a numeric target so AdherenceWidget renders instead of staying null", async () => {
    const data = await demoGet<{ sessions_this_week: number; target_per_week: number | null }>(
      "/adherence",
    );
    expect(data.target_per_week).not.toBeNull();
    expect(typeof data.sessions_this_week).toBe("number");
  });

  it("profile: returns a goal-aware config with at least one goal for GoalProgressSection", async () => {
    const data = await demoGet<{
      primary_goal: string | null;
      tiles: string[];
      modules: string[];
      goals: unknown[];
    }>("/profile");
    expect(data.primary_goal).not.toBeNull();
    expect(data.tiles.length).toBeGreaterThan(0);
    expect(data.goals.length).toBeGreaterThan(0);
  });

  it("still falls back to null for a genuinely unhandled path (not silently misrouted)", async () => {
    const data = await demoGet("/some-future-endpoint-not-yet-added");
    expect(data).toBeNull();
  });
});
