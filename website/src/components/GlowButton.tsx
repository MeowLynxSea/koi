import { motion } from 'framer-motion'

interface GlowButtonProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  variant?: 'primary' | 'secondary'
}

export default function GlowButton({ children, onClick, className = '', variant = 'primary' }: GlowButtonProps) {
  const baseClasses = variant === 'primary'
    ? 'bg-terminal-accent/10 border-terminal-accent/50 text-terminal-accent hover:bg-terminal-accent/20'
    : 'bg-terminal-panel border-terminal-border text-terminal-text hover:border-terminal-dim'

  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`relative px-6 py-3 rounded-lg border font-medium text-sm transition-all duration-300 overflow-hidden group ${baseClasses} ${className}`}
    >
      {/* Glow effect */}
      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <span className={`absolute inset-0 ${variant === 'primary' ? 'bg-terminal-accent/5' : 'bg-white/5'}`} />
      </span>
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </motion.button>
  )
}
