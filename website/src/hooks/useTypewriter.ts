import { useState, useEffect, useCallback } from 'react'

interface UseTypewriterOptions {
  text: string
  speed?: number
  delay?: number
  onComplete?: () => void
}

export function useTypewriter({ text, speed = 40, delay = 0, onComplete }: UseTypewriterOptions) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)

  const start = useCallback(() => {
    setStarted(true)
    setDisplayed('')
    setDone(false)
  }, [])

  useEffect(() => {
    if (!started) return

    let timeout: ReturnType<typeof setTimeout>
    let index = 0

    const typeNext = () => {
      if (index < text.length) {
        setDisplayed(text.slice(0, index + 1))
        index++
        timeout = setTimeout(typeNext, speed + Math.random() * 20)
      } else {
        setDone(true)
        onComplete?.()
      }
    }

    timeout = setTimeout(typeNext, delay)

    return () => clearTimeout(timeout)
  }, [started, text, speed, delay, onComplete])

  return { displayed, done, start }
}
