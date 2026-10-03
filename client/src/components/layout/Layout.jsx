import { Outlet, useLocation } from 'react-router-dom';
import { useState, Suspense } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import PageErrorBoundary from '../common/PageErrorBoundary';

const Layout = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const location = useLocation();

    return (
        <div className="app-layout">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <div className={`main-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
                <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
                <main className="page-container">
                    {/* Pages load on first visit; keep the shell while they download */}
                    <PageErrorBoundary key={location.pathname}>
                        <Suspense fallback={<div className="page-loading"><div className="loading-spinner"></div></div>}>
                            <Outlet />
                        </Suspense>
                    </PageErrorBoundary>
                </main>
            </div>
        </div>
    );
};

export default Layout;
