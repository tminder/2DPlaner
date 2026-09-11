#!/usr/bin/env bash
set -euo pipefail

# S-032: this repo has six independently-deployed targets and no CI/CD -- deploying has
# always meant a human (or an assisting session) remembering, per relevant change, which of
# the six to scp and separately verifying byte counts by hand. Nothing caught a skipped
# step. This script replaces that with one command: it diffs each target's own local path
# against its own last-deployed commit (tracked in .deploy-state, committed to the repo so
# the record survives across machines/sessions -- not a local-only cache), deploys exactly
# the files that changed, byte-verifies each one against the live server, and only then
# advances that target's own recorded commit. No auto-trigger, no CI, no secrets beyond the
# same SSH key every manual deploy this project has ever done already used -- still run by
# hand, just no longer relying on memory for "which of the six actually needs it."
#
# Usage:
#   scripts/deploy.sh                 deploy every target with pending changes
#   scripts/deploy.sh --dry-run       show what would be deployed, touch nothing
#   scripts/deploy.sh --target=docs   deploy (or dry-run) just one target
#   scripts/deploy.sh --init-state    bootstrap .deploy-state at the current commit for
#                                     every target -- a "start tracking from here" baseline,
#                                     not a retroactive claim that history before this was
#                                     actually in sync. Only ever needed once, or if the
#                                     state file is ever lost.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$REPO_ROOT/.deploy-state"
SSH_KEY="$HOME/.ssh/planagonia_deploy"
SSH_HOST="server21.hostfactory.ch"
SSH_PORT="52839"
SSH_USER="ftpplanag9be338"
# -n (redirect ssh's own stdin from /dev/null): without it, ssh happily inherits and
# consumes whatever stdin the calling shell has open -- inside the per-file `while read`
# loop below (fed via a here-string), that meant each ssh call silently ate the *loop's*
# own remaining input, truncating a multi-file deploy after just its first file. Found live
# by testing a real 3-file deploy and seeing only one file actually go out.
SSH="ssh -n -i $SSH_KEY -p $SSH_PORT $SSH_USER@$SSH_HOST"
SCP="scp -i $SSH_KEY -P $SSH_PORT"

# name:local_path:remote_path -- local_path is relative to the repo root; remote_path is
# the matching live directory. Confirmed directly against the live server's own layout, not
# assumed from memory alone -- storage-service-php is genuinely two separate live roots
# (httpdocs + app), not one.
TARGETS=(
  "docs:docs:/httpdocs/app"
  "site-docs:site-docs:/httpdocs/docs"
  "profile:profile:/httpdocs/profile"
  "homepage:homepage:/httpdocs"
  "storage-service-php-httpdocs:storage-service-php/httpdocs:/subdomains/api/httpdocs"
  "storage-service-php-app:storage-service-php/app:/subdomains/api/app"
)

DRY_RUN=false
ONLY_TARGET=""
INIT_STATE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --init-state) INIT_STATE=true ;;
    --target=*) ONLY_TARGET="${arg#--target=}" ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

get_state() {
  grep -m1 "^$1=" "$STATE_FILE" 2>/dev/null | cut -d= -f2 || true
}

set_state() {
  local name="$1" sha="$2"
  touch "$STATE_FILE"
  if grep -q "^$name=" "$STATE_FILE" 2>/dev/null; then
    sed -i "s#^$name=.*#$name=$sha#" "$STATE_FILE"
  else
    echo "$name=$sha" >> "$STATE_FILE"
  fi
}

HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

if $INIT_STATE; then
  for entry in "${TARGETS[@]}"; do
    IFS=: read -r name _ _ <<< "$entry"
    set_state "$name" "$HEAD_SHA"
  done
  echo "Initialized .deploy-state: every target marked deployed as of $HEAD_SHA."
  echo "This is a starting baseline, not a retroactive audit -- confirm each target's live"
  echo "copy genuinely matches this commit before trusting it going forward."
  exit 0
fi

ANY_PENDING=false
ANY_ERROR=false

