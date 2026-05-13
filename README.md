<div align="center">

<img src="https://raw.githubusercontent.com/MeowLynxSea/koi/refs/heads/main/assets/koi-banner.svg" alt="KOI" width="700">

<br><br>

<p>
  <samp>
    A terminal-based AI coding agent with local context engine,<br>
    skills ecosystem, and ink-wash aesthetics.
  </samp>
</p>

<br>

<a href="https://koi.ink">🌐&nbsp;&nbsp;koi.ink</a>
&nbsp;·&nbsp;
<a href="https://koi.ink/docs">📖&nbsp;&nbsp;Docs</a>
&nbsp;·&nbsp;
<a href="https://github.com/meowlynxsea/koi/releases">📦&nbsp;&nbsp;Releases</a>

<br><br>

<img src="https://img.shields.io/npm/v/@meowlynxsea/koi?style=flat-square&label=npm&colorA=0a0a0f&colorB=ff79c6" alt="npm">
<img src="https://img.shields.io/badge/license-GPL--3.0-00ff99?style=flat-square&colorA=0a0a0f&colorB=00ff99" alt="License">
<img src="https://img.shields.io/badge/runtime-Bun-fbbf24?style=flat-square&colorA=0a0a0f&colorB=fbbf24" alt="Bun">
<img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-60a5fa?style=flat-square&colorA=0a0a0f&colorB=60a5fa" alt="Platform">

</div>

---

## ⚡ Quick Start

```bash
# macOS / Linux
curl -fsSL https://koi.sh/install.sh | bash

# Windows
irm https://koi.sh/install.ps1 | iex

# From source
git clone https://github.com/meowlynxsea/koi.git && cd koi && bun install
```

Then run `koi` in any project directory.

---

## 🎨 What is KOI?

**KOI** (*Keep on Improving*) is a TUI coding agent that builds a **living semantic map** of your entire codebase — every function, every type, every relationship — stored **locally** on your machine.

Built with **OpenTUI React** on the **Bun runtime**. Every frame at 60fps. Every keystroke, instant.

<div align="center">

