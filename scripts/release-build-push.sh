#!/usr/bin/env sh
set -eu

VERSION="${1:-}"
IMAGE="${IMAGE_NAME:-studion79/task-app}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 vYYYY-MM-DD-N"
  exit 1
fi

if [ ! -f ".dockerignore" ] || [ ! -f ".gitignore" ]; then
  echo "[release] missing .dockerignore or .gitignore"
  exit 1
fi

if [ -d ".next" ] || [ -f ".DS_Store" ] || [ -f "tsconfig.tsbuildinfo" ]; then
  echo "[release] refusing to run with local build artifacts present (.next/.DS_Store/tsbuildinfo)."
  echo "[release] cleanup: rm -rf .next .DS_Store tsconfig.tsbuildinfo"
  exit 1
fi

echo "[release] running checks..."
npm run release:check

echo "[release] building and pushing $IMAGE:$VERSION (+ latest)"
docker buildx build \
  --progress=plain \
  --platform linux/amd64,linux/arm64 \
  --build-arg APP_VERSION="$VERSION" \
  -t "$IMAGE:$VERSION" \
  -t "$IMAGE:latest" \
  --push .

echo "[release] manifest:"
docker buildx imagetools inspect "$IMAGE:$VERSION"

echo "[release] done"
