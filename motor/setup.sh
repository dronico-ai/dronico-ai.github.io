#!/usr/bin/env bash
# Prepare a fresh workspace to build presentations: Python packages, the Kokoro voice model
# (~350 MB, downloaded once into motor/.cache, which git ignores) and a check for ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"

python3 -m pip install -q --break-system-packages kokoro-onnx pillow numpy 2>/dev/null \
  || python3 -m pip install -q kokoro-onnx pillow numpy

mkdir -p .cache/models
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [ ! -s ".cache/models/$f" ]; then
    echo "Downloading $f"
    curl -sSfL -o ".cache/models/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
  fi
done

command -v ffmpeg >/dev/null || { echo "ffmpeg is required (for example: apt-get install ffmpeg)"; exit 1; }
python3 -c "import kokoro_onnx, PIL, numpy" && echo "Ready."
