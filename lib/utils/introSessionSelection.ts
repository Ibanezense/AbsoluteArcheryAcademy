type IntroSessionOption = {
  session_id: string
}

export function resolveAvailableIntroSessionId(
  currentSessionId: string,
  sessions: IntroSessionOption[],
): string {
  if (sessions.some((session) => session.session_id === currentSessionId)) {
    return currentSessionId
  }

  return sessions[0]?.session_id ?? ''
}
