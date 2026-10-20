'use client'

import { createContext, useContext } from 'react'
export const ProgressAvailabilityContext = createContext(false)
export const CompetitionAvailabilityContext = createContext(false)
export function useCompetitionAvailability() {
  return useContext(CompetitionAvailabilityContext)
}
export function useProgressAvailability() {
  return useContext(ProgressAvailabilityContext)
}
