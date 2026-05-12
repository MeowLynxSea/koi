import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Code2, Menu, X, Terminal } from 'lucide-react'

const navLinks = [
  { label: 'Docs', href: '/docs' },
  { label: 'GitHub', href: '#', external: true, comingSoon: true },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location])

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-terminal-bg/80 backdrop-blur-xl border-b border-terminal-border/30'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <Terminal className="w-6 h-6 text-terminal-accent group-hover:text-terminal-cyan transition-colors" />
            <span className="font-mono text-xl font-bold text-terminal-text tracking-tight">
              KOI
            </span>
            <span className="hidden sm:inline-block w-2 h-4 bg-terminal-accent animate-cursor-blink ml-1" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <div key={link.label} className="relative group">
                {link.external ? (
                  <span className="text-sm text-terminal-dim hover:text-terminal-text transition-colors cursor-default flex items-center gap-1.5">
                    <Code2 className="w-4 h-4" />
                    {link.label}
                    {link.comingSoon && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-terminal-border/30 text-terminal-dim">
                        Soon
                      </span>
                    )}
                  </span>
                ) : (
                  <Link
                    to={link.href}
                    className="text-sm text-terminal-dim hover:text-terminal-text transition-colors"
                  >
                    {link.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-terminal-dim hover:text-terminal-text"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-terminal-bg/95 backdrop-blur-xl border-b border-terminal-border/30"
          >
            <div className="px-4 py-4 space-y-3">
              {navLinks.map(link => (
                <div key={link.label}>
                  {link.external ? (
                    <span className="text-sm text-terminal-dim flex items-center gap-2">
                      <Code2 className="w-4 h-4" />
                      {link.label}
                      {link.comingSoon && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-terminal-border/30">
                          Soon
                        </span>
                      )}
                    </span>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-sm text-terminal-dim hover:text-terminal-text block"
                    >
                      {link.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
