"""Validate cached model JSON files; preserve and re-download invalid files.

Run inside the vLLM container before starting the model. Only cached JSON files
are repaired, never model weights. HF_HOME selects the persistent cache.
"""

import json
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from huggingface_hub import hf_hub_download


def validate(path):
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError("Expected a JSON object")
    if Path(path).name == "config.json" and not config.get("model_type"):
        raise ValueError("Missing model_type in model config")


def main():
    model = sys.argv[1]
    path = hf_hub_download(repo_id=model, filename="config.json")
    snapshot = Path(path).parent
    for cached in sorted(snapshot.glob("*.json")):
        repair(model, cached, snapshot.name)


def repair(model, path, revision):
    try:
        validate(path)
    except (ValueError, UnicodeError):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = str(path) + ".invalid-" + stamp
        shutil.copyfile(path, backup)
        print("[ai-dm] Invalid JSON preserved at " + backup
              + " (" + str(Path(path).stat().st_size) + " bytes)", flush=True)
        # A migrated snapshot may contain a regular file instead of the cache
        # symlink. Refreshing the blob alone then leaves that snapshot invalid.
        with tempfile.TemporaryDirectory(prefix="ai-dm-config-") as cache:
            fresh = hf_hub_download(repo_id=model, filename=Path(path).name,
                                    revision=revision, cache_dir=cache, force_download=True)
            validate(fresh)
            shutil.copyfile(fresh, path)
        validate(path)
        print("[ai-dm] Model JSON repaired: " + str(path), flush=True)
    else:
        print("[ai-dm] Model JSON valid: " + str(path), flush=True)


if __name__ == "__main__":
    main()