```
┌──────────────────────────────────────────────────────────────────────────┐
│  koi — zsh                        [Build]  [Ask]  [Plan]                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  $ koi                                                                   │
│  KOI v0.2.20 — Keep on Improving                                         │
│                                                                          │
│  Build > Analyze and optimize this React component                      │
│  [KOI] Scanning codebase...                                              │
│  [KOI] Found 3 optimization points in 2 files                            │
│  [KOI] Applied changes ✓                                                 │
│                                                                          │
│  Ask > Explain the auth flow without changing anything                  │
│  [KOI] Reading auth.ts, middleware.ts, user-store.ts...                 │
│  [KOI] The auth flow uses JWT tokens with refresh rotation...            │
│                                                                          │
│  Build > █                                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

</div>

---

## ✨ Core Features

<table>
<tr>
<td width="33%" valign="top">

### 🎭 Three Modes

Press `Tab` to switch. Each mode has its own tool allowlist and safety profile.

| Mode | Tools | Write |
|:----:|:-----:|:-----:|
| **`Build`** | All 20+ | ✅ |
| **`Ask`** | Read-only | ❌ |
| **`Plan`** | Read + Tasks | ❌ |

</td>
<td width="33%" valign="top">

### 🧠 Cat's Context Engine

Your codebase, deeply understood.

- Local embeddings (BERT, 384-dim)
- Knowledge graph with semantic links
- 12-slot working memory
- File watcher auto-sync
- Dream consolidation every 30min

</td>
<td width="33%" valign="top">

### 🧩 Skills Ecosystem

Teach KOI your conventions.

- `SKILL.md` with YAML frontmatter
- Auto-discover from `~/.config/koi/skills`
- Conditional activation by path
- Slash command invocation
- Claude-compatible format

</td>
</tr>
<tr>
<td width="33%" valign="top">

### 🔌 MCP Native

Connect any MCP server instantly.

| Transport | Protocol |
|-----------|----------|
| **stdio** | Local executable |
| **SSE** | Server-Sent Events |
| **HTTP** | REST API |
| **WebSocket** | Real-time |

</td>
<td width="33%" valign="top">

### 🖥️ Fluid TUI

A terminal UI that feels alive.

- 60fps React rendering
- Bracketed paste & image preview
- Ink-wave idle animations
- Real-time cost tracking
- Screenshot analysis

</td>
<td width="33%" valign="top">

### 🔒 Privacy First

Your code never leaves your machine.

- 100% local embeddings
- GPL-3.0 open source
- Customizable modes & prompts
- Own MCP servers & skills
- Own external editor

</td>
</tr>
</table>

---

## 🚀 Usage

### Keyboard Shortcuts

| Key | Action | Key | Action |
|:---:|:-------|:---:|:-------|
| `Shift+Tab` | Cycle modes | `Ctrl+S` | Manage sessions |
| `Ctrl+G` | External editor | `Ctrl+F` | Fork session |
| `Ctrl+V` | Paste Image | `Ctrl+C` | Cancel operation |

---

## 📂 Project Structure

```
koi/
├── src/
│   ├── agent/          # Core agent & orchestration
│   ├── cce/            # Cat's Context Engine
│   ├── cli/            # CLI parsing
│   ├── commands/       # Slash commands
│   ├── config/         # Settings
│   ├── services/       # LLM providers, costs
│   ├── skills/         # Built-in skills
│   ├── tools/          # Agent tools
│   └── tui/            # OpenTUI components
├── native/             # Native modules
├── website/            # Docs site (koi.ink)
└── examples/skills/    # Skill templates
```

---

## 🛠️ Development

```bash
git clone https://github.com/meowlynxsea/koi.git
cd koi
bun install
bun run dev        # Development mode
bun run build      # Production build
bun run check      # Type check
bun run lint       # Lint
```

---

## 📚 Documentation

Full documentation at **[koi.ink](https://koi.ink)**

<details>
<summary><b>Getting Started</b></summary>

- [Quick Start](https://koi.ink/docs/quickstart) · [Installation](https://koi.ink/docs/installation) · [First Run](https://koi.ink/docs/first-run) · [FAQ](https://koi.ink/docs/faq)

</details>

<details>
<summary><b>Core Concepts</b></summary>

- [Interface](https://koi.ink/docs/interface) · [Agent Modes](https://koi.ink/docs/modes) · [Sessions](https://koi.ink/docs/sessions) · [Tools](https://koi.ink/docs/tools) · [Keyboard](https://koi.ink/docs/keyboard)

</details>

<details>
<summary><b>Memory System (CCE)</b></summary>

- [CCE Overview](https://koi.ink/docs/cce) · [Working Memory](https://koi.ink/docs/working-memory) · [Knowledge Graph](https://koi.ink/docs/knowledge-graph) · [Boot Links](https://koi.ink/docs/boot-links) · [Semantic Search](https://koi.ink/docs/search)

</details>

<details>
<summary><b>Skills & Integrations</b></summary>

- [Using Skills](https://koi.ink/docs/skills) · [Creating Skills](https://koi.ink/docs/creating-skills) · [MCP Servers](https://koi.ink/docs/mcp) · [LLM Providers](https://koi.ink/docs/providers) · [External Editor](https://koi.ink/docs/editor)

</details>

<details>
<summary><b>Advanced</b></summary>

- [Configuration](https://koi.ink/docs/configuration) · [Subagents](https://koi.ink/docs/subagents) · [Permissions](https://koi.ink/docs/permissions) · [Context Compaction](https://koi.ink/docs/compaction)

</details>

---

<div align="center">

<br>

**[🌐 koi.ink](https://koi.ink)** · **[📖 Docs](https://koi.ink/docs)** · **[💻 GitHub](https://github.com/meowlynxsea/koi)** · **[⚖️ GPL-3.0](https://github.com/meowlynxsea/koi/blob/main/LICENSE)**

<br>

<samp><sub>Keep on Improving</sub></samp>

</div>
