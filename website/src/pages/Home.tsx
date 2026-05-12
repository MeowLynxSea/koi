import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Zap, Puzzle, Link2, ChevronRight } from 'lucide-react'
import Terminal from '../components/Terminal'
import type { TerminalLine } from '../components/Terminal'
import GlowButton from '../components/GlowButton'
import CopyButton from '../components/CopyButton'
import FeatureCard from '../components/FeatureCard'
import ScrollReveal from '../components/ScrollReveal'
import TestimonialsChat from '../components/TestimonialsChat'
import GetStartedModal from '../components/GetStartedModal'
import { Link } from 'react-router-dom'
import { detectPlatform, getInstallCommand } from '../lib/platform'

const heroTerminalLines: TerminalLine[] = [
  { text: 'koi', type: 'command' },
  { text: 'KOI v0.2.0 — Keep on Improving', type: 'output', delay: 300 },
  { text: '', type: 'output', delay: 100 },
  { text: 'Analyze and optimize this React component', type: 'prompt', mode: 'build', delay: 400 },
  { text: 'Scanning codebase...', type: 'agent', delay: 600 },
  { text: 'Found 3 optimization points in 2 files', type: 'agent', delay: 500 },
  { text: 'Applied changes ✓', type: 'agent', delay: 400 },
  { text: '', type: 'output', delay: 200 },
  { text: 'Explain the auth flow without changing anything', type: 'prompt', mode: 'ask', delay: 600 },
  { text: 'Reading auth.ts, middleware.ts, user-store.ts...', type: 'agent', delay: 500 },
  { text: 'The auth flow uses JWT tokens with refresh rotation...', type: 'agent', delay: 400 },
]

const cceTerminalLines: TerminalLine[] = [
  { text: 'koi', type: 'command' },
  { text: 'CCE initialized — semantic graph loaded', type: 'output', delay: 300 },
  { text: '', type: 'output', delay: 100 },
  { text: 'How does the payment module relate to user auth?', type: 'prompt', mode: 'ask', delay: 500 },
  { text: 'Querying semantic graph...', type: 'agent', delay: 500 },
  { text: 'Found 4 cross-module relationships:', type: 'agent', delay: 400 },
  { text: '  • payment/gateway.ts → auth/verifyToken (dependency)', type: 'output', delay: 200 },
  { text: '  • auth/session.ts → payment/record.ts (shared User type)', type: 'output', delay: 200 },
  { text: '  • 2 more via associative network...', type: 'output', delay: 200 },
  { text: '[CCE] File watcher: detected 3 new files, indexing...', type: 'agent', delay: 300 },
]

const tuiTerminalLines: TerminalLine[] = [
  { text: 'koi --model claude-sonnet-4', type: 'command' },
  { text: 'Model switched to claude-sonnet-4', type: 'output', delay: 300 },
  { text: 'Cost tracker: $0.0012 / session', type: 'output', delay: 200 },
  { text: '', type: 'output', delay: 100 },
  { text: 'Add image upload with preview', type: 'prompt', mode: 'build', delay: 400 },
  { text: '[PASTE] Image detected (234KB PNG)', type: 'agent', delay: 300 },
  { text: 'Image preview rendered in TUI ✓', type: 'agent', delay: 300 },
  { text: 'Analyzing screenshot... 3 UI components identified', type: 'agent', delay: 500 },
  { text: 'Writing upload handler + preview modal', type: 'agent', delay: 400 },
  { text: 'Cost: +$0.0034 | Total: $0.0046', type: 'output', delay: 200 },
]

const privacyTerminalLines: TerminalLine[] = [
  { text: 'cat ~/.config/koi/settings.json', type: 'command' },
  { text: '{', type: 'output', delay: 100 },
  { text: '  "model": "ollama/llama3.2",', type: 'output', delay: 100 },
  { text: '  "provider": "local",', type: 'output', delay: 100 },
  { text: '  "cce": { "enabled": true, "local": true },', type: 'output', delay: 100 },
  { text: '  "skills": ["~/.config/koi/skills"],', type: 'output', delay: 100 },
  { text: '  "mcpServers": ["./mcp.json"],', type: 'output', delay: 100 },
  { text: '  "yolo": false,', type: 'output', delay: 100 },
  { text: '  "externalEditor": "nvim"', type: 'output', delay: 100 },
  { text: '}', type: 'output', delay: 100 },
  { text: '', type: 'output', delay: 100 },
  { text: 'koi --mode plan --yolo', type: 'command' },
  { text: 'Agent: Plan mode | YOLO: ON | Editor: nvim', type: 'output', delay: 200 },
  { text: 'All settings under your control ✓', type: 'agent', delay: 200 },
]

