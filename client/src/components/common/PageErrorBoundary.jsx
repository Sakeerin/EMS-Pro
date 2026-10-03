import { Component } from 'react';

// Keeps the sidebar and header on screen when a page fails to render or its
// code can't be downloaded (e.g. a network blip), instead of blanking the app.
// Give it a key that changes on navigation so moving to another page retries.
class PageErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error('Page failed to load:', error);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div className="card">
                <div className="card-body">
                    <h3 className="card-title">This page couldn&apos;t be loaded</h3>
                    <p className="text-secondary" style={{ margin: '8px 0 16px' }}>
                        Check your connection and reload. If it keeps happening, contact your administrator.
                    </p>
                    <button className="btn btn-primary" onClick={() => window.location.reload()}>
                        Reload
                    </button>
                </div>
            </div>
        );
    }
}

export default PageErrorBoundary;
