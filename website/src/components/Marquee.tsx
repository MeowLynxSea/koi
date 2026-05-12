import type { ReactNode } from 'react'

interface MarqueeProps {
  children: ReactNode
  reverse?: boolean
  className?: string
}

export default function Marquee({ children, reverse = false, className = '' }: MarqueeProps) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div className={`flex gap-6 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}>
        <div className="flex gap-6 shrink-0">
          {children}
        </div>
        <div className="flex gap-6 shrink-0">
          {children}
        </div>
      </div>
    </div>
  )
}
