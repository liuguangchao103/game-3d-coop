#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/vcs/rollback.sh <tag>

Example:
  bash scripts/vcs/rollback.sh v0.1.0
EOF
}

require_clean_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "Error: working tree must be clean before creating rollback branch." >&2
    exit 1
  fi
}

ensure_tag() {
  local tag="$1"
  if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null 2>&1; then
    return 0
  fi

  if git remote get-url origin >/dev/null 2>&1; then
    git fetch origin "refs/tags/${tag}:refs/tags/${tag}" >/dev/null 2>&1 || true
  fi

  if ! git rev-parse -q --verify "refs/tags/${tag}" >/dev/null 2>&1; then
    echo "Error: tag not found: ${tag}" >&2
    exit 1
  fi
}

main() {
  if [ "$#" -ne 1 ]; then
    usage
    exit 1
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Error: not inside a git repository." >&2
    exit 1
  fi

  local tag="$1"
  local rollback_branch="rollback/${tag}"

  require_clean_tree
  ensure_tag "$tag"

  if git show-ref --verify --quiet "refs/heads/${rollback_branch}"; then
    echo "Error: rollback branch already exists: ${rollback_branch}" >&2
    exit 1
  fi

  git switch -c "$rollback_branch" "$tag"
  echo "Created rollback branch ${rollback_branch} from tag ${tag}"
}

main "$@"
