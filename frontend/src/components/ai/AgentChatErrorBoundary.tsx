// Error boundary wrapping AgentChat — catches React render errors without white-screening the page.
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  retryLabel?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AgentChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AgentChatErrorBoundary] Caught error:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-red-900 dark:text-red-100">
            {this.props.fallbackMessage ?? 'Something went wrong loading the AI chat.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center justify-center rounded-md h-10 px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 transition-colors"
          >
            {this.props.retryLabel ?? 'Try again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
