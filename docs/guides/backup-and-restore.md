# Backups, restore, and complete history

This page answers three questions that are easy to confuse: is my data backed
up, can I get it back, and when is it actually true that "this machine holds a
complete copy".

[简体中文](backup-and-restore.zh-CN.md)

## The three kinds of "export" are not the same thing

| | What it is | Who can read it | What it is for |
|---|---|---|---|
| **JSON / CSV / GPX** | An interchange file for the selected range | Any tool | Handing data to other software, analysing it yourself |
| **Database snapshot** | A complete copy of the whole `zepp.db` | ZeppBridge only | Disaster recovery |
| **AI hand-off package** | Material you picked, with redaction applied | The model you chose | Getting an AI to explain your data |

**Only a snapshot can put the database back the way it was.** However complete
an exported JSON looks, it contains no raw payloads, no provenance and no
coverage ledger; importing it back would give you a crippled database.

## Snapshots

Settings → "Database snapshots and restore".

- Uses SQLite's Backup API rather than copying the live database file. Copying a
  SQLite file that has an open WAL usually produces a backup that will not open.
- Every snapshot carries a manifest: creation time, app version, schema version,
  normalizer revision, sample coverage range, per-table row counts, byte size
  and SHA-256.
- `integrity_check` runs immediately after creation. If it fails, the
  half-finished file is deleted and an error is raised — a broken backup that
  *looks* usable is worse than no backup at all.
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
  sync no longer prunes history by the retention window.
- **History backfill** covers the left-hand half — fetching records from before
  you installed ZeppBridge.

Only with both in place is this machine really a complete copy.

### The coverage ledger

Backfill splits the range into calendar months and keeps a ledger. Each chunk
has exactly four possible outcomes:

| Status | Meaning |
|---|---|
| Written | Fetched, and stored locally |
| Nothing from the cloud | Requested, and Zepp said clearly that it has no data for that period. **This is not a failure** |
| Pending | Not its turn yet |
| Failed | Can be retried |

The interface deliberately does not flatten these four into one percentage.
Once it becomes a progress bar, "do I actually have my 2023 data" has no answer
— and that is the only question worth asking.

**Only when every chunk in the ledger has a conclusion will the interface and
the documentation say "a complete local copy".** Until then the wording is
always "a local copy of the range that synced successfully".

### Backfill can be interrupted

Stop whenever you like. "Continue backfill" picks up from the chunks that have
no conclusion yet. It does not start over, and it does not create duplicates.

### When retention and backfill conflict

If the backfill range reaches outside your local retention window and long-term
archiving is off, the app stops the backfill up front and tells you to either
turn archiving on or lengthen the retention.

Fetching three years of history and having the next successful sync delete it is
the most trust-destroying thing this app could do — so that combination is
blocked before it starts, rather than explained afterwards.

### How much space it will take

The estimate is given per stream, using **the rate your own local data actually
accumulates** (bytes of stored payloads ÷ days observed), not a hard-coded
constant. Someone who runs daily and someone who runs twice a year should not
get the same answer.

Streams with fewer than seven days of local samples are labelled explicitly as
"not enough samples, not counted" — better than inventing a rate and multiplying
it by three years.

If the free space cannot hold the estimated backfill, the backfill does not
start.
