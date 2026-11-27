"""Build a local POSIX Hugging Face cache referencing valid persistent weights.

Run after runpod-repair-config.py, while vLLM is stopped. Start vLLM with
HF_HUB_CACHE=/tmp/ai-dm-hf-hub afterward. No weights are deleted or downloaded.
"""
import json
import shutil
import struct
import sys
from pathlib import Path

from huggingface_hub import get_hf_file_metadata, hf_hub_download, hf_hub_url


def valid(path, expected_size):
    if not path.is_file() or path.stat().st_size != expected_size:
        return False
    try:
        with path.open("rb") as source:
            header_size = struct.unpack("<Q", source.read(8))[0]
            if not 2 <= header_size <= min(expected_size - 8, 16000000):
                return False
            header = json.loads(source.read(header_size))
            return isinstance(header, dict) and any(key != "__metadata__" for key in header)
    except (ValueError, OSError, struct.error):
        return False


def link(source, destination):
    if destination.is_symlink() and destination.resolve() == source.resolve():
        return
    if destination.exists() or destination.is_symlink():
        raise ValueError("Local cache entry already exists with different contents: " + str(destination))
    destination.symlink_to(source.resolve())


def main():
    model = sys.argv[1]
    config = Path(hf_hub_download(repo_id=model, filename="config.json"))
    snapshot = config.parent
    revision = snapshot.name
    repository = snapshot.parent.parent
    local = Path("/tmp/ai-dm-hf-hub") / repository.name
    local_snapshot = local / "snapshots" / revision
    local_snapshot.mkdir(parents=True, exist_ok=True)
    (local / "blobs").mkdir(exist_ok=True)
    (local / "refs").mkdir(exist_ok=True)
    # Keep validated JSON assets local; the Hub must not write cache metadata
    # onto the global volume, which lacks full POSIX semantics.
    for source in snapshot.glob("*.json"):
        shutil.copyfile(source, local_snapshot / source.name)
    index = json.loads((snapshot / "model.safetensors.index.json").read_text())
    for name in sorted(set(index["weight_map"].values())):
        if Path(name).name != name or not name.endswith(".safetensors"):
            raise ValueError("Unexpected shard filename")
        metadata = get_hf_file_metadata(hf_hub_url(model, name, revision=revision))
        if not metadata.size or not metadata.etag or Path(metadata.etag).name != metadata.etag:
            raise ValueError("Missing or invalid shard metadata")
        candidates = [snapshot / name, repository / "blobs" / metadata.etag]
        source = next((candidate for candidate in candidates if valid(candidate, metadata.size)), None)
        if source is None:
            raise ValueError("No valid persistent weight data for " + name)
        link(source, local / "blobs" / metadata.etag)
        link(source, local_snapshot / name)
        print("[ai-dm] Local cache reuses persistent weight: " + name, flush=True)
    (local / "refs" / "main").write_text(revision)
    print("[ai-dm] Local model cache ready: " + str(local_snapshot), flush=True)


if __name__ == "__main__":
    main()
