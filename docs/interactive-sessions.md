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

### Why spawn-and-wait doesn't work

The obvious first approach — spawning `claude --resume <id> --print "<message>"` per message — turns out to be wrong for real workflows.

`--print` is a scripting mode. It's single-shot, it doesn't carry flags like `--dangerously-skip-permissions`, and it behaves differently from an interactive session for multi-step tool call chains. Anyone who runs Claude Code with custom flags would find it broken.

### The correct model: persistent process + stdin pipe

The right architecture keeps the CLI process alive between messages and writes new messages to its stdin:

```
UI sends message
    ↓
server writes to process stdin
    ↓
CLI runs normally — all flags, all behavior intact
    ↓
JSONL written as usual
    ↓
live tail picks it up → renders in both UI and terminal
```

When you start an interactive session in the UI, you configure the spawn command:

```
claude --dangerously-skip-permissions
claude --resume <previous-id> --dangerously-skip-permissions
codex --session <id>
```

The process stays alive until you explicitly close it or it finishes. If the server restarts, the session ends (we'd surface this clearly rather than silently losing messages).

This is effectively a thin stdin pipe with a structured renderer on top. The CLI runs exactly as it would in your terminal.

### Process lifecycle

| Event | Behaviour |
|---|---|
| User opens interactive mode | Spawn CLI process, keep stdin open |
| User sends message | Write to stdin, wait for JSONL activity to settle |
| CLI finishes responding | UI unlocks for next message |
| User closes session / navigates away | Graceful SIGTERM to CLI process |
| Server restart | Session ends; user must re-open |

One process per session, no concurrent sends — enforced by the UI lock while the CLI is active.

---

## What we're unsure about

- **Is the web UI actually better than the terminal for continuation?** The CLI is fast and familiar. The overhead of opening a browser might not be worth it for developers who live in the terminal. The answer is probably "yes, for remote access and mobile" and "no, if you're already at your machine."
- **Process reconnection.** If your browser tab closes mid-session, the CLI process keeps running on the server. We need a clean way to re-attach to it — or to surface that it's still active when you reopen the session.
- **Auth.** Right now LLM Deep Trace has no auth. Interactive mode changes the risk profile significantly — someone sending messages to your agent with `--dangerously-skip-permissions` is a different threat model from someone reading session history. This needs to be solved before any networked deployment.
- **Spawn command configuration.** Users need to specify their own flags. This implies a per-agent config (or per-session config) that stores the spawn command. Where does that live? How is it edited?
- **Detecting when the CLI is "done" responding.** With the JSONL live tail we watch for new writes, but knowing when the agent has truly finished (vs. mid-tool-call pause) requires either a timeout heuristic or a sentinel in the JSONL format.

---

## What we'd build first (MVP scope)

- Configurable spawn command per agent (stored in local config)
- A "start session" button that spawns the CLI process and keeps it alive
- A chat input bar at the bottom of the session panel
- Write-to-stdin on send, UI lock while the CLI is responding
- Visual indicator: session is active / responding / idle
- Graceful close when done
- Claude Code only, to start

Later: process re-attach after tab close, multi-agent support, auth layer, mobile-optimised input.

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
