import * as React from 'react';
import { Button } from '@/components/ui/button';
import { log } from '@/lib/log';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Honest error boundary — UX-DR30: no apology theatre.
 * Catches render-time exceptions and surfaces a minimal recovery affordance.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error('react.error-boundary', {
      message: error.message,
      componentStack: info.componentStack ?? '',
    });
  }

  private readonly handleReload = (): void => {
    location.reload();
  };

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">Something went wrong.</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Reload the page to try again. Your worklogs in Jira are unaffected.
          </p>
          <div className="mt-6">
            <Button variant="primary" onClick={this.handleReload}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
