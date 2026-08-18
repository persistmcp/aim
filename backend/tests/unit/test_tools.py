"""Unit tests for the MCP tool surface: behavior annotations (no DB, no transport)."""

from fastmcp import FastMCP

from workout_storage import tools

READ_ONLY = {
    "get_session",
    "get_sessions",
    "get_body_metrics",
    "list_exercises",
    "search_exercise_pool",
    "get_program",
    "get_stats",
    "get_coaching_context",
    "review_program_draft",
    "get_goals",
}
IDEMPOTENT_WRITES = {
    "update_session",
    "update_set",
    "upsert_exercise",
    "update_coach_profile",
    "delete_session",
}
# Idempotent only when the model supplies ids — a hint can't say that, so no promise is made
# (import_document: sessions/metrics without ids and programs with id=null re-insert on retry).
UNHINTED = {"log_session", "upsert_goal", "log_body_metric", "log_coach_event", "import_document"}


async def _tools() -> dict:
    mcp = FastMCP("test")
    tools.register(mcp)
    return {t.name: t for t in await mcp.list_tools()}


async def test_every_tool_has_an_explicit_annotation_decision():
    registered = set(await _tools())
    assert registered == READ_ONLY | IDEMPOTENT_WRITES | UNHINTED


async def test_readers_carry_read_only_hint():
    for name, tool in (await _tools()).items():
        ann = tool.annotations
        if name in READ_ONLY:
            assert ann and ann.readOnlyHint, f"{name} must be readOnlyHint=True"
        else:
            assert not (ann and ann.readOnlyHint), f"{name} must not claim read-only"


async def test_write_hints_are_honest():
    tools_by_name = await _tools()
    for name in IDEMPOTENT_WRITES:
        assert tools_by_name[name].annotations.idempotentHint, name
    for name in UNHINTED:
        ann = tools_by_name[name].annotations
        assert ann is None or not ann.idempotentHint, f"{name} retries can duplicate data"
    assert tools_by_name["delete_session"].annotations.destructiveHint
