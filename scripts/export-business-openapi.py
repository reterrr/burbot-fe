"""Export the current business router with the same /api/v1 mount as the API.

Run with the backend's Python environment:
    python scripts/export-business-openapi.py ../burbot
No database connection is opened. Unrelated routers are deliberately excluded.
"""

import json
import os
from pathlib import Path
import subprocess
import sys

backend = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(backend))
os.environ.setdefault("DCKR_DATABASE_URL", "postgresql+asyncpg://localhost/burbot")

from fastapi import FastAPI  # noqa: E402
from business_layer.api.routes import router  # noqa: E402

app = FastAPI(title="Burbot Business Driver", version="0.1.0")
app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


schema = app.openapi()
schema["info"]["x-backend-revision"] = subprocess.check_output(
    ["git", "-C", str(backend), "rev-parse", "HEAD"], text=True
).strip()
target = Path(__file__).resolve().parents[1] / "openapi.json"
target.write_text(json.dumps(schema, indent=2) + "\n")
print(f"Exported {len(schema['paths'])} paths to {target}")
