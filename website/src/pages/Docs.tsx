import { useState } from 'react'
import ScrollReveal from '../components/ScrollReveal'
import { BookOpen, Terminal, Settings, Cpu, Puzzle, Globe, GitBranch, MessageCircle, ChevronDown } from 'lucide-react'

const sidebarGroups = [
  {
    title: 'GETTING STARTED',
    items: [
      { id: 'quickstart', label: 'Quick Start', icon: BookOpen },
      { id: 'installation', label: 'Installation', icon: Terminal },
      { id: 'faq', label: 'FAQ', icon: MessageCircle },
    ],
  },
  {
    title: 'USING KOI',
    items: [
      { id: 'modes', label: 'Agent Modes', icon: Cpu },
      { id: 'cce', label: "Cat's Context Engine", icon: Globe },
      { id: 'skills', label: 'Skills', icon: Puzzle },
      { id: 'mcp', label: 'MCP Servers', icon: Settings },
      { id: 'commands', label: 'Commands', icon: Terminal },
    ],
  },
  {
    title: 'ADVANCED',
    items: [
      { id: 'config', label: 'Configuration', icon: Settings },
      { id: 'sessions', label: 'Session Management', icon: GitBranch },
      { id: 'subagents', label: 'Subagents', icon: Cpu },
    ],
  },
]

const allItems = sidebarGroups.flatMap(g => g.items)

