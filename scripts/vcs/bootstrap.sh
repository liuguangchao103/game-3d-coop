#!/usr/bin/env bash

set -euo pipefail

OWNER=""
REPO=""
VISIBILITY="private"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/vcs/bootstrap.sh --owner <github-owner> --repo <repo-name> [--visibility private|public|internal]
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command not found: $cmd" >&2
    exit 1
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --owner)
        OWNER="${2:-}"
        shift 2
        ;;
      --repo)
        REPO="${2:-}"
        shift 2
        ;;
      --visibility)
        VISIBILITY="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Error: unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
    echo "Error: --owner and --repo are required" >&2
    usage
    exit 1
  fi

  case "$VISIBILITY" in
    private|public|internal) ;;
    *)
      echo "Error: --visibility must be private, public, or internal" >&2
      exit 1
      ;;
  esac
}

ensure_repo() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git init -b main
    echo "Initialized local git repository on branch main."
  fi

  if ! git show-ref --verify --quiet refs/heads/main; then
    git switch -c main
  else
    git switch main >/dev/null 2>&1 || true
  fi
}

ensure_gitignore() {
  if [ -f .gitignore ]; then
    return
  fi

  cat > .gitignore <<'EOF'
node_modules/
dist/
build/
coverage/
.cache/
.turbo/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.env
.env.*
!.env.example
.DS_Store
EOF
  echo "Created default .gitignore."
}

ensure_baseline_commit() {
  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    git add -A
    if git diff --cached --quiet; then
      git commit --allow-empty -m "chore: bootstrap project"
    else
      git commit -m "chore: bootstrap project"
    fi
    echo "Created baseline commit: chore: bootstrap project"
  fi
}

bind_or_create_remote() {
  local full_repo="${OWNER}/${REPO}"
  local remote_url="git@github.com:${OWNER}/${REPO}.git"

  if ! gh auth status >/dev/null 2>&1; then
    echo "Error: gh is not authenticated. Run 'gh auth login' first." >&2
    exit 1
  fi

  if git remote get-url origin >/dev/null 2>&1; then
    echo "Remote 'origin' already exists."
    git push -u origin main
    return
  fi

  if gh repo view "$full_repo" >/dev/null 2>&1; then
    git remote add origin "$remote_url"
    echo "Bound existing GitHub repository: $full_repo"
    git push -u origin main
    return
  fi

  gh repo create "$full_repo" "--${VISIBILITY}" --source . --remote origin --push
  echo "Created and pushed to GitHub repository: $full_repo"
}

configure_local_defaults() {
  git config merge.ff false
}

main() {
  require_cmd git
  require_cmd gh
  parse_args "$@"
  ensure_repo
  ensure_gitignore
  ensure_baseline_commit
  bind_or_create_remote
  configure_local_defaults
  echo "Bootstrap complete."
}

main "$@"
