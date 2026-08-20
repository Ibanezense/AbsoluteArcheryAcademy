'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  failed: boolean
}

export default class MembershipRenewalPromptBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Membership renewal prompt failed:', error, info)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
