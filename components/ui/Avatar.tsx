"use client"

import Image from 'next/image'

interface AvatarProps {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg'
}

export default function Avatar({ name, url, size = 'md', className = '' }: AvatarProps) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={64}
        height={64}
        unoptimized
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    )
  }

  // Generate initials from name
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('') || 'A'

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-white/10 grid place-items-center ${className}`}>
      <span className="font-semibold">{initials}</span>
    </div>
  )
}
