import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="page min-vh-100 d-flex flex-column">
      <Navbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
      <div className="d-flex flex-grow-1 position-relative">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="d-md-none position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50"
            style={{ zIndex: 1040 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className="page-wrapper flex-grow-1 p-3 p-md-4 p-lg-5 overflow-auto">
          <div className="container-xl p-0" style={{ maxWidth: '1240px' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
