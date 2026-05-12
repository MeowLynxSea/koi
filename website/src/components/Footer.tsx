import { Link } from 'react-router-dom'
import { Terminal } from 'lucide-react'

const siteLinks = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
]

const legalLinks = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
]

const communityLinks = [
  { label: 'GitHub', href: '#', comingSoon: true },
]

export default function Footer() {
  return (
    <footer className="border-t border-terminal-border/30 bg-terminal-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-terminal-accent" />
              <span className="font-mono text-lg font-bold">KOI</span>
            </Link>
            <p className="text-sm text-terminal-dim">
              Keep on Improving.
            </p>
          </div>

          {/* Site */}
          <div>
            <h4 className="text-sm font-semibold text-terminal-text mb-4">Site</h4>
            <ul className="space-y-2">
              {siteLinks.map(link => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-terminal-dim hover:text-terminal-text transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-terminal-text mb-4">Legal</h4>
            <ul className="space-y-2">
              {legalLinks.map(link => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-terminal-dim hover:text-terminal-text transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-sm font-semibold text-terminal-text mb-4">Community</h4>
            <ul className="space-y-2">
              {communityLinks.map(link => (
                <li key={link.label}>
                  {link.comingSoon ? (
                    <span className="text-sm text-terminal-dim/50 cursor-default flex items-center gap-1">
                      {link.label}
                      <span className="text-[10px] px-1 py-0.5 rounded bg-terminal-border/20">Soon</span>
                    </span>
                  ) : (
                    <a href={link.href} className="text-sm text-terminal-dim hover:text-terminal-text transition-colors">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-terminal-border/20 text-center">
          <p className="text-xs text-terminal-dim">
            &copy; {new Date().getFullYear()} KOI. All rights reserved. Licensed under GPL-3.0.
          </p>
        </div>
      </div>
    </footer>
  )
}
