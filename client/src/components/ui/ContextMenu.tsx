import { useState, useEffect, useRef, ReactNode } from 'react'

interface MenuItem {
  label: string
  icon?: ReactNode
  onClick?: () => void
  divider?: boolean
  danger?: boolean
  disabled?: boolean
  shortcut?: string
}

interface ContextMenuProps {
  children: ReactNode
  items: MenuItem[]
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    
    // Calculate position, ensuring menu stays within viewport
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - (items.length * 40 + 20))
    
    setPosition({ x, y })
    setIsOpen(true)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <>
      <div ref={containerRef} onContextMenu={handleContextMenu}>
        {children}
      </div>
      
      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[200px] bg-card border border-border rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: position.x, top: position.y }}
        >
          {items.map((item, index) => (
            item.divider ? (
              <div key={index} className="h-px bg-border my-1.5 mx-2" />
            ) : (
              <button
                key={index}
                onClick={() => {
                  if (!item.disabled && item.onClick) {
                    item.onClick()
                    setIsOpen(false)
                  }
                }}
                disabled={item.disabled}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors
                  ${item.disabled 
                    ? 'text-muted-foreground/50 cursor-not-allowed' 
                    : item.danger 
                      ? 'text-red-500 hover:bg-red-500/10' 
                      : 'text-foreground hover:bg-secondary'
                  }`}
              >
                {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className="text-xs text-muted-foreground ml-4">{item.shortcut}</span>
                )}
              </button>
            )
          ))}
        </div>
      )}
    </>
  )
}

// Quick action toast for feedback
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const ToastComponent = toast ? (
    <div className={`fixed bottom-4 right-4 z-[200] px-4 py-3 rounded-xl shadow-lg border animate-in slide-in-from-bottom-4 duration-200
      ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : ''}
      ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400' : ''}
      ${toast.type === 'info' ? 'bg-electric-blue/10 border-electric-blue/20 text-electric-blue' : ''}
    `}>
      {toast.message}
    </div>
  ) : null

  return { showToast, ToastComponent }
}
