# Feature plan: interactive session wrapper

**Status:** proposed — gauging interest before building  
**Scope:** resume and continue agent sessions from the LLM Deep Trace UI

---

## What this is

LLM Deep Trace currently does one thing: it reads session files written by CLI agents (Claude Code, Codex, Kimi, Gemini CLI, etc.) and presents them as a structured, browsable UI. It's read-only.

This feature would make it bidirectional. You'd be able to:

- Open any session in the UI
- Type a new message in a chat input at the bottom
- Have that message routed to the underlying CLI agent
- See the response stream back into the UI in real time — just like a normal conversation

The CLI and the web UI become two equal interfaces to the same session. The JSONL file is the shared state — whatever you send from one side is visible to the other. You can continue a session from the terminal in the morning, check in from the web UI on your phone at lunch, and switch back to the terminal in the afternoon. Full context throughout.

---

## The use cases we're imagining

**1. Remote access**  
You're away from your machine, on your phone or another device. You started a Claude Code session earlier. You want to check in, ask a follow-up, or steer the agent in a new direction. No SSH, no terminal emulator — just the web UI over Tailscale or any network.

**2. Sharing a live session with a teammate**  
Someone else can open the session URL and watch the conversation unfold, or with the right permissions, contribute messages. No screen-share needed.

**3. Reviewing and continuing in one place**  
You read back through a long session, understand where the agent left off, and continue — without switching to a terminal and re-establishing context.

**4. A single interface across all agents**  
You have sessions from Claude Code, Codex, and Kimi. Today you'd need to resume each in its own CLI tool. With this feature, you'd send messages to any of them from the same UI.

---

## What it would not be

- A replacement for the terminal or CLI workflow. If you prefer the CLI, nothing changes.
- A hosted LLM service. LLM Deep Trace stays local. It calls *your* CLI agents on *your* machine — no API keys pass through any server we control.
- A full IDE or agent orchestration platform. That's a different product.

---

## How sync works

The JSONL session file is the single source of truth. Both the terminal and the web UI read and write to it — they don't talk to each other directly.

**Terminal → UI (already works today)**  
You type in the terminal, the CLI writes the exchange to the JSONL, LLM Deep Trace's live tail picks it up and renders it in real time. No changes needed.

**UI → terminal**  
You type in the web UI, the server spawns the CLI with `--resume`, it writes the response to the same JSONL, live tail renders it on both sides. The terminal session doesn't receive the message interactively — but since the history file is shared, if you continue from the terminal afterwards the full context is there.

You can alternate between the two freely. The sync is real but indirect: both interfaces read and write the same file, and each sees what the other produced.

**The one conflict scenario:** if the CLI is mid-response (actively writing) and you send from the UI at the same time, two processes would write to the same file concurrently. The fix: the UI checks whether the session is marked active (this is already tracked) and blocks sends while it is.

## How it would work technically

Each supported CLI has a way to resume a session non-interactively:

| Agent | Resume mechanism |
|---|---|
| Claude Code | `claude --resume <session-id> --print "<message>"` |
| Codex | `codex --session <session-id> "<message>"` |
| Kimi | Similar flag (TBD) |
| Gemini CLI | Checkpoint/resume API (TBD) |

When you send a message from the UI:

1. `POST /api/sessions/[sessionKey]/send` receives the message
2. The server spawns the appropriate CLI with `--resume` and the message
3. The CLI writes its response to the same JSONL session file
4. The existing SSE live-tail picks it up and renders it in real time — in the web UI and in any terminal watching the file
5. No new streaming infrastructure needed — just the CLI doing what it already does

Process model: spawn-and-wait per message (simple, ~1s overhead per turn) or keep-alive stdin pipe (faster, more complex). We'd start with spawn-and-wait.

---

## What we're unsure about

- **Is the web UI actually better than the terminal for continuation?** The CLI is fast and familiar. The overhead of opening a browser might not be worth it for developers who live in the terminal.
- **Multi-user safety.** If two people send messages to the same session concurrently, the agent gets confused. We'd need basic locking or a queue.
- **Auth.** Right now LLM Deep Trace has no auth. Interactive mode changes the risk profile — someone sending messages to your agent is different from someone reading your session history.
- **Codex and Kimi flags.** We've validated Claude Code's `--resume --print` mode. The others need verification.

---

## What we'd build first (MVP scope)

- A chat input bar at the bottom of the session panel (only visible for supported agents)
- Single-turn send: type → send → response appears via live tail
- Session lock while waiting (no overlapping sends)
- Visual indicator that a session is in "interactive mode"
- Claude Code only, to start

Later: multi-agent support, keep-alive process mode, streamed tokens, team access controls.

---

## Is this something you'd use?

If this sounds useful to your workflow, let us know:

- **React to this issue** with 👍 if you'd use it
- **Comment** with your actual use case — remote access, team review, something else?
- **Open a new issue** if there's a specific agent or workflow we haven't considered

The more concrete feedback we get, the faster (and more correctly) we can build it.

If you'd rather this stays a pure viewer and never gets a chat input, that's equally useful to know.

---

## Related

- [README](../README.md) — what LLM Deep Trace currently does  
- Live tail: already implemented — new messages from interactive sessions appear automatically
