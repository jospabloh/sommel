import React from 'react';
import { Button } from '@/components/ui/button';

// Without this, any error while drawing a screen leaves it blank with no way
// out (2026-10-14). The rest of the app (menu, session) keeps working.
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-4" role="alert">
        <h2 className="text-lg font-semibold">Esta pantalla tuvo un error</h2>
        <p className="text-sm text-muted-foreground">
          Lo que ya guardaste no se perdió. Intenta de nuevo; si se repite, avisa a soporte con lo que estabas haciendo.
        </p>
        <p className="text-xs text-muted-foreground break-words">{String(this.state.error?.message || this.state.error)}</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>Volver a intentar</Button>
          <Button onClick={() => window.location.reload()}>Recargar</Button>
        </div>
      </div>
    );
  }
}
