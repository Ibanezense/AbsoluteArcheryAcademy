'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { DailyOccupancy } from '@/lib/hooks/useDashboardStats'

interface WeeklyOccupancyChartProps {
  data: DailyOccupancy[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-textsec/20 rounded-lg p-3 shadow-lg">
        <p className="text-textpri font-medium">{payload[0].payload.day}</p>
        <p className="text-accent text-sm">
          {payload[0].value.toFixed(0)}% ocupación
        </p>
      </div>
    )
  }
  return null
}

export default function WeeklyOccupancyChart({ data }: WeeklyOccupancyChartProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <div className="h-[300px] flex items-center justify-center text-textsec">Cargando gráfico...</div>
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-textpri mb-4">Ocupación Semanal</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis
            dataKey="day"
            stroke="#A0A0A0"
            tick={{ fill: '#A0A0A0' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(229, 62, 95, 0.1)' }} />
          <Bar
            dataKey="ocupacion_pct"
            fill="#E53E5F"
            radius={[4, 4, 0, 0]}
            barSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
