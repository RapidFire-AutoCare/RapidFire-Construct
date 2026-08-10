import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
  resets: number
}

/**
 * Canvas/postprocessing can throw on first init (esp. Safari / cold WebGL).
 * Auto-remount a couple times so a warm path recovers without a full page refresh.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resets: 0 }
  private retryTimer = 0

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[SceneErrorBoundary]', error.message, info.componentStack)
  }

  componentDidUpdate(_: Props, prev: State) {
    if (this.state.error && !prev.error && this.state.resets < 2) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(() => {
        this.setState((s) => ({ error: null, resets: s.resets + 1 }))
      }, 160)
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.retryTimer)
  }

  render() {
    if (this.state.error) return null
    return <div key={this.state.resets}>{this.props.children}</div>
  }
}
