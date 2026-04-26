import { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  dot?: boolean
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  secondary: 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-200',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-500',
  secondary: 'bg-gray-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  purple: 'bg-purple-500'
}

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'md',
  dot = false,
  className = '' 
}: BadgeProps) {
  const sizeStyles = size === 'sm' 
    ? 'px-2 py-0.5 text-xs' 
    : 'px-2.5 py-1 text-xs'

  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${variantStyles[variant]}
        ${sizeStyles}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  )
}
