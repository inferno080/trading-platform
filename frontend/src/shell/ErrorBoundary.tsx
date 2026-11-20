import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/** Catches render and chunk-loading errors in its subtree and shows `fallback` instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // The fallback hides what went wrong from the user, so say it in the console for whoever is debugging.
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("A view failed to render:", error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
