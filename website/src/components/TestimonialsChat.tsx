import { useState, useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'

interface ChatMessage {
  text: string
  color: string
}

const messages: ChatMessage[] = [
  { text: "KOI's CCE is unreal. It genuinely understands my whole codebase.", color: '#ff79c6' },
  { text: 'Plan mode saved us. Zero-risk reviews before touching production.', color: '#60a5fa' },
  { text: 'The ink-wash TUI hits different.', color: '#00ff99' },
  { text: 'Skills are a game changer. Drop a SKILL.md and KOI just knows.', color: '#fbbf24' },
  { text: 'Local-only embeddings. My code never leaves my machine.', color: '#00d9ff' },
  { text: "Switched from Claude Code. KOI's context depth is another level.", color: '#bd93f9' },
  { text: 'Session forking is genius.', color: '#ff79c6' },
  { text: 'Subagents in parallel cut my refactor time in half.', color: '#60a5fa' },
  { text: 'The cost tracker built into the TUI is so practical.', color: '#00ff99' },
  { text: 'MCP support means my custom tools just work.', color: '#fbbf24' },
  { text: 'Finally an agent that gets my architecture without me explaining it.', color: '#00d9ff' },
  { text: 'YOLO mode + Plan mode combo is perfect. Safe when needed, fast when trusted.', color: '#bd93f9' },
]

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-terminal-panel/50 border border-terminal-border/20 w-fit">
      <motion.span
        className="w-1 h-1 rounded-full bg-terminal-dim"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
      />
      <motion.span
        className="w-1 h-1 rounded-full bg-terminal-dim"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
      />
      <motion.span
        className="w-1 h-1 rounded-full bg-terminal-dim"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
      />
    </div>
  )
}

function Bubble({ msg, index }: { msg: ChatMessage; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-30px' })
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => setRevealed(true), 800 + Math.random() * 500)
      return () => clearTimeout(timer)
    }
  }, [isInView])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
      className="break-inside-avoid mb-3"
    >
      <div className="flex gap-2">
        <div className="shrink-0 mt-2">
          <div
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: msg.color, boxShadow: `0 0 5px ${msg.color}70` }}
          />
        </div>
        <div className="flex-1 min-w-0">
          {!revealed ? (
            <TypingIndicator />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="px-3 py-2 rounded-xl text-sm leading-snug bg-terminal-panel/30 border border-terminal-border/20 inline-block"
            >
              <span className="text-terminal-text/80">{msg.text}</span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function TestimonialsChat() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: '-60px' })

  return (
    <div className="max-w-4xl mx-auto" ref={containerRef}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        className="flex items-center gap-2 mb-8 pb-3 border-b border-terminal-border/15"
      >
        {Array.from(new Set(messages.map(m => m.color))).slice(0, 6).map((c, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
        ))}
        <span className="text-[10px] text-terminal-dim/40 ml-1">feedback</span>
      </motion.div>

      {/* Masonry columns */}
      <div className="columns-1 sm:columns-2 gap-3">
        {messages.map((msg, i) => (
          <Bubble key={i} msg={msg} index={i} />
        ))}
      </div>

      {/* Final typing */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: messages.length * 0.04 + 0.3 }}
        className="flex gap-2 mt-4"
      >
        <div className="shrink-0 mt-2">
          <div className="w-1 h-1 rounded-full bg-terminal-accent" style={{ boxShadow: '0 0 5px #ff79c660' }} />
        </div>
        <TypingIndicator />
      </motion.div>
    </div>
  )
}
