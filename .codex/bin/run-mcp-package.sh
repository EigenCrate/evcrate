#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime_env="${CODEX_RUNTIME_ENV:-$script_dir/../runtime.env}"

if [ -r "$runtime_env" ]; then
  # shellcheck disable=SC1090
  . "$runtime_env"
fi

resolve_executable() {
  for candidate in "$@"; do
    [ -n "$candidate" ] || continue
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

package="${1:-}"
if [ -z "$package" ]; then
  echo "Missing MCP package spec." >&2
  exit 64
fi
shift

if launcher="$(resolve_executable "${CODEX_NPX_BIN:-}" npx)"; then
  exec "$launcher" -y "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_PNPM_BIN:-}" pnpm)"; then
  exec "$launcher" dlx "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_BUNX_BIN:-}" bunx)"; then
  exec "$launcher" "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_YARN_BIN:-}" yarn)"; then
  exec "$launcher" dlx "$package" "$@"
fi

if launcher="$(resolve_executable "${CODEX_COREPACK_BIN:-}" corepack)"; then
  exec "$launcher" pnpm dlx "$package" "$@"
fi

echo "No supported package runner found for MCP package: $package" >&2
exit 127
