from pathlib import Path
import os
import sys

import uvicorn


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)