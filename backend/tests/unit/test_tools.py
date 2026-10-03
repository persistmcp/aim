"""Unit tests for the MCP tool surface: behavior annotations (no DB, no transport)."""

from fastmcp import FastMCP

from workout_storage import models, tools

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


def _descriptions(node: object) -> set[str]:
    """Every `description` string anywhere in a JSON schema, nested models included."""
    found: set[str] = set()
    stack = [node]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            text = current.get("description")
            if isinstance(text, str):
                found.add(text)
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return found


async def test_no_text_tells_claude_to_obey_what_the_server_returns():
    """Behaviour rules live only in the server instructions; tool and parameter descriptions say
    what a tool does and what a field means, and nothing points the model at a result as
    instructions to follow. Every text the model reads from us is checked: the server
    instructions, every tool and prompt description, every rendered prompt body, and every
    parameter description at any depth of every input schema."""
    from workout_storage.coaching import SERVER_INSTRUCTIONS
    from workout_storage.server import mcp as server

    assert server.instructions == SERVER_INSTRUCTIONS
    registered = FastMCP("test")
    tools.register(registered)
    texts = {"server instructions": SERVER_INSTRUCTIONS}
    for name, t in (await _tools()).items():
        texts[f"tool {name}"] = t.description or ""
        for i, d in enumerate(sorted(_descriptions(t.parameters))):
            texts[f"tool {name} parameter description #{i}"] = d
    for p in await registered.list_prompts():
        texts[f"prompt {p.name}"] = p.description or ""
        rendered = await registered.render_prompt(p.name)
        texts[f"prompt {p.name} body"] = " ".join(
            getattr(m.content, "text", "") for m in rendered.messages
        )

    obey = (
        "as your instructions",
        "as instructions",
        "treat the returned",
        "the returned prompt",
        "returned `prompt`",
        "follow the prompt",
        "follow the instructions",
        "follow its",
        "and follow it",
        "obey",
        "do what the",
        "run it",
        "instructions it returns",
        "instructions in the result",
        "coaching prompt",
    )
    directives = (
        "never push",
        "drop the subject",
        "coaching note:",
        "tell the user and ask",
        "confirm to the user",
        "call search_exercise_pool first",
        "the coaching prompt names",
        "invent your own",
        "ask how long",
        "fix each one",
        "call import_document again",
        "never invent a program",
    )
    for where, text in texts.items():
        flat = " ".join(text.split()).lower()
        for phrase in obey:
            assert phrase not in flat, f"{where} tells Claude to obey the server: {phrase!r}"
        if where == "server instructions":
            continue
        for phrase in directives:
            assert phrase not in flat, f"{where} tells Claude how to behave: {phrase!r}"


def test_results_carry_no_next_step_order():
    """review_program_draft and import_document's refusals used to end in `next_step` ("Fix every
    violation and call import_document again"), log_session in a `coach_hint` note, and the pool
    search in a `usage` note: orders in a tool result. The import refusals, the nudge and the
    pool result are built inline in services.py, so the source is checked for the keys."""
    import inspect

    from workout_storage import services

    source = inspect.getsource(services)
    for key in ('"next_step"', '"coach_hint"', '"usage"'):
        assert key not in source, f"services.py still builds a {key} into a tool result"
