'use client'

import { useId } from 'react'
import type { CompetitionAward } from '@/lib/utils/studentAchievement'

const metals = {
  gold: ['#fff3b1', '#e8b74e', '#a46b12'],
  silver: ['#f6fbff', '#becddb', '#71869d'],
  bronze: ['#ffdbc2', '#cc9366', '#845230'],
}

export function MedalBadge({ award }: { award: CompetitionAward }) {
  const id = `medal-${useId().replace(/:/g, '')}`
  const colors = metals[award.metal]
  return (
    <svg
      viewBox="0 0 112 132"
      className="h-[96px] w-[78px] shrink-0 drop-shadow-lg min-[360px]:h-[116px] min-[360px]:w-[98px] sm:h-[132px] sm:w-28"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset="0.5" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
      </defs>
      <path d="M24 4h23l19 41-23 11L24 4Z" fill="#ed7933" />
      <path d="M65 4h23L69 56 46 45 65 4Z" fill="#f8b280" />
      <path d="M31 5h6l19 43-6 3L31 5Z" fill="#fff" opacity=".35" />
      <circle cx="56" cy="77" r="45" fill={`url(#${id})`} />
      <circle
        cx="56"
        cy="77"
        r="38"
        fill="none"
        stroke={colors[0]}
        strokeWidth="1.5"
        opacity=".9"
      />
      <circle cx="56" cy="77" r="33" fill="none" stroke={colors[2]} opacity=".35" />
      <path
        d="M33 62c-9 14-6 29 5 38M79 62c9 14 6 29-5 38"
        stroke={colors[2]}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity=".65"
      />
      <path
        d="m32 71-7-3m5 10-6 1m8 7-5 4m51-19 7-3m-5 10 6 1m-8 7 5 4"
        stroke={colors[2]}
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".65"
      />
      <text
        x="56"
        y="90"
        textAnchor="middle"
        fontSize="38"
        fontWeight="800"
        fill="#24374b"
        fontFamily="inherit"
      >
        {award.place}
      </text>
      <path
        d="m56 47 2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1 2-4Z"
        fill={colors[2]}
        opacity=".7"
      />
    </svg>
  )
}