for entry in "${TARGETS[@]}"; do
  IFS=: read -r name local_path remote_path <<< "$entry"
  if [ -n "$ONLY_TARGET" ] && [ "$ONLY_TARGET" != "$name" ]; then continue; fi

  last_sha="$(get_state "$name")"
  if [ -z "$last_sha" ]; then
    echo "== $name: no recorded last-deployed commit -- run scripts/deploy.sh --init-state first =="
    ANY_ERROR=true
    continue
  fi
  if [ "$last_sha" = "$HEAD_SHA" ]; then
    continue
  fi

  if ! git -C "$REPO_ROOT" cat-file -e "$last_sha" 2>/dev/null; then
    echo "== $name: recorded commit ${last_sha:0:8} doesn't exist in this repo -- STOPPING, not deploying =="
    echo "   (a corrupted/stale .deploy-state entry must never be silently treated as \"nothing changed\")"
    ANY_ERROR=true
    continue
  fi
  if ! changed_files="$(git -C "$REPO_ROOT" diff --name-only "$last_sha" "$HEAD_SHA" -- "$local_path")"; then
    echo "== $name: git diff itself failed -- STOPPING, not deploying =="
    ANY_ERROR=true
    continue
  fi
  if [ -z "$changed_files" ]; then
    # The target's own path had no changes even though HEAD moved -- advance its marker so
    # a later, unrelated change doesn't get diffed against a stale, now-irrelevant SHA.
    set_state "$name" "$HEAD_SHA"
    continue
  fi

  ANY_PENDING=true
  file_count="$(echo "$changed_files" | grep -c . || true)"
  echo "== $name: $file_count file(s) changed since ${last_sha:0:8} =="
  echo "$changed_files" | sed 's/^/   /'

  if $DRY_RUN; then continue; fi

  ok=true
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    rel="${f#"$local_path"/}"
    if [ ! -f "$REPO_ROOT/$f" ]; then
      echo "   deleted locally, not removed on the server automatically: $f"
      continue
    fi
    remote_file="$remote_path/$rel"
    remote_dir="$(dirname "$remote_file")"
    $SSH "mkdir -p '$remote_dir'" || { ok=false; break; }
    local_bytes=$(wc -c < "$REPO_ROOT/$f" | tr -d '[:space:]')
    $SCP "$REPO_ROOT/$f" "$SSH_USER@$SSH_HOST:$remote_file" || { ok=false; break; }
    remote_bytes=$($SSH "wc -c < '$remote_file'" 2>/dev/null | tr -d '[:space:]')
    if [ "$local_bytes" != "$remote_bytes" ]; then
      echo "   BYTE MISMATCH for $f: local=$local_bytes remote=$remote_bytes -- stopping here"
      ok=false
      break
    fi
    echo "   deployed + verified: $f ($local_bytes bytes)"
  done <<< "$changed_files"

  if $ok; then
    set_state "$name" "$HEAD_SHA"
    echo "== $name: up to date at ${HEAD_SHA:0:8} =="
  else
    ANY_ERROR=true
    echo "== $name: STOPPED partway -- not marked deployed, re-run after fixing =="
  fi
done

if ! $ANY_PENDING && ! $ANY_ERROR; then
  echo "Nothing to deploy -- every target already matches its own last-deployed commit."
fi

if $ANY_ERROR; then
  echo "One or more targets need attention -- see STOPPED lines above." >&2
  exit 1
fi

# .deploy-state is the whole point -- if its own update here never gets committed, the next
# session/machine reads a stale record and either re-deploys something already live or (worse)
# trusts a "last deployed" marker that's now behind reality. A loud reminder, not a silent
# assumption someone will remember on their own -- the exact failure mode this script exists
# to close.
if ! git -C "$REPO_ROOT" diff --quiet -- "$STATE_FILE" 2>/dev/null || \
   ! git -C "$REPO_ROOT" ls-files --error-unmatch "$STATE_FILE" >/dev/null 2>&1; then
  echo ""
  echo "Remember to commit .deploy-state -- it's the record of what's actually live."
fi
