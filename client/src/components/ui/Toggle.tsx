import { useState, useEffect } from 'react'

interface ToggleProps {
  enabled?: boolean
  onChange?: (enabled: boolean) => void
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

export function Toggle({ 
  enabled: controlledEnabled, 
  onChange, 
  size = 'md',
  disabled = false 
}: ToggleProps) {
  const [internalEnabled, setInternalEnabled] = useState(controlledEnabled ?? false)
  
  const enabled = controlledEnabled !== undefined ? controlledEnabled : internalEnabled

  useEffect(() => {
    if (controlledEnabled !== undefined) {
      setInternalEnabled(controlledEnabled)
    }
  }, [controlledEnabled])

  const handleToggle = () => {
    if (disabled) return
    const newValue = !enabled
    setInternalEnabled(newValue)
    onChange?.(newValue)
  }

  const sizes = {
    sm: { track: 'w-8 h-5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3.5' },
    md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
    lg: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' }
  }

  const { track, thumb, translate } = sizes[size]

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={handleToggle}
      className={`
        relative inline-flex shrink-0 cursor-pointer rounded-full 
        transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${track}
        ${enabled 
          ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' 
          : 'bg-gray-200 dark:bg-gray-700'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block rounded-full bg-white shadow-lg
          transform transition-transform duration-200 ease-in-out
          ${thumb}
          ${enabled ? translate : 'translate-x-0.5'}
        `}
        style={{ marginTop: '0.5px' }}
      />
    </button>
  )
}
