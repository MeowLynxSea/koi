import { useState, useEffect, useRef, useCallback } from 'react'

export type AgentMode = 'build' | 'ask' | 'plan'

export interface TerminalLine {
  text: string
  type: 'command' | 'output' | 'agent' | 'error' | 'prompt'
  mode?: AgentMode
  delay?: number
}

interface TerminalProps {
  lines: TerminalLine[]
  loop?: boolean
  loopDelay?: number
  className?: string
  showPrompt?: boolean
  promptMode?: AgentMode
  typingSpeed?: number
}

const MODE_CONFIG: Record<AgentMode, { prefix: string; color: string; cursorColor: string }> = {
  build: { prefix: 'Build > ', color: 'text-terminal-green', cursorColor: 'bg-terminal-green' },
  ask:   { prefix: 'Ask > ',   color: 'text-terminal-warning', cursorColor: 'bg-terminal-warning' },
  plan:  { prefix: 'Plan > ',  color: 'text-terminal-info', cursorColor: 'bg-terminal-info' },
}

export default function Terminal({
  lines,
  loop = false,
  loopDelay = 3000,
  className = '',
  showPrompt = true,
  promptMode = 'build',
  typingSpeed = 30,
}: TerminalProps) {
  const [displayedLines, setDisplayedLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState(0)
  const [currentChar, setCurrentChar] = useState(0)
  const [isTyping, setIsTyping] = useState(true)
  const [showCursor, setShowCursor] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(() => {
    setDisplayedLines([])
    setCurrentLine(0)
    setCurrentChar(0)
    setIsTyping(true)
  }, [])

  useEffect(() => {
    if (!isTyping) {
      if (loop) {
        const timer = setTimeout(reset, loopDelay)
        return () => clearTimeout(timer)
      }
      return
    }

    if (currentLine >= lines.length) {
      setIsTyping(false)
      return
    }

    const line = lines[currentLine]
    const text = line.text

    if (currentChar >= text.length) {
      const timer = setTimeout(() => {
        setDisplayedLines(prev => [...prev, text])
        setCurrentLine(prev => prev + 1)
        setCurrentChar(0)
      }, line.delay || 200)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setCurrentChar(prev => prev + 1)
    }, typingSpeed + Math.random() * 15)

    return () => clearTimeout(timer)
  }, [currentLine, currentChar, isTyping, lines, loop, loopDelay, reset, typingSpeed])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [displayedLines, currentChar, currentLine])

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 530)
    return () => clearInterval(interval)
  }, [])

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'command': return 'text-terminal-text'
      case 'output': return 'text-terminal-dim'
      case 'agent': return 'text-terminal-accent'
      case 'error': return 'text-terminal-rose'
      case 'prompt': return 'text-terminal-text'
      default: return 'text-terminal-text'
    }
  }

  const getPrefix = (line: TerminalLine) => {
    switch (line.type) {
      case 'command': return '$ '
      case 'agent': return '[KOI] '
      case 'error': return '[!] '
      case 'prompt': {
        const mode = line.mode || 'build'
        return MODE_CONFIG[mode].prefix
      }
      default: return ''
    }
  }

  const getPromptColor = (line: TerminalLine) => {
    if (line.type !== 'prompt') return ''
    const mode = line.mode || 'build'
    return MODE_CONFIG[mode].color
  }

  return (
    <div className={`font-mono text-sm rounded-xl overflow-hidden terminal-shadow ${className}`}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-terminal-panel border-b border-terminal-border">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="text-xs text-terminal-dim ml-2">koi — zsh</span>
        {lines.some(l => l.mode) && (
          <div className="ml-auto flex gap-1.5">
            {(['build', 'ask', 'plan'] as AgentMode[]).map(m => {
              const active = lines.some(l => l.mode === m) || (showPrompt && promptMode === m)
              return (
                <span
                  key={m}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${
                    active
                      ? m === 'build' ? 'bg-terminal-green/20 text-terminal-green'
                        : m === 'ask' ? 'bg-terminal-warning/20 text-terminal-warning'
                        : 'bg-terminal-info/20 text-terminal-info'
                      : 'bg-terminal-border/20 text-terminal-dim/40'
                  }`}
                >
                  {m}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Terminal body */}
      <div
        ref={containerRef}
        className="bg-terminal-bg/95 px-4 py-4 min-h-[200px] max-h-[400px] overflow-y-auto"
      >
        {displayedLines.map((line, i) => {
          const srcLine = lines[i]!
          return (
            <div key={i} className={`${getLineColor(srcLine.type)} ${getPromptColor(srcLine)} mb-1`}>
              <span className="opacity-60">{getPrefix(srcLine)}</span>
              {line}
            </div>
          )
        })}

        {/* Currently typing line */}
        {isTyping && currentLine < lines.length && (
          <div className={`${getLineColor(lines[currentLine].type)} ${getPromptColor(lines[currentLine])} mb-1`}>
            <span className="opacity-60">{getPrefix(lines[currentLine])}</span>
            {lines[currentLine].text.slice(0, currentChar)}
            {showCursor && (
              <span className="inline-block w-2 h-4 bg-terminal-accent ml-0.5 animate-cursor-blink" />
            )}
          </div>
        )}

        {/* Final cursor */}
        {!isTyping && showPrompt && (
          <div className={MODE_CONFIG[promptMode].color}>
            <span className="opacity-60">{MODE_CONFIG[promptMode].prefix}</span>
            {showCursor && (
              <span className={`inline-block w-2 h-4 ml-0.5 animate-cursor-blink ${MODE_CONFIG[promptMode].cursorColor}`} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
