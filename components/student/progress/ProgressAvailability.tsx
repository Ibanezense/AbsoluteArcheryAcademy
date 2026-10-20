'use client'

import { createContext, useContext } from 'react'
export const ProgressAvailabilityContext = createContext(false)
export function useProgressAvailability() {
  return useContext(ProgressAvailabilityContext)
}
