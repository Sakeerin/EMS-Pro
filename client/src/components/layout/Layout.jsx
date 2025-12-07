import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <div className="app-layout">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <div className={`main-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
                <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
                <main className="page-container">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;
