import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Monitor, FolderOpen, Download, Play, Check, Apple, Terminal } from 'lucide-react'
import CopyButton from './CopyButton'
import { detectPlatform, getInstallCommand, type Platform } from '../lib/platform'

const ides = [
  { name: 'VS Code', icon: Monitor },
  { name: 'Cursor', icon: Monitor },
  { name: 'IntelliJ', icon: Monitor },
  { name: 'Vim/NeoVim', icon: Terminal },
  { name: 'Terminal', icon: Terminal },
]

const osOptions: { platform: Platform; label: string; icon: typeof Apple }[] = [
  { platform: 'mac', label: 'macOS', icon: Apple },
  { platform: 'linux', label: 'Linux', icon: Terminal },
  { platform: 'windows', label: 'Windows', icon: Monitor },
]

interface GetStartedModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GetStartedModal({ isOpen, onClose }: GetStartedModalProps) {
  const [selectedIde, setSelectedIde] = useState('VS Code')
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('mac')
  const [installCmd, setInstallCmd] = useState('')

  useEffect(() => {
    if (isOpen) {
      const detected = detectPlatform()
      const platform = detected === 'unknown' ? 'mac' : detected
      setSelectedPlatform(platform)
    }
  }, [isOpen])

  useEffect(() => {
    const cmd = getInstallCommand(window.location.origin, selectedPlatform)
    setInstallCmd(cmd)
  }, [selectedPlatform])

  const toggleStep = (step: number) => {
    setCompletedSteps(prev =>
      prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step]
    )
  }

  const steps = [
    {
      number: 1,
      title: 'Open your terminal',
      subtitle: 'in your favorite IDE',
      icon: Monitor,
      content: (
        <div className="flex flex-wrap gap-2 mt-3">
          {ides.map(ide => (
            <button
              key={ide.name}
              onClick={() => setSelectedIde(ide.name)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                selectedIde === ide.name
                  ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                  : 'bg-terminal-panel text-terminal-dim border border-terminal-border/30 hover:border-terminal-border'
              }`}
            >
              <ide.icon className="w-3.5 h-3.5" />
              {ide.name}
            </button>
          ))}
        </div>
      ),
    },
    {
      number: 2,
      title: 'Navigate to your project',
      subtitle: 'directory',
      icon: FolderOpen,
      content: (
        <div className="mt-3 flex items-center justify-between bg-terminal-panel border border-terminal-border/50 rounded-lg px-4 py-2.5 font-mono text-sm">
          <code className="text-terminal-cyan">cd /path/to/your-project</code>
          <CopyButton text="cd /path/to/your-project" />
        </div>
      ),
    },
    {
      number: 3,
      title: 'Install KOI',
      subtitle: 'via install script (handles Bun + postinstall)',
      icon: Download,
      content: (
        <div className="mt-3 space-y-3">
          {/* OS selector */}
          <div className="flex gap-2">
            {osOptions.map(opt => (
              <button
                key={opt.platform}
                onClick={() => setSelectedPlatform(opt.platform)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                  selectedPlatform === opt.platform
                    ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                    : 'bg-terminal-panel text-terminal-dim border border-terminal-border/30 hover:border-terminal-border'
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
          {/* Install command */}
          <div className="flex items-center justify-between bg-terminal-panel border border-terminal-border/50 rounded-lg px-4 py-2.5 font-mono text-sm">
            <code className="text-terminal-accent">{installCmd}</code>
            <CopyButton text={installCmd} />
          </div>
          <p className="text-xs text-terminal-dim">
            This script auto-installs Bun if missing, installs KOI globally,
            and handles postinstall script permissions.
          </p>
        </div>
      ),
    },
    {
      number: 4,
      title: 'Run KOI',
      subtitle: 'and start improving',
      icon: Play,
      content: (
        <div className="mt-3 flex items-center justify-between bg-terminal-panel border border-terminal-border/50 rounded-lg px-4 py-2.5 font-mono text-sm">
          <code className="text-terminal-green">koi</code>
          <CopyButton text="koi" />
        </div>
      ),
    },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-lg bg-terminal-panel/95 backdrop-blur-xl border border-terminal-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-terminal-border/30">
              <h2 className="text-lg font-semibold text-terminal-text">Get Started with KOI</h2>
              <button
                onClick={onClose}
                className="text-terminal-dim hover:text-terminal-text transition-colors p-1 rounded-md hover:bg-terminal-border/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Steps */}
            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="relative"
                >
                  {/* Connector line */}
                  {i < steps.length - 1 && (
                    <div className="absolute left-[19px] top-10 w-px h-[calc(100%+20px)] bg-terminal-border/30" />
                  )}

                  <div className="flex gap-4">
                    {/* Step number */}
                    <button
                      onClick={() => toggleStep(step.number)}
                      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                        completedSteps.includes(step.number)
                          ? 'bg-terminal-success/20 text-terminal-success border border-terminal-success/40'
                          : 'bg-terminal-panel border border-terminal-border text-terminal-dim'
                      }`}
                    >
                      {completedSteps.includes(step.number) ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        step.number
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <step.icon className="w-4 h-4 text-terminal-accent" />
                        <h3 className="text-sm font-medium text-terminal-text">{step.title}</h3>
                      </div>
                      <p className="text-xs text-terminal-dim mt-0.5">{step.subtitle}</p>
                      {step.content}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-terminal-border/30 bg-terminal-bg/30">
              <p className="text-xs text-terminal-dim text-center">
                Need help? Check out the{' '}
                <a href="#/docs" className="text-terminal-accent cursor-pointer hover:underline">Documentation</a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
