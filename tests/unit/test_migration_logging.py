"""Migrations must preserve the application's existing diagnostic loggers."""
from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import textwrap


ROOT = Path(__file__).resolve().parents[2]


def test_migration_environment_preserves_existing_application_loggers():
    # Alembic applies process-wide logging configuration. Exercise the real
    # environment in a child process so its handlers cannot alter pytest's
    # capture or other tests. An empty offline migration plan avoids a database.
    script = textwrap.dedent(
        """
        import io
        import logging

        from alembic.config import Config
        from alembic.runtime.environment import EnvironmentContext
        from alembic.script import ScriptDirectory
        from packages.workers.redis_lock import logger as lock_logger

        loggers = [logging.getLogger('puregamma.api'), lock_logger]
        assert all(not logger.disabled for logger in loggers)

        config = Config('alembic.ini', output_buffer=io.StringIO())
        migrations = ScriptDirectory.from_config(config)
        with EnvironmentContext(
            config, migrations, fn=lambda revisions, context: [], as_sql=True
        ):
            migrations.run_env()

        assert all(not logger.disabled for logger in loggers), (
            'migration logging configuration disabled existing application loggers'
        )
        output = io.StringIO()
        handler = logging.StreamHandler(output)
        logging.getLogger().addHandler(handler)
        lock_logger.warning('scheduler-lock-warning-after-migration')
        assert 'scheduler-lock-warning-after-migration' in output.getvalue()
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
