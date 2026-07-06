"""pytest configuration for the repo-root tests/ directory.

tests/test_dashboard.py does `from main import app` and `from models import
...` — those are bare module names that only resolve when backend/ is on
sys.path. Without this file, running the command in the test's own
docstring ("pytest tests/test_dashboard.py -v" from the repo root) fails
with ModuleNotFoundError before a single test runs. This inserts backend/
onto sys.path once, for the whole test session.
"""

import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
BACKEND_DIR = os.path.normpath(BACKEND_DIR)

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