const features = [
  {
    icon: <Zap className="w-6 h-6 text-terminal-warning" />,
    title: 'Three Modes, One Mind',
    description: 'Build for full development power, Ask for safe read-only exploration, Plan for zero-risk architecture design. Switch instantly with Tab. Each mode has its own tool allowlist and prompt prefix.',
  },
  {
    icon: <Puzzle className="w-6 h-6 text-terminal-info" />,
    title: 'Skills Ecosystem',
    description: 'Open SKILL.md format with YAML frontmatter. Auto-discover from ~/.config/koi/skills, ~/.claude/skills, or project-local .claude/skills. Conditional activation by path patterns. Teach KOI your conventions.',
  },
  {
    icon: <Link2 className="w-6 h-6 text-terminal-cyan" />,
    title: 'MCP Native',
    description: 'Native Model Context Protocol support with 4 transports (stdio, SSE, HTTP, WebSocket). Connect any MCP server in seconds. Tools respect your current agent mode for safety.',
  },
]



export default function Home() {
  const [modalOpen, setModalOpen] = useState(false)
  const [installCmd, setInstallCmd] = useState('')

  useEffect(() => {
    const platform = detectPlatform()
    const cmd = getInstallCommand(window.location.origin, platform)
    setInstallCmd(cmd)
  }, [])

  return (
    <main className="relative">
      <GetStartedModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

      {/* ─── HERO SECTION ─── */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 px-4">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
              >
                <h1 className="font-mono text-7xl sm:text-8xl lg:text-9xl font-bold tracking-tighter mb-4">
                  <span className="text-gradient">KOI</span>
                </h1>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-xl sm:text-2xl text-terminal-dim font-light mb-2"
              >
                Keep on Improving
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.35 }}
                className="text-sm sm:text-base text-terminal-dim/70 max-w-md mx-auto lg:mx-0 mb-8"
              >
                A TUI coding agent with local context engine, skills ecosystem,
                and ink-wash aesthetics. Your codebase, deeply understood.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
              >
                <GlowButton onClick={() => setModalOpen(true)} className="animate-glow-pulse">
                  <Zap className="w-4 h-4" />
                  Get Started
                </GlowButton>

                {installCmd && (
                  <div className="flex items-center gap-3 bg-terminal-panel/80 border border-terminal-border/50 rounded-lg px-4 py-2.5">
                    <span className="text-terminal-green font-mono text-sm">&gt;_</span>
                    <code className="font-mono text-sm text-terminal-text">{installCmd}</code>
                    <CopyButton text={installCmd} />
                  </div>
                )}
              </motion.div>
            </div>

            {/* Right: Terminal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="hidden lg:block"
            >
              <Terminal lines={heroTerminalLines} loop loopDelay={6000} className="w-full" />
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-terminal-border/50 flex items-start justify-center p-1.5"
          >
            <div className="w-1 h-2 rounded-full bg-terminal-dim/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── FEATURES SECTION (3 cards) ─── */}
      <section className="relative py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-terminal-text mb-4">
              Your Codebase,{' '}
              <span className="text-gradient-accent">Deeply Understood</span>
            </h2>
            <p className="text-terminal-dim max-w-2xl mx-auto">
              KOI goes beyond surface-level file reading. It builds a living semantic map of your entire project.
            </p>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── CCE SHOWCASE SECTION ─── */}
      <section className="relative py-24 px-4 bg-terminal-bg">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-terminal-text mb-6 leading-tight">
                  Your Codebase,
                  <br />
                  <span className="text-gradient">Remembered</span>
                </h2>
                <p className="text-terminal-dim mb-6 leading-relaxed max-w-lg">
                  The Cat's Context Engine doesn't just read files — it builds a living semantic graph
                  of your entire project. Every function, every type, every relationship is mapped,
                  indexed, and remembered locally on your machine.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Local vector embeddings — zero cloud dependency',
                    'Working memory & associative networks',
                    'Dream consolidation every 30 minutes',
                    'File watcher auto-syncs as you code',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-terminal-dim">
                      <ChevronRight className="w-4 h-4 text-terminal-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/docs"
                  className="inline-flex items-center gap-2 text-terminal-accent hover:text-terminal-info transition-colors text-sm font-medium group"
                >
                  Learn about CCE
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={0.2}>
              <Terminal
                lines={cceTerminalLines}
                loop
                loopDelay={6000}
                promptMode="ask"
                className="w-full"
              />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── TUI SHOWCASE SECTION ─── */}
      <section className="relative py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left" className="order-2 lg:order-1">
              <Terminal
                lines={tuiTerminalLines}
                loop
                loopDelay={6000}
                promptMode="build"
                className="w-full"
              />
            </ScrollReveal>

            <ScrollReveal direction="right" delay={0.2} className="order-1 lg:order-2">
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-terminal-text mb-6 leading-tight">
                  Fluid. Fast.
                  <br />
                  <span className="text-gradient">Beautiful.</span>
                </h2>
                <p className="text-terminal-dim mb-6 leading-relaxed max-w-lg">
                  Built with OpenTUI React on the Bun runtime. Every frame renders at 60fps.
                  Every keystroke responds instantly. Bracketed paste, image preview,
                  ink-wave idle animations — a terminal interface that feels alive.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    '60fps React-based terminal rendering',
                    'Bracketed paste & inline image preview',
                    'Ink-wave idle animations & shimmer effects',
                    'Real-time cost tracking per session',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-terminal-dim">
                      <ChevronRight className="w-4 h-4 text-terminal-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/docs"
                  className="inline-flex items-center gap-2 text-terminal-accent hover:text-terminal-info transition-colors text-sm font-medium group"
                >
                  See the interface
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── PRIVACY SHOWCASE SECTION ─── */}
      <section className="relative py-24 px-4 bg-terminal-bg">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal direction="left">
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-terminal-text mb-6 leading-tight">
                  Your Code.
                  <br />
                  <span className="text-gradient">Your Rules.</span>
                </h2>
                <p className="text-terminal-dim mb-6 leading-relaxed max-w-lg">
                  GPL-3.0 licensed open source. Local embedding model means your code never leaves
                  your machine. Every behavior is customizable — from agent modes and system prompts
                  to MCP servers, skills, and external editors.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Local embedding — code never touches the cloud',
                    'GPL-3.0 open source, fully auditable',
                    'Customizable modes, prompts, and tool allowlists',
                    'Your own MCP servers, skills, and editors',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-terminal-dim">
                      <ChevronRight className="w-4 h-4 text-terminal-accent shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/docs"
                  className="inline-flex items-center gap-2 text-terminal-accent hover:text-terminal-info transition-colors text-sm font-medium group"
                >
                  Read about privacy
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={0.2}>
              <Terminal
                lines={privacyTerminalLines}
                loop
                loopDelay={7000}
                promptMode="build"
                className="w-full"
              />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS SECTION ─── */}
      <section className="relative py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-terminal-text mb-4">
              What Developers Are Saying
            </h2>
            <p className="text-terminal-dim">Real feedback from the community</p>
          </ScrollReveal>

          <TestimonialsChat />
        </div>
      </section>

      {/* ─── FINAL CTA SECTION ─── */}
      <section className="relative py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-terminal-text mb-6">
              Ready to{' '}
              <span className="text-gradient-accent">dive deeper?</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <p className="text-terminal-dim text-lg mb-8">
              One command. Infinite possibilities.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <div className="flex flex-col items-center gap-6">
              {installCmd && (
                <div className="flex items-center gap-3 bg-terminal-panel/80 border border-terminal-border/50 rounded-xl px-6 py-4 max-w-fit">
                  <span className="text-terminal-green font-mono text-lg">&gt;_</span>
                  <code className="font-mono text-base sm:text-lg text-terminal-text">
                    {installCmd}
                  </code>
                  <CopyButton text={installCmd} className="ml-2" />
                </div>
              )}

              <GlowButton onClick={() => setModalOpen(true)} className="animate-glow-pulse px-8 py-4 text-base">
                <Zap className="w-5 h-5" />
                Get Started Now
              </GlowButton>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.5}>
            <p className="mt-12 font-mono text-sm text-terminal-dim/50">
              Keep on Improving
            </p>
          </ScrollReveal>
        </div>
      </section>
    </main>
  )
}
