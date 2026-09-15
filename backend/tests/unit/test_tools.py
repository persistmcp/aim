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


async def test_every_tool_carries_a_title():
    """Directory Policy §5.E requires a title on every tool. It is also what a client shows in a
    permission prompt, so an empty one leaves the user approving a bare function name."""
    for name, tool in (await _tools()).items():
        assert tool.annotations is not None, f"{name} has no annotations at all"
        title = tool.annotations.title
        assert title, f"{name} has no title"
        assert title != name, f"{name}: the title should read as an action, not repeat the name"


async def test_every_body_metric_field_and_coach_event_parameter_is_described():
    """Glama's review of 2026-09-14 scored log_body_metric lowest of all twenty tools (2.7/5) with
    "schema description coverage 0%", and log_coach_event next (3.3) for an unexplained `payload`.
    The same gap misleads any assistant filling these in, so full coverage is the floor now."""
    tools_by_name = await _tools()
    body = tools_by_name["log_body_metric"].parameters
    metric = body["properties"]["metric"]
    # fastmcp inlines nested models; fall back to $defs in case a version stops doing so.
    body_fields = (metric if "properties" in metric else body["$defs"]["BodyMetric"])["properties"]
    assert set(body_fields) == set(models.BodyMetric.model_fields)
    assert all(field.get("description") for field in body_fields.values()), [
        name for name, field in body_fields.items() if not field.get("description")
    ]
    coach = tools_by_name["log_coach_event"].parameters["properties"]
    assert coach["type"].get("description") and coach["payload"].get("description")


async def test_writes_declare_whether_they_destroy_data():
    """readOnlyHint=False alone does not tell a client whether a call is safe to allow. Only
    delete_session removes anything; the rest add or amend, and say so explicitly."""
    tools_by_name = await _tools()
    for name in IDEMPOTENT_WRITES | UNHINTED:
        ann = tools_by_name[name].annotations
        assert ann.readOnlyHint is False, name
        assert ann.destructiveHint is (name == "delete_session"), name
