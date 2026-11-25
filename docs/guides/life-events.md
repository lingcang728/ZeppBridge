# Life events

[简体中文](life-events.zh-CN.md)

Life events are notes on your calendar — a cold, a trip, a training block — so
you can see them next to your data.

## Where to find them

Open the **Journal** card on Overview (the workout list zoomed out to the
year level), then **Eras & life events**. **Log an
event** adds one; **New era** adds a named stretch of time. Click any entry to
edit or delete it.

Each event has a title, a category (Health & recovery, Travel, Routine &
lifestyle, Training & races, Other) and a single date or a date range that
includes both ends. **Still ongoing** leaves the end date open until you edit
it. Notes are optional.

## Eras

Tick **Mark as an era** to give a stretch of time a name, such as a marathon
build-up. Every trend chart shades that stretch.

## On trend charts

Trend cards show the events that overlap the chart's dates. Highlighted points
mark days with an event; click one to open it. Clicking an ordinary point starts
a new event on that date.

## AI and export

AI tools connected through MCP can read your life events and eras alongside your
data (`list_life_events`, and the training context). They can also add or edit
events; every such change is logged and can be undone in the app. See
[CLI and MCP](../reference/cli-and-mcp.md).

GPX and FIT exports are workout formats and do not carry life events.

## Where they are kept

Events stay in the local database and its snapshots. Syncing, retention cleanup
and reprocessing never remove them. Restoring a snapshot brings back the events
it contained.
