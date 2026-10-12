import { Component, ErrorInfo, ReactNode } from 'react';
import { IconAlertTriangle, IconRefresh, IconHome } from '@tabler/icons-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="page page-center min-vh-100 d-flex flex-column align-items-center justify-content-center p-3">
          <div className="card saas-card shadow-sm mx-auto p-4 text-center border-0" style={{ maxWidth: '540px' }}>
            <div className="p-3 bg-danger-subtle text-danger rounded-circle d-inline-flex mx-auto mb-3">
              <IconAlertTriangle size={36} stroke={2} />
            </div>
            <h2 className="text-dark fw-bold mb-2 h4">Something went wrong</h2>
            <p className="text-secondary small mb-3">
              An unexpected application error occurred. You can reload the page or return to the workspace dashboard.
            </p>
            {this.state.error && (
              <div className="bg-light p-3 rounded-2 text-start small font-monospace mb-4 text-break border text-muted">
                {this.state.error.message}
              </div>
            )}
            <div className="d-flex justify-content-center gap-2">
              <button
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                onClick={() => window.location.reload()}
              >
                <IconRefresh size={16} stroke={2} />
                <span>Reload Page</span>
              </button>
              <button
                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
              >
                <IconHome size={16} stroke={2} />
                <span>Go Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
