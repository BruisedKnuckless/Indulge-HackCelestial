import React from 'react';
import { Map, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * MapErrorBoundary — isolates any runtime rendering or Google Maps JavaScript exceptions
 * so that a failure in the map canvas NEVER crashes or blanks the entire page.
 */
export default class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MapErrorBoundary captured a map runtime failure:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-line bg-surface-alt flex flex-col items-center justify-center p-8 text-center select-none shadow-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-surface border border-line flex items-center justify-center shadow-sm">
            <Map size={24} className="text-ink-soft" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold mb-2">
            <AlertTriangle size={13} className="shrink-0" />
            <span>Map Render Notice</span>
          </div>

          <h3 className="text-base font-semibold text-ink mb-1">Interactive map unavailable</h3>
          <p className="text-xs text-ink-soft max-w-sm mx-auto mb-5 leading-relaxed">
            A display issue occurred while initializing the map canvas. Nearby listings, distance filters, and booking options remain active on this page.
          </p>

          <button
            onClick={this.handleRetry}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            <RefreshCw size={12} className="shrink-0" />
            <span>Retry map</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
