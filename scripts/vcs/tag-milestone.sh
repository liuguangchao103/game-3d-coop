#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/vcs/tag-milestone.sh <tag> "<notes>"

Example:
  bash scripts/vcs/tag-milestone.sh v0.1.0 "lobby online"
EOF
}

require_clean_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "Error: working tree must be clean before tagging." >&2
    exit 1
  fi
}

validate_tag() {
  local tag="$1"
  if [[ ! "$tag" =~ ^v0\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: tag must match ^v0\\.[0-9]+\\.[0-9]+$" >&2
    exit 1
  fi
}

tag_exists_local() {
  local tag="$1"
  git rev-parse -q --verify "refs/tags/${tag}" >/dev/null 2>&1
}

tag_exists_remote() {
  local tag="$1"
  if ! git remote get-url origin >/dev/null 2>&1; then
    return 1
  fi
  git ls-remote --tags origin "refs/tags/${tag}" | grep -q .
}

main() {
  if [ "$#" -lt 2 ]; then
    usage
    exit 1
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Error: not inside a git repository." >&2
    exit 1
  fi

  local tag="$1"
  shift
  local notes="$*"

  validate_tag "$tag"
  require_clean_tree

  if tag_exists_local "$tag"; then
    echo "Error: local tag already exists: $tag" >&2
    exit 1
  fi

  if tag_exists_remote "$tag"; then
    echo "Error: remote tag already exists: $tag" >&2
    exit 1
  fi

  git tag -a "$tag" -m "$notes"
  echo "Created annotated tag: $tag"

  if git remote get-url origin >/dev/null 2>&1; then
    git push origin "$tag"
    echo "Pushed tag to origin: $tag"
  else
    echo "Warning: no origin remote configured; tag only exists locally."
  fi
}

main "$@"
