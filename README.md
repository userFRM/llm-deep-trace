<div align="center">
  <img src="public/banner-v2.png" width="900" alt="llm-deep-trace" />
  <br/><br/>
  <p>Browse, search, and analyze every conversation your agents have ever had.<br/>All local. No accounts. No cloud.</p>
  <br/>
  <a href="https://www.npmjs.com/package/llm-deep-trace"><img src="https://img.shields.io/npm/v/llm-deep-trace?color=9B72EF&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/llm-deep-trace"><img src="https://img.shields.io/npm/dm/llm-deep-trace?color=9B72EF&label=downloads" alt="npm downloads" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-9B72EF" alt="node >=18" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-9B72EF" alt="MIT license" /></a>
</div>

---

## What it is

You use coding agents. They leave behind session logs. Those logs are gold — decisions made, code written, reasoning traced, subagents spawned. But they're just JSONL files buried in `~/.claude/` or `~/.kimi/`.

llm-deep-trace turns those files into a proper interface: threaded conversations, subagent trees, a conversation map, analytics, live tail, and full-text search across everything.

It runs entirely on your machine. It reads your local files. That's it.

---

## Supported agents

| Agent | Sessions | Subagents | Notes |
|---|---|---|---|
| **Claude Code** (Anthropic) | ✓ | ✓ | Full support incl. agent teams |
| **Codex** | ✓ | — | |
| **Kimi** | ✓ | — | Think-block rendering |
| **Gemini CLI** (Google) | ✓ | — | |
| **OpenClaw** | ✓ | ✓ | |
| **Cursor** | ✓ | — | Partial — some metadata missing |
| **Aider** | ✓ | — | Chat history format |
| **Continue.dev** | ✓ | — | |
| **GitHub Copilot** | ✓ | — | |
| **Factory Droid** | ✓ | — | |
| **OpenCode** | ✓ | — | |

---

## Quick start

```bash
git clone https://github.com/userFRM/llm-deep-trace
cd llm-deep-trace
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No config needed — it finds your sessions automatically.

**Requirements:** Node.js 18+

---

## Features

**Session browser**
- All providers in one sidebar, grouped and searchable
- Parent sessions show subagent count; click to expand the tree
- Expand all / collapse all, archive sessions you don't need

**Conversation view**
- User messages as bubbles, assistant responses as cards
- Tool call blocks collapsed by default, color-coded by type (bash, edit, web, browser, message, spawn)
- Thinking blocks (Claude extended thinking, Kimi reasoning) as expandable cards
- Inline image thumbnails with click-to-lightbox
- Ctrl+F find with match counter and highlights
- Skip preamble toggle — jump straight to the actual work

**Subagent tree + conversation map**
- React Flow visualization of the full session graph
- Click any node to navigate to that session
- Reset view, zoom capped at 75%, padding scales with graph size

**Live tail**
- Follow an active session in real time (3s poll)
- Green pulsing indicator while tailing

**Analytics**
- Sessions per day, stacked by provider
- Provider breakdown, top tools used, token totals
- Session length distribution

**Search**
- Full-text search across all sessions and all providers

---

## Running remotely

llm-deep-trace reads files from the machine it runs on. If your agent sessions live on a remote server (VPS, home lab, cloud box), you have a few options:

**SSH tunnel** — forward the port to your local machine:
```bash
ssh -L 3000:localhost:3000 user@your-server
# then open http://localhost:3000 locally
```

**Tailscale** — start the server bound to your Tailscale IP:
```bash
npx next start --hostname <tailscale-ip> --port 3000
# accessible at http://<tailscale-ip>:3000 from any device on your Tailscale network
```

**VPS / cloud** — same as SSH tunnel, or bind to a private network interface. Do not expose port 3000 to the public internet — there's no auth.

In all cases: the app runs on the machine where your `~/.claude/`, `~/.kimi/`, etc. directories live.

---

## How to ship it (for contributors)

Right now: clone and run locally. That's the intended workflow for a local devtool.

Planned:
- `npm install -g llm-deep-trace` + `llm-deep-trace` CLI command
- Homebrew tap for Mac users who prefer it
- Docker one-liner for the server crowd

PRs welcome on any of these.

---

## Limitations

Being straight with you:

- **Read-only.** Browse and analyze — you can't resume or fork sessions from here yet. jazzyalex/agent-sessions does this for Codex and Claude Code.
- **Local files only.** Reads `~/.claude/`, `~/.kimi/`, etc. on the machine it runs on. Remote sessions not supported.
- **Cursor / Aider / Continue** support is partial. Session formats vary and some metadata is missing.
- **No mobile UI.** Built for desktop browsers.
- **Requires Node.js 18+.** Not a zero-dep install.

---

## vs alternatives

[**jazzyalex/agent-sessions**](https://github.com/jazzyalex/agent-sessions) — the closest thing. Native macOS Swift app (macOS 14+), v2.11.2, actively maintained. Supports 7 agents: Codex, Claude Code, Gemini, Copilot, Factory Droid, OpenCode, OpenClaw. Has unified search, analytics, rate limits tracker, image browser, Homebrew install, and — notably — **session resume** (reopen a session directly in your terminal). If you're on a Mac and want a native app, it's worth looking at.

Where llm-deep-trace is different:
- **Cross-platform** — runs on Mac, Linux, Windows; anything with Node.js. Not macOS-only.
- **More agents** — 11 vs 7 (adds Kimi, Aider, Continue.dev, Cursor)
- **Subagent tree** — React Flow visualization of parent → child agent relationships
- **Conversation map** — full session graph, click-to-navigate
- **Web-based** — no install, no signing, no notarization; just `npm run dev`

What they have that we don't (yet):
- Session resume (reopen past sessions in the terminal)
- Real-time rate limits tracker
- Native performance + Homebrew cask + auto-updates

---

## Tech stack

Next.js 16 · React 19 · TypeScript · React Flow · Zustand · highlight.js · Marked

---

## License

MIT
