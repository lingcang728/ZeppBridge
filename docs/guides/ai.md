# Handing your data to AI

[简体中文](ai.zh-CN.md)

ZeppBridge can hand your workouts and health records to AI in two ways:

| | Send to AI (copy and paste) | MCP (direct connection) |
|---|---|---|
| For | AI on the web: ChatGPT, Claude, Gemini, Kimi, Doubao, DeepSeek, Grok | AI tools installed on your computer: Claude Code, Codex, Claude Desktop and others |
| How the data gets there | The app writes the data you picked into a `.md` file and you paste it into the chat | The AI queries the local library itself, as needed; health data is read-only |
| Setup | None | Connect once in Settings |

Both read the same local database, so you can mix them: work out a training plan with a web AI, then send it to your watch from ZeppBridge.

## 1. Send to AI (copy and paste)

Open **Send to AI** from the sidebar. The page has three parts: the data you will hand over on the left, which AI it goes to in the middle, and this time's question on the right.

1. **Pick the data.** Each card on the left is one kind of data (sleep, workouts, heart rate…).
   - Click a card to flip it and change how far back it goes, or use "Pick specific days" / "Pick specific workouts".
   - Flick a card upwards to leave that kind out; "Add a kind" brings it back.
   - The "Personal profile" card holds a few lines about you: goals, injuries, how things have been lately. It stays on this computer and goes along every time.
2. **Ask.** Type on the right, or tap a ready-made question: Sleep, This week, A workout, Next week.
3. **Choose the AI and your plan.** In the middle, choose who gets it and whether you use the free or the paid tier. The app estimates the size in tokens; free tiers usually read about 30,000 tokens, and it warns you to shorten the range or drop a kind when it is too much.
4. **Send.** Hold the ring in the middle until it fills a full circle: the app writes the `.md` file to the clipboard and opens the AI site.
   - Press Ctrl+V (⌘V on a Mac) in the chat box and send. The right side turns into a receipt holding the same file: if pasting does not work, drag it into the chat instead. "Copy opening line again" and "Open … again" are there too.
   - To skip that step, turn on **Settings › AI tools › Hand off to AI automatically** (Windows only): once the site opens, the app pastes and sends for you; press Esc to stop at any time.

To see exactly what goes out first, click the small line under the ring for **Check before sending**: every kind of data, attachments and options, and the full prompt.

### Your questions are kept

Every hand-off saves its question and data choices as a task. Click the task name for **Saved tasks**:

- Click one to use it again; pin, rename or delete it. Tasks untouched for 30 days move to "Earlier", they are not deleted.
- If you changed the wording, the old versions are under "Earlier wordings".
- "Export .zbprompt" saves a question as a file you can give a friend; they use "Import .zbprompt" to add it (none of your data goes with it).
- "N round trips" is the round-trip log: what you sent each time and the plan that came back.

## 2. Have AI plan your training and send it to your watch

1. Tap **Next week** (or write "plan my next few weeks") and send it to the AI.
2. Go back and forth: times, intensity, the days you are busy. **The AI only gives the final plan once you say "finalize" or "send the plan"**. The plan is a JSON block in its reply; you don't need to read it.
3. Copy the AI's final reply, go back to ZeppBridge and click **Receive final plan** on the right. The app reads the clipboard and checks the plan; anything wrong is pointed out right there.
4. Click **See the week** to look at each day; when it looks right, hold **Hold · send to watch** (0.6 seconds). The plan reaches the watch through the Zepp App.

Worth knowing:

- **The watch takes four sports**: running (outdoor, treadmill, track), cycling (outdoor, indoor), pool swimming and open-water swimming. The watch asks for the sub-type again when you start the workout. Walking, hiking, strength, yoga and the like cannot be sent to the watch; the AI tells you so while you plan.
- Plans start today or later and reach at most 56 days ahead. Days inside the plan's date range without a workout count as rest days, and any earlier plan on those days is cleared.
- Running paces are per kilometre; each step is a time (20 min) or a distance (400 m), at least 50 m per step.
- Sleep and rest advice stays on this computer and is not sent to the watch.
- If you change a few days after sending, the week view offers to re-sync to the watch. Every plan you have sent is in the week view's **Archive**.

## 3. Coach notes

**Coach notes** hold the long-term facts any AI should know: injuries, routine, goals, preferences. Open them from the "Personal profile" card ("Coach notes →").

- Write one yourself, for example "My left knee hurts on runs over 15 km; I swim every Wednesday evening."
- An AI connected over MCP can propose a note. It shows up in the "An AI wants to remember" card on the overview and under "Waiting for you" in coach notes; it only counts once you click **Remember**, and a note you turned down cannot be proposed again.
- Notes go along with every hand-off. "Export Markdown" saves them to the "ZeppBridge AI" folder on your desktop for use elsewhere.

## 4. MCP: connect an AI tool directly

MCP lets AI tools on your computer query ZeppBridge's local database directly, with no copy and paste. `zeppbridge-mcp` is installed with the app (and since 3.1.1 so is the command-line tool `zeppbridge-cli`); there is nothing extra to download.

Open **Settings › AI tools › Connect an AI tool**:

- **Claude Code** and **Codex**: the button copies a few commands; paste them into a terminal. They register the MCP server and install ZeppBridge's coaching skill, `zepp-coach`.
- **Claude Desktop**: the button saves `ZeppBridge.mcpb`; double-click it to install.
- **Other clients**: "Copy this and ask your AI" hands that AI a description so it can tell you where its config goes; "Copy just the config snippet" gives you the JSON with the path filled in.
- ChatGPT on the web cannot reach an MCP server on your computer; use Send to AI above.

Once connected:

- The AI can read workouts, metrics, sleep, food, life events, data health, a training-and-recovery overview and your profile. **Health data is read-only**; nothing listens on a port and nothing goes online.
- The AI can **draft** a training plan. The draft shows up on the Send to AI page; you accept it, check it, and send it to the watch.
- For the AI to send plans to the watch itself, turn on **Let AI publish training plans directly** in Settings. It never clears existing plans.
- Notes the AI proposes go to the coach-notes inbox and only count once you confirm them.

The command-line tool's path is also in Settings › AI tools, with a copy button. For flags, exit codes, config examples and the full list of tools, see [CLI and MCP](../reference/cli-and-mcp.md).

## 5. Questions you can copy

With copy and paste:

- "How has my sleep been over the last two weeks? What is the one thing most worth changing?"
- "Is this week's training load about right? Compared with the four weeks before, is my recovery getting better or worse?"
- "Look at the long run I picked: how much did my heart rate drift, and what could I change about pacing and fuelling?"
- "I'm running a half marathon on 7 December, aiming for 1:45. Let's talk through the next five weeks first; give me the plan when I say finalize."

With MCP:

- "Look at my last 28 days of training and recovery and draft next week's plan."
- "Compare my resting heart rate and HRV this year with the same weeks last year."
- "Add 'my left knee hurts on runs over 15 km' to my coach notes."

## 6. Privacy

- Copy and paste: your data leaves this computer only when you paste it into the chat. Account and device identifiers are removed when the file is written, and precise GPS is left out by default. The file is plain Markdown; check it in Check before sending, or open and read it yourself first. After that it is handled under that AI provider's rules.
- MCP: an AI tool on your computer reads the data, and that tool sends what it read to the model behind it. ZeppBridge itself only goes online to publish a training plan, and only with your permission.

See also [Security and privacy](../reference/security-and-privacy.md) and the [FAQ](faq.md).
