import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Shown above the error so the user knows which surface broke. */
  surface: string;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any thrown render error leaves the popup or side panel blank
 * and white. For an extension that reads as "it stopped working" rather than
 * "it hit a bug", and the report comes back with nothing to debug.
 *
 * A class component because React still has no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Goes to the extension's own console (chrome://extensions → Inspect), the
    // only place a user can retrieve it for a bug report. Nothing is sent off
    // the device.
    console.error(`[Tab-to-Task] ${this.props.surface} crashed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="space-y-3 p-4 text-slate-900 dark:text-slate-100">
        <h1 className="text-sm font-semibold">Something went wrong</h1>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Your saved tasks are safe — they live in browser storage, not in this view. Reopening
          usually fixes it.
        </p>
        <pre className="max-h-32 overflow-auto rounded-lg bg-slate-100 p-2 text-[11px] break-words whitespace-pre-wrap text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {error.message || String(error)}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
