"""Integration test for the backup dump (no Blob upload)."""

import pytest
import pytest_asyncio

from workout_storage import backup, repo
from workout_storage.models import Session

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def user_id(conn):
    user = await repo.create_user(conn, name="Backup")
    return str(user["id"])


async def test_dump_all_includes_logged_data(conn, user_id, example_doc):
    session = Session.model_validate(example_doc["sessions"][0])
    await repo.insert_session(conn, user_id, session)

    data = await backup.dump_all(conn)
    # dump_all is global (not user-scoped) and the test DB is shared across the session, so assert
    # presence of this test's data rather than exact counts.
    assert set(backup.TABLES) <= set(data)
    assert len(data["users"]) >= 1
    assert len(data["sessions"]) >= 1
    assert len(data["sets"]) > 0
