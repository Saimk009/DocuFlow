import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Changing this value resets the boundary (e.g. pass the route pathname). */
  resetKey?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface to the console for debugging; a real app would report this.
    console.error('Uncaught error in component tree:', error, info)
  }

  handleReset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-surface-50">
            Something went wrong
          </h1>
          <p className="mt-1.5 text-sm text-surface-muted">
            {this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={this.handleReset} className="btn-primary">
            Try Again
          </button>
          <button
            onClick={() => {
              window.location.href = '/'
            }}
            className="btn-outline"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }
}
