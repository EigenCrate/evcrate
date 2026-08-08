#!/usr/bin/env sh
set -eu

script_path="${1:?missing hook script path}"
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

if node_bin="$(resolve_executable   "${CODEX_NODE_BIN:-}"   node   nodejs   /usr/local/bin/node   /usr/bin/node   "$HOME/.volta/bin/node"   "$HOME/.local/bin/node"
)"; then
  "$node_bin" "$script_path"
else
  printf '{}'
  exit 0
fi
