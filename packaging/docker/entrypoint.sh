#!/bin/sh
# Turn the two failures that actually happen into sentences somebody can act
# on, then get out of the way.
#
# Everything else is passed straight through, so `docker run ... zeppbridge-cli
# sync --json` behaves exactly like the same command on a host. In particular
# exit codes are the container's exit codes: the CLI's contract (4 means "busy,
# retry later", not "failed") only survives if nothing here rewrites them.
set -eu

data_dir="${ZEPPBRIDGE_DATA_DIR:-/data}"

# 1. The volume is not writable by this user. This is the uid mismatch on a
#    bind mount, and the raw error ("Permission denied") points at the
#    database rather than at the mount.
if ! mkdir -p "$data_dir" 2>/dev/null || [ ! -w "$data_dir" ]; then
  cat >&2 <<MSG
zeppbridge: $data_dir is not writable by uid $(id -u).

This is almost always a bind mount owned by a different user. Either run the
container as the owner of the directory:

  docker run --user "\$(id -u):\$(id -g)" ...

or hand it a named volume instead of a host path. See docs/guides/docker.md.
MSG
  exit 6
fi

# 2. No account connected. The CLI already exits 3 for this, but from inside a
#    container "sign in with the desktop app" is not actionable on its own —
#    the token still has to get in here afterwards.
if [ ! -f "$data_dir/auth.json" ]; then
  case "${1:-}" in
    # status and the read-only commands are legitimate on an empty library;
    # only warn for the ones that need the cloud.
    zeppbridge-cli)
      case "${2:-}" in
        sync)
          cat >&2 <<MSG
zeppbridge: no account connected ($data_dir/auth.json is missing).

The container cannot sign in — that needs a browser window. Connect the account
once with the desktop app, then give this container the resulting credentials:

  1. copy auth.json from the desktop install's data directory into $data_dir
  2. pass the App Token as ZEPPBRIDGE_APP_TOKEN
     (or set ZEPPBRIDGE_CREDENTIAL_STORE=file and copy credentials.json too)

docs/guides/docker.md walks through both.
MSG
          ;;
      esac
      ;;
  esac
fi

exec "$@"