const docsContent: Record<string, { title: string; content: React.ReactNode }> = {
  quickstart: {
    title: 'Quick Start',
    content: (
      <div className="space-y-6">
        <p>
          KOI is a TUI coding agent that runs in your terminal. It understands your codebase
          through local vector embeddings and helps you write, refactor, and debug code.
        </p>

        <h3 className="text-xl font-semibold text-terminal-text mt-8">1. Install KOI</h3>
        <div className="code-block">
          <code className="text-terminal-accent">bun install -g @meowlynxsea/koi</code>
        </div>

        <h3 className="text-xl font-semibold text-terminal-text mt-8">2. Navigate to your project</h3>
        <div className="code-block">
          <code className="text-terminal-cyan">cd /path/to/your-project</code>
        </div>

        <h3 className="text-xl font-semibold text-terminal-text mt-8">3. Run KOI</h3>
        <div className="code-block">
          <code className="text-terminal-green">koi</code>
        </div>

        <p className="text-terminal-dim">
          KOI will launch in your terminal with the TUI interface. Start typing natural language
          instructions or use the <code className="text-terminal-accent">/</code> prefix for commands.
        </p>
      </div>
    ),
  },
  installation: {
    title: 'Installation',
    content: (
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-terminal-text">Prerequisites</h3>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li>Bun runtime (v1.3.11 or later)</li>
          <li>A terminal that supports Unicode and 256 colors</li>
          <li>Node.js compatibility layer (for MCP servers)</li>
        </ul>

        <h3 className="text-xl font-semibold text-terminal-text mt-8">Global Install</h3>
        <div className="code-block">
          <code>bun install -g @meowlynxsea/koi</code>
        </div>

        <h3 className="text-xl font-semibold text-terminal-text mt-8">Local Install (per project)</h3>
        <div className="code-block">
          <code>bun add -D @meowlynxsea/koi</code>
        </div>
        <p className="text-terminal-dim">Then use <code>npx koi</code> or add a script to package.json.</p>

        <h3 className="text-xl font-semibold text-terminal-text mt-8">Configuration</h3>
        <p>
          On first run, KOI creates a config directory at <code className="text-terminal-accent">~/.config/koi/</code>.
          Edit <code className="text-terminal-accent">settings.json</code> to customize:
        </p>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li>Default model and API keys</li>
          <li>External editor preference</li>
          <li>Skill directories</li>
          <li>MCP server configurations</li>
        </ul>
      </div>
    ),
  },
  faq: {
    title: 'FAQ',
    content: (
      <div className="space-y-8">
        {[
          {
            q: 'What makes KOI different from Claude Code or Aider?',
            a: 'KOI features a unique TUI built with OpenTUI React, local Cat\'s Context Engine for deep codebase understanding, three agent modes (Build/Ask/Plan), and a Skills ecosystem. Everything runs locally with your code never leaving your machine.',
          },
          {
            q: 'Does KOI send my code to the cloud?',
            a: 'No. The Cat\'s Context Engine uses a local embedding model and vector database. Only AI inference requests (prompts) go to your configured LLM provider. Your codebase stays on your machine.',
          },
          {
            q: 'What LLM providers are supported?',
            a: 'KOI supports any OpenAI-compatible API, Anthropic Claude, and local models via Ollama. You can configure multiple models and switch between them.',
          },
          {
            q: 'Can I use KOI with any programming language?',
            a: 'Yes. KOI is language-agnostic. It reads and understands code in any language through semantic analysis and tree-sitter parsing.',
          },
          {
            q: 'How does the Skills system work?',
            a: 'Skills are Markdown files with YAML frontmatter that define reusable capabilities. Place them in ~/.config/koi/skills or .claude/skills in your project. KOI auto-discovers and activates them based on path patterns.',
          },
        ].map(({ q, a }) => (
          <div key={q}>
            <h3 className="text-lg font-semibold text-terminal-text mb-2">{q}</h3>
            <p className="text-terminal-dim leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    ),
  },
  modes: {
    title: 'Agent Modes',
    content: (
      <div className="space-y-6">
        <p>KOI operates in three modes, each providing a different level of tool access and safety:</p>

        <div className="space-y-6 mt-6">
          <div className="border border-terminal-border/50 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-terminal-green/20 text-terminal-green">Build</span>
              <span className="text-sm font-medium text-terminal-text">Full Development Mode</span>
            </div>
            <p className="text-sm text-terminal-dim">
              All tools available: read, write, edit, bash, webfetch, task management, and MCP tools.
              Use this for active development, refactoring, and debugging.
            </p>
          </div>

          <div className="border border-terminal-border/50 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-terminal-warning/20 text-terminal-warning">Ask</span>
              <span className="text-sm font-medium text-terminal-text">Read-Only Mode</span>
            </div>
            <p className="text-sm text-terminal-dim">
              Only read-only tools: read, grep, glob, ls, webfetch. Perfect for code review,
              understanding unfamiliar code, and asking questions without risk of modification.
            </p>
          </div>

          <div className="border border-terminal-border/50 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-terminal-info/20 text-terminal-info">Plan</span>
              <span className="text-sm font-medium text-terminal-text">Planning Mode</span>
            </div>
            <p className="text-sm text-terminal-dim">
              Read-only + task management tools. The agent cannot modify files or execute commands.
              Ideal for architecture discussions, migration planning, and risk assessment.
            </p>
          </div>
        </div>

        <p className="text-terminal-dim mt-4">
          Press <code className="text-terminal-accent">Tab</code> in the TUI to cycle between modes,
          or use <code className="text-terminal-accent">/mode</code> command.
        </p>
      </div>
    ),
  },
  cce: {
    title: "Cat's Context Engine",
    content: (
      <div className="space-y-6">
        <p>
          The Cat's Context Engine (CCE) is KOI's local knowledge system. It builds a semantic graph
          of your codebase using local embeddings, enabling deep understanding without sending code to external services.
        </p>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Architecture</h3>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li><strong className="text-terminal-text">Embedding Service</strong> — Local transformer model (Hugging Face) for code embeddings</li>
          <li><strong className="text-terminal-text">Graph Service</strong> — Semantic relationships between files, functions, and symbols</li>
          <li><strong className="text-terminal-text">Search Indexer</strong> — Hybrid keyword + vector search</li>
          <li><strong className="text-terminal-text">Working Memory</strong> — Short-term context for the current session</li>
          <li><strong className="text-terminal-text">Dream Consolidation</strong> — Periodic background knowledge organization</li>
        </ul>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Enabling CCE</h3>
        <div className="code-block">
          <code># In KOI TUI, press /cce to open the CCE modal</code>
        </div>
        <p className="text-terminal-dim">
          First initialization downloads the embedding model (~100MB). After that, CCE works fully offline.
        </p>
      </div>
    ),
  },
  skills: {
    title: 'Skills',
    content: (
      <div className="space-y-6">
        <p>
          Skills extend KOI's capabilities through declarative Markdown files. They define
          prompts, tool preferences, and activation conditions.
        </p>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Skill Format</h3>
        <div className="code-block overflow-x-auto">
          <pre className="text-xs text-terminal-dim">
{`---
name: React Best Practices
description: Enforce React coding standards
pathPatterns:
  - "**/*.tsx"
  - "**/*.jsx"
---

When writing React components:
- Use functional components with hooks
- Prefer composition over inheritance
- Include PropTypes or TypeScript interfaces`}
          </pre>
        </div>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Skill Directories</h3>
        <p>KOI searches for skills in the following locations (in order):</p>
        <ol className="list-decimal list-inside space-y-2 text-terminal-dim">
          <li><code className="text-terminal-accent">~/.config/koi/skills/</code> — User-global skills</li>
          <li><code className="text-terminal-accent">~/.claude/skills/</code> — Claude-compatible skills</li>
          <li><code className="text-terminal-accent">./.claude/skills/</code> — Project-local skills</li>
          <li>Built-in bundled skills</li>
        </ol>
      </div>
    ),
  },
  mcp: {
    title: 'MCP Servers',
    content: (
      <div className="space-y-6">
        <p>
          KOI supports the Model Context Protocol (MCP), allowing you to connect external tools
          and data sources as first-class agent capabilities.
        </p>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Supported Transports</h3>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li>stdio (local executable)</li>
          <li>SSE (Server-Sent Events)</li>
          <li>HTTP POST</li>
          <li>WebSocket</li>
        </ul>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Configuration</h3>
        <p className="text-terminal-dim">
          Add MCP servers in your KOI settings. Each server provides tools that KOI can invoke
          alongside its built-in capabilities. MCP tools respect the current agent mode (Build/Ask/Plan).
        </p>
      </div>
    ),
  },
  commands: {
    title: 'Commands',
    content: (
      <div className="space-y-4">
        <p>Press <code className="text-terminal-accent">/</code> in the TUI to open the command palette.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-terminal-border/50">
                <th className="text-left py-2 px-3 text-terminal-text">Command</th>
                <th className="text-left py-2 px-3 text-terminal-text">Description</th>
              </tr>
            </thead>
            <tbody className="text-terminal-dim">
              {[
                ['/exit', 'Quit KOI'],
                ['/mode', 'Cycle agent mode (Build/Ask/Plan)'],
                ['/model', 'Change LLM model'],
                ['/sessions', 'Manage sessions'],
                ['/fork', 'Fork current session'],
                ['/snapshot', 'Create session snapshot'],
                ['/skills', 'View active skills'],
                ['/mcp', 'Manage MCP connections'],
                ['/cce', 'Open CCE settings'],
                ['/yolo', 'Toggle YOLO mode (auto-approve)'],
                ['/editor', 'Set external editor'],
              ].map(([cmd, desc]) => (
                <tr key={cmd} className="border-b border-terminal-border/20">
                  <td className="py-2 px-3 font-mono text-terminal-accent">{cmd}</td>
                  <td className="py-2 px-3">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  config: {
    title: 'Configuration',
    content: (
      <div className="space-y-6">
        <p>KOI stores configuration in <code className="text-terminal-accent">~/.config/koi/</code>:</p>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li><code className="text-terminal-accent">settings.json</code> — Main configuration</li>
          <li><code className="text-terminal-accent">sessions/</code> — Session storage</li>
          <li><code className="text-terminal-accent">skills/</code> — User skills</li>
          <li><code className="text-terminal-accent">cce/</code> — CCE database</li>
        </ul>
      </div>
    ),
  },
  sessions: {
    title: 'Session Management',
    content: (
      <div className="space-y-6">
        <p>KOI sessions form a tree structure, allowing you to fork, snapshot, and navigate between conversation branches.</p>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Features</h3>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li><strong className="text-terminal-text">Fork</strong> — Create a branch from any point in the conversation</li>
          <li><strong className="text-terminal-text">Snapshot</strong> — Save a named checkpoint</li>
          <li><strong className="text-terminal-text">Rename</strong> — Organize sessions with meaningful names</li>
          <li><strong className="text-terminal-text">Tree View</strong> — Visualize session history as a tree</li>
        </ul>
      </div>
    ),
  },
  subagents: {
    title: 'Subagents',
    content: (
      <div className="space-y-6">
        <p>
          KOI can spawn subagents to handle parallel tasks. Each subagent runs in its own context
          with isolated tool access and can report back to the parent session.
        </p>

        <h3 className="text-xl font-semibold text-terminal-text mt-6">Use Cases</h3>
        <ul className="list-disc list-inside space-y-2 text-terminal-dim">
          <li>Parallel file analysis across multiple directories</li>
          <li>Background research while continuing the main conversation</li>
          <li>Multi-step refactoring with checkpoint verification</li>
          <li>Cross-language project analysis</li>
        </ul>

        <p className="text-terminal-dim mt-4">
          Subagents are managed through the Task Manager and Monitor Registry,
          providing visibility into running and completed tasks.
        </p>
      </div>
    ),
  },
}

export default function Docs() {
  const [activeSection, setActiveSection] = useState('quickstart')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const content = docsContent[activeSection]

  return (
    <div className="min-h-screen pt-16">
      <div className="max-w-7xl mx-auto">
        <div className="flex">
          {/* Sidebar - desktop */}
          <aside className="hidden lg:block w-64 shrink-0 border-r border-terminal-border/30 min-h-[calc(100vh-4rem)] sticky top-16">
            <div className="py-6 px-4">
              {sidebarGroups.map(group => (
                <div key={group.title} className="mb-6">
                  <h3 className="text-[10px] font-semibold text-terminal-dim/60 uppercase tracking-wider mb-2 px-2">
                    {group.title}
                  </h3>
                  <ul className="space-y-0.5">
                    {group.items.map(item => (
                      <li key={item.id}>
                        <button
                          onClick={() => setActiveSection(item.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                            activeSection === item.id
                              ? 'bg-terminal-accent/10 text-terminal-accent'
                              : 'text-terminal-dim hover:text-terminal-text hover:bg-terminal-panel'
                          }`}
                        >
                          <item.icon className="w-3.5 h-3.5" />
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0 px-4 py-6 lg:px-12 lg:py-10">
            {/* Mobile section selector */}
            <div className="lg:hidden mb-6">
              <div className="relative">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-terminal-panel border border-terminal-border/50 rounded-lg text-sm text-terminal-text"
                >
                  <span className="flex items-center gap-2">
                    {(() => {
                      const item = allItems.find(i => i.id === activeSection)
                      const Icon = item?.icon || BookOpen
                      return <Icon className="w-4 h-4 text-terminal-accent" />
                    })()}
                    {allItems.find(i => i.id === activeSection)?.label}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {mobileMenuOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-terminal-panel border border-terminal-border/50 rounded-lg shadow-xl z-20 max-h-[60vh] overflow-y-auto">
                    {sidebarGroups.map(group => (
                      <div key={group.title} className="py-2">
                        <div className="px-4 py-1 text-[10px] font-semibold text-terminal-dim/60 uppercase tracking-wider">
                          {group.title}
                        </div>
                        {group.items.map(item => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveSection(item.id)
                              setMobileMenuOpen(false)
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                              activeSection === item.id
                                ? 'text-terminal-accent bg-terminal-accent/5'
                                : 'text-terminal-dim hover:text-terminal-text'
                            }`}
                          >
                            <item.icon className="w-3.5 h-3.5" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ScrollReveal key={activeSection}>
              <h1 className="text-2xl lg:text-3xl font-bold text-terminal-text mb-8">{content.title}</h1>
              <div className="prose prose-invert max-w-none">
                {content.content}
              </div>
            </ScrollReveal>
          </main>
        </div>
      </div>
    </div>
  )
}
