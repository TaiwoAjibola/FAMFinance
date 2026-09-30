import { useRef } from 'react'

export function PasscodeInput({
  value,
  onChange,
  onComplete,
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    const next = digits.slice()
    next[i] = digit
    const joined = next.join('')
    onChange(joined)
    const focusTarget = Math.min(i + 1, 5)
    inputsRef.current[focusTarget]?.focus()
    if (joined.length === 6 && !joined.includes(' ')) onComplete?.(joined)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = digits.slice()
      if (next[i]) {
        next[i] = ''
      } else if (i > 0) {
        next[i - 1] = ''
        inputsRef.current[i - 1]?.focus()
      }
      onChange(next.join('').trimEnd())
    }
    if (e.key === 'ArrowLeft' && i > 0) inputsRef.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) inputsRef.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      onChange(pasted)
      inputsRef.current[Math.min(pasted.length, 5)]?.focus()
      if (pasted.length === 6) onComplete?.(pasted)
    }
  }

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="input-field h-12 w-full text-center text-lg font-semibold"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  )
}
