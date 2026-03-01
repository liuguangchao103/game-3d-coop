#!/usr/bin/env bash

set -euo pipefail

OWNER=""
REPO=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/vcs/configure-branch-protection.sh --owner <github-owner> --repo <repo-name>
EOF
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
    echo "Error: --owner and --repo are required." >&2
    usage
    exit 1
  fi
}

main() {
  parse_args "$@"

  if ! command -v gh >/dev/null 2>&1; then
    echo "Error: gh command is required." >&2
    exit 1
  fi

  if ! gh auth status >/dev/null 2>&1; then
    echo "Error: gh is not authenticated. Run 'gh auth login' first." >&2
    exit 1
  fi

  if ! gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
    echo "Error: GitHub repository not found: ${OWNER}/${REPO}" >&2
    exit 1
  fi

  local output=""
  if ! output="$(gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/${OWNER}/${REPO}/branches/main/protection" \
    --input - \
    2>&1 <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["CI / ci"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
)"; then
    if echo "$output" | grep -q "Upgrade to GitHub Pro"; then
      echo "Error: branch protection for private repositories is not available on the current GitHub plan." >&2
      echo "Action: make the repository public or upgrade the account plan, then rerun npm run vcs:protect." >&2
    else
      echo "$output" >&2
    fi
    exit 1
  fi

  echo "Branch protection configured for ${OWNER}/${REPO}:main"
}

main "$@"
