"""Stage pinned official Qwen FP8 weights as plain files on the global volume.

Hugging Face's POSIX cache stays on temporary local disk. Each downloaded file
is verified, copied and checked before the completion marker is written. The
BF16 cache is preserved. Only one preparer may write this destination at once.
"""
import json
import os
import shutil
import struct
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

os.environ["HF_XET_CACHE"] = "/tmp/ai-dm-fp8-xet"
os.environ["HF_XET_CHUNK_CACHE_SIZE_BYTES"] = "0"

from huggingface_hub import HfApi, hf_hub_download

MODEL = "Qwen/Qwen3.6-27B-FP8"
REVISION = "e89b16ebf1988b3d6befa7de50abc2d76f26eb09"
DESTINATION = Path("/workspace/models/qwen3.6-27b-fp8") / REVISION


def validate(path, size):
    if not path.is_file() or path.stat().st_size != size:
        return False
    try:
        if path.suffix == ".json":
            return isinstance(json.loads(path.read_text()), dict)
        if path.suffix == ".safetensors":
            with path.open("rb") as source:
                header_size = struct.unpack("<Q", source.read(8))[0]
                if not 2 <= header_size <= min(size - 8, 16000000):
                    return False
                return isinstance(json.loads(source.read(header_size)), dict)
        return size > 0
    except (ValueError, OSError, struct.error):
        return False


def prepare(file):
    name, size = file.rfilename, file.size
    if Path(name).name != name or not size:
        raise ValueError("Unexpected model asset")
    target = DESTINATION / name
    if validate(target, size):
        print("[ai-dm] FP8 asset cached: " + name, flush=True)
        return {"name": name, "size": size}
    # One local temporary cache per asset avoids global-volume rename/locking
    # problems and bounds local disk usage to two concurrent assets.
    with tempfile.TemporaryDirectory(prefix="ai-dm-fp8-") as cache:
        fresh = Path(hf_hub_download(repo_id=MODEL, filename=name,
                     revision=REVISION, cache_dir=cache))
        if not validate(fresh, size):
            raise ValueError("Downloaded asset is invalid: " + name)
        shutil.copyfile(fresh, target)
    if not validate(target, size):
        raise ValueError("Stored asset is invalid: " + name)
    print("[ai-dm] FP8 asset prepared: " + name, flush=True)
    return {"name": name, "size": size}


def main():
    DESTINATION.mkdir(parents=True, exist_ok=True)
    marker = DESTINATION / "ai-dm-complete.json"
    if marker.is_file():
        completed = json.loads(marker.read_text())
        if completed.get("model") == MODEL and completed.get("revision") == REVISION:
            for name in ("config.json", "tokenizer_config.json", "model.safetensors.index.json"):
                json.loads((DESTINATION / name).read_text())
            print("[ai-dm] Pinned FP8 model already prepared: " + str(DESTINATION), flush=True)
            return
    info = HfApi().model_info(MODEL, revision=REVISION, files_metadata=True)
    files = [f for f in info.siblings if f.rfilename.endswith((".json", ".safetensors", ".txt", ".jinja"))]
    print("[ai-dm] Preparing official FP8 assets: " + str(len(files)), flush=True)
    with ThreadPoolExecutor(max_workers=2) as workers:
        manifest = list(workers.map(prepare, files))
    marker.write_text(json.dumps({"model": MODEL, "revision": REVISION, "files": manifest}))
    print("[ai-dm] Pinned FP8 model prepared: " + str(DESTINATION), flush=True)


if __name__ == "__main__":
    main()
