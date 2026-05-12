interface TestimonialCardProps {
  quote: string
  author: string
  role: string
  avatar?: string
}

export default function TestimonialCard({ quote, author, role }: TestimonialCardProps) {
  return (
    <div className="w-[320px] shrink-0 bg-terminal-panel/50 backdrop-blur-sm border border-terminal-border/40 rounded-xl p-5 hover:border-terminal-border/70 transition-colors">
      <p className="text-sm text-terminal-text/90 leading-relaxed mb-4">"{quote}"</p>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-terminal-accent to-terminal-info flex items-center justify-center text-xs font-bold text-white">
          {author.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <p className="text-sm font-medium text-terminal-text">{author}</p>
          <p className="text-xs text-terminal-dim">{role}</p>
        </div>
      </div>
    </div>
  )
}
