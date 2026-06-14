import { useEffect, useRef, useState } from 'react'

// A small accessible select replacement: styled trigger + popover list,
// closes on outside-click / Escape, arrow-key navigation when open.
export default function Dropdown({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  const current = options.find((o) => o.value === value)

  // Close when clicking anywhere outside the component.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Highlight the current value each time the list opens.
  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)))
  }, [open, value, options])

  const choose = (v) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return setOpen(false)
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(options[active].value)
    }
  }

  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className="dd-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="dd-value">{current?.label ?? '—'}</span>
        <svg className="dd-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="dd-panel" role="listbox" aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dd-option${o.value === value ? ' dd-option--selected' : ''}${i === active ? ' dd-option--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
