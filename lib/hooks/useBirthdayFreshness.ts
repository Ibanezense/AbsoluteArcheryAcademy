"use client"

import { useEffect, useRef, useState } from 'react'
import type { BirthdaySnapshot } from '@/lib/contracts/studentBirthday'

/** A server-issued deadline; the device wall clock never decides the birthday. */
export function useBirthdayFreshness(scope: string, snapshot: BirthdaySnapshot | undefined, onExpire?: () => void): boolean {
  const [, setTick] = useState(0)
  const gate = useRef({ scope, after: -Infinity })
  const callback = useRef(onExpire)
  const notified = useRef<string | null>(null)
  callback.current = onExpire
  if (gate.current.scope !== scope) gate.current = { scope, after: performance.now() }

  useEffect(() => {
    function suspend() {
      gate.current.after = performance.now()
      setTick(value => value + 1)
    }
    // Invalidate on return as well: a background request cannot authorize visible data.
    function visibility() { suspend() }
    function restored(event: PageTransitionEvent) { if (event.persisted) suspend() }
    window.addEventListener('focus', suspend)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('focus', suspend)
      window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  const requestStarted = snapshot?.request_started_at_monotonic ?? snapshot?.received_at_monotonic
  const received = snapshot?.received_at_monotonic
  const recovery = useRef<string | null>(null)
  useEffect(() => {
    // A response from before suspension is not fresh just because it arrived afterwards.
    if (requestStarted === undefined || received === undefined || requestStarted >= gate.current.after) return
    const key = `${scope}:${gate.current.after}:${received}`
    if (recovery.current !== key) {
      recovery.current = key
      callback.current?.()
    }
  }, [scope, requestStarted, received])

  const deadline = snapshot?.deadline_monotonic
  useEffect(() => {
    if (deadline === undefined) return
    const key = `${scope}:${deadline}`
    const timer = setTimeout(() => {
      setTick(value => value + 1)
      if (notified.current !== key) {
        notified.current = key
        callback.current?.()
      }
    }, Math.max(0, deadline - performance.now()))
    return () => clearTimeout(timer)
  }, [scope, deadline])

  return !!snapshot
    && notified.current !== `${scope}:${snapshot.deadline_monotonic}`
    && (snapshot.request_started_at_monotonic ?? snapshot.received_at_monotonic) >= gate.current.after
    && snapshot.deadline_monotonic > performance.now()
    && document.visibilityState !== 'hidden'
}
