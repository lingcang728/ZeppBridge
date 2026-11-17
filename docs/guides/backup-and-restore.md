# Backups, restore, and complete history

This page answers three questions that are easy to confuse: is my data backed
up, can I get it back, and when is it actually true that "this machine holds a
complete copy".

[简体中文](backup-and-restore.zh-CN.md)

## The kinds of "export" are not the same thing

| | What it is | Who can read it | What it is for |
|---|---|---|---|
| **JSON / CSV / GPX / FIT** | An interchange file for the selected range or workout | Any tool | Handing data to other software, analysing it yourself |
| **Take everything with you** | One JSON of everything you wrote in the app: ratings, notes, shoes, races, plans, AI tasks, letters | Any tool | Keeping your own entries |
| **Database snapshot** | A complete copy of the whole `zepp.db` | ZeppBridge only | Disaster recovery |
| **AI hand-off package** | Material you picked, with redaction applied | The model you chose | Getting an AI to explain your data |

**Only a snapshot can put the database back the way it was.** However complete
an exported JSON looks, it contains no raw payloads, no provenance and no
coverage ledger; importing it back would give you a crippled database.

## Snapshots

**Settings → Advanced and maintenance → Backup and restore.**

- Uses SQLite's Backup API rather than copying the live database file. Copying a
  SQLite file that has an open WAL usually produces a backup that will not open.
- Every snapshot carries a manifest: creation time, app version, schema version,
  normalizer revision, sample coverage range, per-table row counts, byte size
  and SHA-256.
- `integrity_check` runs immediately after creation. If it fails, the
  half-finished file is deleted and an error is raised.
- You can re-verify at any time: does the file exist, is the size right, does
  the SHA-256 match, is the database itself intact.
- **One is taken automatically before every database upgrade.** Those automatic
  snapshots are kept on a rolling basis, five at a time. Ones you created
  yourself, and any you marked "keep", are never cleaned up automatically.

All snapshots stay in `data/backups/` on this machine and are never uploaded.
They sit on the same drive as `zepp.db` — **if what you are worried about is
drive failure, copy a snapshot somewhere else yourself.**

## Restoring

Restoring happens in two steps, deliberately.

1. **Queue it.** You pick a snapshot; the app runs every check and shows a
   preview: row counts per table in the snapshot versus the current database,
   with any negative difference spelled out as "this many rows fewer after
   restoring". There is no vague "some data may be lost" here.
2. **It runs at the next launch.** The actual file replacement happens as the
   app starts, before any database connection is opened — the only moment an
   atomic swap is possible. Nothing changes in the session you are in.

You can cancel a queued restore at any time.

Before replacing anything, the current database is saved as a rollback point.
If any step of the replacement fails, the original database is restored
automatically.

### Version compatibility

| Snapshot schema | Result |
|---|---|
| Older than this build | Restores, then upgrades automatically at launch |
| Same as this build | Restores directly |
| Newer than this build | **Refused outright, and the current database is left untouched** |

Reading a newer schema with an older build gives you, at best, a database that
will not open — at worst, wrong values read out of it. So there is no "I
understand the risk, continue" option here. Update the app instead.

### Restoring does not re-fetch from the cloud

A restore only makes the database look like the snapshot. If the preview says
some records will be lost and you still need them, run a sync after the restore
finishes.

## Complete history

Data from before you installed ZeppBridge does not appear on its own.
"Long-term archive" and "history backfill" cover the two halves of the timeline:

- **Long-term archive** covers the right-hand half — from today on, a successful
  sync no longer prunes history by the retention window. You turn it on by
  picking **Forever** under **Archive and storage → Keep data for**.
- **History backfill** covers the left-hand half — fetching records from before
  you installed ZeppBridge.

Only with both in place is this machine really a complete copy.

### The coverage ledger

Backfill splits the range into calendar months and keeps a ledger. Each chunk
has exactly four possible outcomes:

| Status | Meaning |
|---|---|
| Saved | Fetched, and stored locally |
| Empty in cloud | Requested, and Zepp said clearly that it has no data for that period. **This is not a failure** |
| To do | Not its turn yet |
| Failed | Can be retried |

The interface shows these four counts rather than one percentage, so you can
tell whether a given year is really there.

**Only when every chunk in the ledger has a conclusion will the interface and
the documentation say "a complete local copy".** Until then the wording is
always "a local copy of the range that synced successfully".

### Backfill can be interrupted

Stop whenever you like. **Continue backfilling** picks up from the chunks that have
no conclusion yet. It does not start over, and it does not create duplicates.

### When retention and backfill conflict

If the backfill range reaches outside your local retention window and long-term
archiving is off, the app stops the backfill up front and tells you to either
pick **Forever** or lengthen the retention.

### How much space it will take

The estimate is given per stream, using **the rate your own local data actually
accumulates** (bytes of stored payloads ÷ days observed), not a hard-coded
constant. Someone who runs daily and someone who runs twice a year should not
get the same answer.

Streams with fewer than seven days of local samples are labelled "not enough
samples, not counted". When the whole library is that new, the app falls back
to a built-in rough estimate and says so.

If the free space cannot hold the estimated backfill, the backfill does not
start. With less than 300 MB free, backfills longer than 90 days are refused.
