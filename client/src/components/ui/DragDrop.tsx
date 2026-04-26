import { useState, ReactNode } from 'react'

interface DraggableProps {
  id: string
  type: string
  data: Record<string, unknown>
  children: ReactNode
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function Draggable({ id, type, data, children, onDragStart, onDragEnd }: DraggableProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id, type, data }))
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
    onDragStart?.()
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    onDragEnd?.()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-50' : ''}`}
    >
      {children}
    </div>
  )
}

interface DropZoneProps {
  accept: string[]
  onDrop: (data: { id: string; type: string; data: Record<string, unknown> }) => void
  children: ReactNode
  className?: string
  highlightClassName?: string
}

export function DropZone({ accept, onDrop, children, className = '', highlightClassName = 'ring-2 ring-electric-blue ring-offset-2' }: DropZoneProps) {
  const [isOver, setIsOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only set isOver to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsOver(false)
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (accept.includes(data.type)) {
        onDrop(data)
      }
    } catch (err) {
      console.error('Drop error:', err)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`transition-all duration-200 ${className} ${isOver ? highlightClassName : ''}`}
    >
      {children}
    </div>
  )
}
