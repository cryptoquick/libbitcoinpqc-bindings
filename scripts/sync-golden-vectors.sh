#!/usr/bin/env bash
# Regenerate golden-vector artifacts from canonical JSON fixtures.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "${ROOT}/scripts/sync-golden-vectors.py" "$@"